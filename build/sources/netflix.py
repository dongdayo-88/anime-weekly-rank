# build/sources/netflix.py
# Netflix Tudum Top10 — 권역별 실시청 (스펙 §5.3, §6).
# 국가별 xlsx 다운로드 -> 최신주 추출 -> 권역 필터 -> 애니 매칭 -> 권역 내 점수화 재랭킹.

import io
import requests
import pandas as pd

from regions import REGIONS

COUNTRIES_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.xlsx"


def _download_latest():
    """국가별 xlsx 다운로드 후 최신 week 의 데이터프레임과 week 문자열 반환."""
    print("[netflix] downloading all-weeks-countries.xlsx (~14MB) ...")
    raw = requests.get(COUNTRIES_URL, timeout=120).content
    df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
    # 컬럼: country_name, country_iso2, week, category,
    #       weekly_rank, show_title, season_title, cumulative_weeks_in_top_10
    latest = sorted(df["week"].astype(str).unique())[-1]
    print(f"[netflix] latest week = {latest}")
    return df[df["week"].astype(str) == latest].copy(), latest


def fetch(anime_index):
    """
    반환:
      regions_netflix: { region_key: [ {rank, title, anilist_id, cover, url, score_raw}, ... ] }
      netflix_week:    "YYYY-MM-DD"
    """
    try:
        df, week = _download_latest()
    except Exception as ex:  # noqa: BLE001
        print(f"[netflix] WARNING download/parse failed: {ex}")
        return {k: [] for k in REGIONS}, None

    result = {}
    for key, region in REGIONS.items():
        countries = region["netflix_countries"]
        sub = df[df["country_name"].isin(countries)]

        # show_title -> 누적 점수(11 - weekly_rank) + 메타
        scored = {}  # norm_key -> dict
        for _, row in sub.iterrows():
            title = str(row.get("show_title", "")).strip()
            if not title:
                continue
            if not anime_index.is_anime(title):
                continue
            try:
                rank = int(row.get("weekly_rank"))
            except (TypeError, ValueError):
                continue
            score = max(0, 11 - rank)  # rank1=10 ... rank10=1

            meta = anime_index.lookup_meta(title) or {}
            # 같은 작품(정규화 제목 기준)이 여러 나라에 들면 점수 합산
            akey = (meta.get("anilist_id") or title).__str__().lower()
            if akey not in scored:
                scored[akey] = {
                    "title": meta.get("title_en") or meta.get("title_romaji") or title,
                    "netflix_title": title,
                    "anilist_id": meta.get("anilist_id"),
                    "cover": meta.get("cover"),
                    "url": meta.get("url"),
                    "score_raw": 0,
                }
            scored[akey]["score_raw"] += score

        ranked = sorted(scored.values(), key=lambda x: x["score_raw"], reverse=True)
        for i, item in enumerate(ranked, start=1):
            item["rank"] = i
        result[key] = ranked
        print(f"[netflix] {key}: {len(ranked)} anime matched")

    return result, week


if __name__ == "__main__":
    from anilist import fetch_global
    import anime_index as aidx

    media = fetch_global(per_page=50)
    idx = aidx.build(media)
    regions_nf, wk = fetch(idx)
    print(f"netflix_week={wk}")
    for k, items in regions_nf.items():
        print(f"  {k}: " + ", ".join(f'{it["title"]}({it["score_raw"]})' for it in items))
