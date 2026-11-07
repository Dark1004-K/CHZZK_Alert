#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""검은사막 위키 "월드 우두머리 레이드" 시간표 이미지 OCR 판독기 (RapidOCR PP-OCRv5 mobile)

사용:
  1) 전체 판독:  python parse-timetable.py --image <png> --out <json> [--wiki-url URL]
  2) 변경 칸 재확인: python parse-timetable.py --image <png> --grid <1차 json> \
                      --cells <[{time,day}] json> --missing-times <HH:MM,...> --out <json>

설계 (update-boss-schedule.js와의 계약):
  - 보스명 사전은 "매 판독 전" 위키 목차(table_contents ol/li/a)에서 새로 추출한다.
  - 1차: 전체 이미지 OCR → 격자(행=시각, 열=요일 7열) 매핑.
  - 2차: 빈 칸이 있는 행만 가로 밴드로 재인식해 누락·오류를 채운다.
  - 3차: 누락된 머리글은 밴드 → 직접 크롭 순으로 채운다 (요일은 구조상 월~일 고정).
  - 빈칸 판정: 픽셀 잉크(배경 대비 밝은 픽셀)로 "진짜 빈칸"과 "인식 실패"를 구분한다.
    잉크가 있는데 읽지 못한 칸은 unread로 내보내 JS가 사람 확인으로 보낸다(오판 삭제 방지).
  - recheck 모드: 요청 칸만 (1) 셀 크롭 → (2) 행 밴드 순으로 집중 재인식하고,
    이미지에 없는 시각(행 삭제)은 좌측 시각 열 크롭으로 재확인한다.
