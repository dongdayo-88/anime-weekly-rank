# build/sources/trends.py
# Google Trends (pytrends) — 권역별 관심도 (스펙 §5.4).
# 핵심: 앵커 키워드로 배치 정규화, 429 백오프, 실패 시 graceful degrade.
# 절대 빌드 전체를 죽이지 않는다. 실패하면 해당 권역 trends=[] 로 둔다.

import os
import time

from regions import REGIONS

# 강제 실패 테스트용 (검증 §12.11.b): 환경변수로 trends 전체를 스킵
FORCE_FAIL = os.environ.get("TRENDS_FORCE_FAIL", "").lower() in ("1", "true", "yes")

TIMEFRAME = "now 7-d"
MAX_BATCH = 5          # pytrends 요청당 최대 키워드
SLEEP_BETWEEN = 3      # 요청 사이 기본 sleep(초)
MAX_RETRIES = 3        # 429 백오프 재시도 횟수


def _get_pytrends():
    from pytrends.request import TrendReq
    return TrendReq(hl="en-US", tz=0, timeout=(10, 30), retries=2, backoff_factor=0.5)


def _interest_for_geo(pytrends, keywords, geo):
    """
    단일 geo 에 대해 키워드별 평균 관심도(raw)를 반환.
    앵커(keywords[0])를 매 배치에 포함해 배치 간 스케일을 맞춘다.
    실패한 배치는 건너뛴다 (graceful).
    반환: { keyword: raw_avg_float }
    """
    if not keywords:
        return {}
    anchor = keywords[0]
    rest = keywords[1:]
    # 배치: [anchor, +최대4개]
    batches = []
    if not rest:
        batches.append([anchor])
    else:
        for i in range(0, len(rest), MAX_BATCH - 1):
            batches.append([anchor] + rest[i:i + MAX_BATCH - 1])

    raw = {}      # keyword -> 평균값(앵커 상대 스케일 적용 전)
    anchor_ref = None  # 첫 배치의 앵커 평균 (스케일 기준)

    for batch in batches:
        means = _query_batch(pytrends, batch, geo)
        if not means:
            continue
        a_mean = means.get(anchor, 0.0)
        if anchor_ref is None and a_mean > 0:
            anchor_ref = a_mean
        # 앵커 대비 상대 스케일로 보정
        if anchor_ref and a_mean > 0:
            factor = anchor_ref / a_mean
        else:
            factor = 1.0
        for kw, v in means.items():
            if kw == anchor and kw in raw:
                continue
            raw[kw] = v * factor
        time.sleep(SLEEP_BETWEEN)

    return raw


def _query_batch(pytrends, batch, geo):
    """단일 배치 요청 + 429 지수 백오프. 평균 관심도 dict 반환, 실패 시 {}."""
    for attempt in range(MAX_RETRIES):
        try:
            pytrends.build_payload(batch, timeframe=TIMEFRAME, geo=geo)
            df = pytrends.interest_over_time()
            if df is None or df.empty:
                return {}
            if "isPartial" in df.columns:
                df = df.drop(columns=["isPartial"])
            return {kw: float(df[kw].mean()) for kw in batch if kw in df.columns}
        except Exception as e:  # noqa: BLE001 — 429 포함 모든 예외
            wait = SLEEP_BETWEEN * (2 ** attempt)
            print(f"[trends] batch failed (geo={geo}, attempt {attempt + 1}): {e} "
                  f"-> sleep {wait}s")
            time.sleep(wait)
    return {}


def fetch(top_titles):
    """
    top_titles: [ {title, anilist_id}, ... ]  (AniList 글로벌 상위 ~20, 영문 title 우선)
    반환: { region_key: [ {rank, title, anilist_id, score}, ... ] (내림차순) }
    어떤 단계가 실패해도 해당 권역은 [] 로 남기고 계속 진행.
    """
    empty = {k: [] for k in REGIONS}
    if FORCE_FAIL:
        print("[trends] TRENDS_FORCE_FAIL set -> skipping all trends (graceful)")
        return empty
    if not top_titles:
        return empty

    keywords = [t["title"] for t in top_titles if t.get("title")]
    id_by_title = {t["title"]: t.get("anilist_id") for t in top_titles if t.get("title")}
    if not keywords:
        return empty

    try:
        pytrends = _get_pytrends()
    except Exception as e:  # noqa: BLE001
        print(f"[trends] pytrends init failed: {e} -> all regions empty")
        return empty

    result = {}
    for key, region in REGIONS.items():
        geos = region["trends_geo"]
        # geo 별 raw 점수를 모아 작품별 평균
        agg = {}   # title -> [scores]
        for geo in geos:
            try:
                raw = _interest_for_geo(pytrends, keywords, geo)
            except Exception as e:  # noqa: BLE001
                print(f"[trends] {key}/{geo} failed: {e}")
                raw = {}
            for kw, v in raw.items():
                agg.setdefault(kw, []).append(v)

        if not agg:
            print(f"[trends] {key}: no data (graceful empty)")
            result[key] = []
            continue

        # 작품별 평균 -> 0~100 정규화
        avg = {kw: (sum(vs) / len(vs)) for kw, vs in agg.items()}
        top = max(avg.values()) or 1.0
        ranked = sorted(avg.items(), key=lambda kv: kv[1], reverse=True)
        items = []
        for i, (kw, v) in enumerate(ranked, start=1):
            items.append({
                "rank": i,
                "title": kw,
                "anilist_id": id_by_title.get(kw),
                "score": round(v / top * 100, 1),
            })
        result[key] = items
        print(f"[trends] {key}: {len(items)} titles scored")

    return result


if __name__ == "__main__":
    sample = [
        {"title": "One Piece", "anilist_id": 21},
        {"title": "Solo Leveling", "anilist_id": 151807},
        {"title": "Frieren", "anilist_id": 154587},
    ]
    out = fetch(sample)
    for k, v in out.items():
        print(k, v)