"""
import argparse
import html
import io
import json
import os
import re
import sys
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import numpy as np
from PIL import Image
from rapidocr import RapidOCR, OCRVersion, ModelType

WIKI_URL_DEFAULT = "https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167"
DAYS = ["월", "화", "수", "목", "금", "토", "일"]  # 이미지 열 순서
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")
CELL_X_PAD = 50      # 열 중심 좌우 (열 간격 104px 기준)
INK_MIN = 6          # 이 픽셀 수 이상이면 "글자가 있음"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")


# ---------------------------------------------------------------- 위키 사전
def fetch_vocab(wiki_url):
    """위키 목차에서 보스명 사전을 추출한다 (매 판독 전 실행)."""
    req = urllib.request.Request(wiki_url, headers={
        "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")
    m = (re.search(r'<div class="table_contents">.*?</a>\s*</li>\s*</ol>', page, re.S)
         or re.search(r"<h3[^>]*>\s*목차\s*</h3>.*?</ol>", page, re.S))
    block = m.group(0) if m else page
    bosses = [html.unescape(t[1]).strip() for t in
              re.findall(r'<a href="#[^"]*"[^>]*>\s*(\d+)\.\s*([^<]+?)\s*</a>', block)]
    if not bosses:
        raise RuntimeError("위키 목차에서 보스명을 찾지 못함 (페이지 구조 변경?)")
    vocab = set(bosses)
    for b in bosses:            # "미루목 파괴자 오핀" → "오핀" 별칭
        parts = b.split()
        if len(parts) > 1:
            vocab.add(parts[-1])
    vocab.update(DAYS + ["출현시간"])
    return bosses, sorted(vocab)


def lev(a, b):
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if abs(la - lb) > 3:
        return 99
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        for j in range(1, lb + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return prev[lb]


def make_accept(vocab):
    """사전 통과 판정. 정확 일치 / 편집거리 1 고유 교정만 허용."""
    def accept(txt):
        if txt in vocab:
            return True, txt
        best, bd, cnt = None, 99, 0
        for v in vocab:
            d = lev(txt, v)
            if d < bd:
                bd, best, cnt = d, v, 1
            elif d == bd:
                cnt += 1
        if bd == 1 and cnt == 1:
            return True, best
        return False, txt
    return accept


def hdr_match(raw, ci, accept):
    """머리글: 요일 정확 / 거리1 고유 교정 / 표 구조(월~일 고정 순서) 활용."""
    if raw in DAYS:
        return raw
    fixed = accept(raw)[1]
    if fixed in DAYS:
        return fixed
    expected = DAYS[ci]
    if lev(raw, expected) == 1:
        return expected
    cands = [d for d in DAYS if lev(raw, d) == 1]
    return cands[0] if len(cands) == 1 else None


# ---------------------------------------------------------------- OCR 유틸
def make_engine():
    return RapidOCR(params={"Rec.lang_type": "korean",
                            "Rec.ocr_version": OCRVersion.PPOCRV5,
                            "Rec.model_type": ModelType.MOBILE})


def ocr_of(result):
    out = []
    if result is None or not getattr(result, "txts", None):
        return out
    for box, txt, sc in zip(result.boxes, result.txts, result.scores):
        out.append({"x": int(box[:, 0].mean()), "y": int(box[:, 1].mean()),
                    "raw": txt, "score": float(sc)})
    return out


def save_crop(im, box, scale, path):
    crop = im.crop(box)
    crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS).save(path)
    return path


# ---------------------------------------------------------------- 격자 기하
def cluster_lines(ys):
    """콘텐츠 토큰 y좌표를 줄(라인) 단위로 군집화. 줄 간격(~20px)보다 큰 갭(9px)으로 분리."""
    ys = sorted(ys)
    groups, cur = [], [ys[0]]
    for y in ys[1:]:
        if y - cur[-1] > 9:
            groups.append(cur)
            cur = [y]
        else:
            cur.append(y)
    groups.append(cur)
    return [float(np.mean(g)) for g in groups]


def build_rows(first):
    """시각 토큰 → 행(시각 + 콘텐츠 y군집). 줄 좌표는 pass1∪밴드 y로 최종 확정."""
    times = sorted([t for t in first if TIME_RE.match(t["raw"])], key=lambda t: t["y"])
    rows = []
    for t in times:
        ys = [c["y"] for c in first if not TIME_RE.match(c["raw"])
              and t["y"] - 26 <= c["y"] <= t["y"] + 36 and c["x"] > 110]
        rows.append({"time": t["raw"], "ty": t["y"], "p1ys": ys, "lines": None})
    return rows


def band_tokens(im, engine, y0, y1, work, tag):
    """가로 밴드(시각 열 제외)를 2배 확대해 재인식 → 원본 좌표로 역산."""
    W = im.size[0]
    path = save_crop(im, (100, int(y0), W, int(y1)), 2, os.path.join(work, "band-%s.png" % tag))
    got = ocr_of(engine(path))
    for g in got:
        g["x"] = g["x"] / 2 + 100
        g["y"] = g["y"] / 2 + y0
    return got


def build_cols(first):
    """열 중심 x좌표: 콘텐츠 토큰의 x를 군집화(7군집) → 실패 시 등간격 근사."""
    xs = sorted(c["x"] for c in first if not TIME_RE.match(c["raw"]) and c["x"] > 110)
    if not xs:
        raise RuntimeError("표 콘텐츠 토큰이 없어 열 좌표를 못 만듦")
    clusters, cur = [], [xs[0]]
    for x in xs[1:]:
        if x - cur[-1] > 55:
            clusters.append(cur)
            cur = [x]
        else:
            cur.append(x)
    clusters.append(cur)
    centers = [float(np.mean(c)) for c in clusters]
    if len(centers) == 7:
        return centers
    # 군집 실패 → 최좌/최우 중심 사이 등간격 (경고는 JS가 판독 결과로 판단)
    lo, hi = centers[0], centers[-1]
    return [lo + (hi - lo) * i / 6 for i in range(7)]


def line_bounds(lines, li):
    """줄 y좌표 → 셀 세로 경계 (이웃 줄과 겹치지 않게 중간선으로 절단)."""
    y = lines[li]
    upper = (lines[li - 1] + y) / 2 if li > 0 else y - 13
    lower = (y + lines[li + 1]) / 2 if li + 1 < len(lines) else y + 13
    upper = max(upper, y - 13)
    lower = min(lower, y + 13)
    return upper, lower


# ---------------------------------------------------------------- 잉크 검사
def ink_count(gray, box):
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(gray.shape[1], x1), min(gray.shape[0], y1)
    if x1 <= x0 or y1 <= y0:
        return 0
    reg = gray[y0:y1, x0:x1]
    thr = max(100.0, float(np.median(reg)) + 45.0)
    return int(np.count_nonzero(reg > thr))


# ---------------------------------------------------------------- 전체 판독
def parse_all(args):
    _, vocab = fetch_vocab(args.wiki_url)
    accept = make_accept(vocab)
    engine = make_engine()
    im = Image.open(args.image).convert("RGB")
    W, H = im.size
    gray = np.array(im.convert("L"))
    work = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(work, exist_ok=True)

    first = ocr_of(engine(args.image))
    rows = build_rows(first)

    # 모든 행을 가로 밴드로 1회 재인식 (줄 좌표 보완 + 빈칸 채우기를 겸용)
    for ri, r in enumerate(rows):
        got = band_tokens(im, engine, r["ty"] - 26, r["ty"] + 36, work, str(ri))
        r["band"] = [g for g in got if not TIME_RE.match(g["raw"]) and g["x"] > 110]
        ys = r["p1ys"] + [g["y"] for g in r["band"]]
        r["lines"] = cluster_lines(ys) if ys else [r["ty"] - 11.0, r["ty"] + 9.0]

    cols = build_cols(first)
    conflicts = []

    def to_cell(y, x):
        for ri, r in enumerate(rows):
            for li, ly in enumerate(r["lines"]):
                if abs(y - ly) <= 14 and x > 110:
                    ci = min(range(7), key=lambda k: abs(cols[k] - x))
                    if abs(cols[ci] - x) <= CELL_X_PAD + 2:
                        return ri, li, ci
        return None, None, None

    def put(key, val, score, src):
        """값 우선순위: 사전 통과 > 미통과, 통과 중에는 높은 신뢰도. 서로 다른 통과값은 충돌 기록."""
        ri, li, ci = key
        new_ok = not str(val).startswith("?")
        cur = grid[key]
        if cur is None:
            grid[key] = (val, score, src)
            return
        cur_ok = not str(cur[0]).startswith("?")
        if new_ok and cur_ok:
            if val != cur[0]:
                conflicts.append({"time": rows[ri]["time"], "day": DAYS[ci], "line": li + 1,
                                  "a": cur[0], "b": val, "srcA": cur[2], "srcB": src})
            if score > cur[1]:
                grid[key] = (val, score, src)
        elif new_ok and not cur_ok:
            grid[key] = (val, score, src)
        # 둘 다 미통과면 첫 값 유지

    # ---- 1차 매핑 (전체 이미지)
    grid = {}
    for ri, r in enumerate(rows):
        for li in range(len(r["lines"])):
            for ci in range(7):
                grid[(ri, li, ci)] = None
    pass1 = []
    for t in first:
        if TIME_RE.match(t["raw"]) or t["x"] <= 110:
            continue
        ri, li, ci = to_cell(t["y"], t["x"])
        if ri is None:
            continue
        ok, fixed = accept(t["raw"])
        pass1.append({"time": rows[ri]["time"], "day": DAYS[ci], "line": li + 1,
                      "bosses": [fixed] if ok else [], "raw": t["raw"], "ok": ok})
        put((ri, li, ci), fixed if ok else "?" + t["raw"], t["score"], "1차")

    # ---- 2차: 밴드 토큰으로 빈칸·미통과칸 채우기
    for ri, r in enumerate(rows):
        for g in r["band"]:
            nri, nli, nci = to_cell(g["y"], g["x"])
            if nri != ri:
                continue
            ok, fixed = accept(g["raw"])
            if ok:
                put((ri, nli, nci), fixed, g["score"], "2차")

    # ---- 3차: 머리글
    header = {}
    header_missing = []
    for t in first:
        if t["y"] < 60 and t["x"] > 110:
            ci = min(range(7), key=lambda k: abs(cols[k] - t["x"]))
            if abs(cols[ci] - t["x"]) > CELL_X_PAD + 2:
                continue
            fix = hdr_match(t["raw"], ci, accept)
            if fix:
                header[ci] = (fix, t["score"], "1차")
    if len(header) < 7:
        # 헤더 밴드 재판독
        got = ocr_of(engine(save_crop(im, (100, 18, W, 62), 2,
                                      os.path.join(work, "hdrband.png"))))
        for g in got:
            g["x"] = g["x"] / 2 + 100
            ci = min(range(7), key=lambda k: abs(cols[k] - g["x"]))
            if abs(cols[ci] - g["x"]) > CELL_X_PAD + 2 or ci in header:
                continue
            fix = hdr_match(g["raw"], ci, accept)
            if fix:
                header[ci] = (fix, g["score"], "2차밴드")
    for ci in range(7):
        if ci in header:
            continue
        # 직접 크롭 (좁은 크롭은 det가 놓침 → ±80 패딩)
        box = (max(0, cols[ci] - 80), 0, min(W, cols[ci] + 80), 75)
        got = ocr_of(engine(save_crop(im, box, 3, os.path.join(work, "hdrcell%d.png" % ci))))
        for g in got:
            fix = hdr_match(g["raw"], ci, accept)
            if fix:
                header[ci] = (fix, g["score"], "3차직접")
                break
    for ci in range(7):
        if ci not in header:
            header_missing.append(DAYS[ci])

    # ---- 셀 조립 + 잉크 검사 (conflicts는 put()에서 이미 수집)
    cells, empties, unread = [], [], []
    for (ri, li, ci), v in sorted(grid.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2])):
        r = rows[ri]
        upper, lower = line_bounds(r["lines"], li)
        box = (cols[ci] - CELL_X_PAD, upper, cols[ci] + CELL_X_PAD, lower)
        ink = ink_count(gray, box)
        t, d = r["time"], DAYS[ci]
        if v is not None and not str(v[0]).startswith("?"):
            cells.append({"time": t, "day": d, "line": li + 1,
                          "bosses": [v[0]], "score": round(v[1], 3), "source": v[2]})
        elif v is not None and str(v[0]).startswith("?"):
            unread.append({"time": t, "day": d, "line": li + 1, "ink": ink, "raw": v[0][1:]})
        elif ink >= INK_MIN:
            unread.append({"time": t, "day": d, "line": li + 1, "ink": ink, "raw": None})
        else:
            empties.append({"time": t, "day": d, "line": li + 1, "ink": ink})

    out = {
        "version": 1,
        "image": os.path.abspath(args.image),
        "imageSize": [W, H],
        "wikiUrl": args.wiki_url,
        "vocab": sorted(vocab),
        "header": [header[ci][0] if ci in header else None for ci in range(7)],
        "headerMissing": header_missing,
        "times": [r["time"] for r in rows],
        "rows": [{"time": r["time"], "ty": r["ty"],
                  "lines": [round(x, 1) for x in r["lines"]]} for r in rows],
        "cols": [round(c, 1) for c in cols],
        "cells": cells,
        "pass1": pass1,
        "empties": empties,
        "unread": unread,
        "conflicts": conflicts,
        "stats": {"times": len(rows), "header": len(header), "cells": len(cells),
                  "empties": len(empties), "unread": len(unread),
                  "conflicts": len(conflicts), "tokens1": len(first)},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("parse-ok times=%d header=%d cells=%d empties=%d unread=%d conflicts=%d"
          % (len(rows), len(header), len(cells), len(empties), len(unread), len(conflicts)))
    return 0


# ---------------------------------------------------------------- 변경 칸 재확인
def parse_recheck(args):
    with open(args.grid, encoding="utf-8") as f:
        grid = json.load(f)
    with open(args.cells, encoding="utf-8") as f:
        wanted = json.load(f)  # [{time, day}]
    img_path = args.image or grid["image"]
    _, vocab = fetch_vocab(args.wiki_url)
    accept = make_accept(vocab)
    engine = make_engine()
    im = Image.open(img_path).convert("RGB")
    W, H = im.size
    gray = np.array(im.convert("L"))
    work = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(work, exist_ok=True)

    rows = {r["time"]: r for r in grid["rows"]}
    cols = grid["cols"]

    # 이미지에 없는 시각(행 삭제 후보)은 좌측 시각 열 전체로 재확인
    missing_wanted = [t for t in sorted({w["time"] for w in wanted}) if t not in rows]
    present_times = set(rows)
    if missing_wanted:
        strip = save_crop(im, (0, 0, 118, H), 2, os.path.join(work, "timestrip.png"))
        for g in ocr_of(engine(strip)):
            g["raw"] = g["raw"].strip()
            if TIME_RE.match(g["raw"]):
                hhmm = "%02d:%02d" % (int(g["raw"].split(":")[0]), int(g["raw"].split(":")[1]))
                present_times.add(hhmm)

    results = []
    for w in wanted:
        t, d = w["time"], w["day"]
        ci = DAYS.index(d) if d in DAYS else -1
        r = rows.get(t)
        if r is None:
            # 시각 열 재확인에도 없으면 → 행이 이미지에서 사라짐(삭제 확정)
            confirmed_gone = t not in present_times
            results.append({"time": t, "day": d, "bosses": [], "raw": None,
                            "source": "row-missing", "ink": 0,
                            "emptyConfirmed": confirmed_gone,
                            "note": None if confirmed_gone else "시각 토큰은 없지만 좌측 열에서 발견됨"})
            continue
        if ci < 0:
            results.append({"time": t, "day": d, "bosses": [], "raw": None,
                            "source": "bad-day", "ink": 0, "emptyConfirmed": False})
            continue

        # (1) 셀 크롭 집중 재인식
        found, raw, src = [], None, None
        for li, ly in enumerate(r["lines"]):
            upper, lower = line_bounds(r["lines"], li)
            box = (cols[ci] - CELL_X_PAD + 3, upper + 1, cols[ci] + CELL_X_PAD - 3, lower - 1)
            got = ocr_of(engine(save_crop(im, box, 4, os.path.join(work, "cell.png"))))
            for g in got:
                ok, fixed = accept(g["raw"])
                if ok and fixed not in found:
                    found.append(fixed)
                    raw, src = g["raw"], "cell"
        # (2) 행 밴드 보완
        if not found:
            got = band_tokens(im, engine, min(r["lines"]) - 24, max(r["lines"]) + 24,
                              work, "rc")
            for g in got:
                if TIME_RE.match(g["raw"]):
                    continue
                ci2 = min(range(7), key=lambda k: abs(cols[k] - g["x"]))
                if ci2 != ci or abs(cols[ci] - g["x"]) > CELL_X_PAD + 2:
                    continue
                ok, fixed = accept(g["raw"])
                if ok and fixed not in found:
                    found.append(fixed)
                    raw, src = g["raw"], "band"
        # 잉크: 셀 영역 전체 (줄 경계 기준)
        ink = 0
        for ly in r["lines"]:
            upper, lower = line_bounds(r["lines"], r["lines"].index(ly))
            ink = max(ink, ink_count(gray, (cols[ci] - CELL_X_PAD, upper,
                                            cols[ci] + CELL_X_PAD, lower)))
        results.append({"time": t, "day": d, "bosses": found, "raw": raw,
                        "source": src, "ink": ink,
                        "emptyConfirmed": (not found and ink < INK_MIN)})

    out = {"version": 1, "image": os.path.abspath(img_path),
           "recheck": results,
           "missingTimes": sorted(t for t in missing_wanted if t not in present_times)}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("recheck-ok cells=%d goneTimes=%s"
          % (len(results), ",".join(out["missingTimes"]) or "-"))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--wiki-url", default=WIKI_URL_DEFAULT)
    ap.add_argument("--grid")       # recheck: 1차 판독 JSON
    ap.add_argument("--cells")      # recheck: [{time, day}]
    ap.add_argument("--missing-times", default="")
    args = ap.parse_args()
    if args.grid and args.cells:
        return parse_recheck(args)
    return parse_all(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # 실패 시 JS가 needsReview로 처리
        print("ERROR: %s" % e, file=sys.stderr)
        sys.exit(1)
