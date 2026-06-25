#!/usr/bin/env python3
# build/fetch_data.py
# 오케스트레이션 (스펙 §7, §9): 수집 -> delta 계산 -> data.json 조립 -> 저장.
# 실행: python build/fetch_data.py
#
# 동작 순서:
#   1. anime_index.build()  -> 애니 사전 set A + AniList 메타 map M
#   2. anilist.fetch_global -> 글로벌 후보 50, 헤드라인 Top20(trending / popularity)
#   3. netflix.fetch        -> 권역별 실시청 랭킹
#   4. trends.fetch         -> 권역별 관심도 (실패 graceful)
#   5. 직전 주 스냅샷 로드 -> 글로벌·권역 delta 계산
#   6. data.json 조립 -> site/data.json + site/history/<주차>.json
#   7. 요약 출력

import os
import sys
import json
import glob
import datetime as dt

# build/ 와 build/sources/ 를 import 경로에 추가
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "sources"))

from regions import REGIONS, REGION_ORDER  # noqa: E402
import anilist  # noqa: E402
import anime_index as aidx  # noqa: E402
import netflix  # noqa: E402
import trends  # noqa: E402

SITE_DIR = os.path.normpath(os.path.join(HERE, "..", "site"))
HISTORY_DIR = os.path.join(SITE_DIR, "history")
DATA_JSON = os.path.join(SITE_DIR, "data.json")

HEADLINE_N = 20
TRENDS_CANDIDATES = 20


def iso_week_str(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _title_en_romaji(m):
    t = m.get("title", {}) or {}
    return (t.get("english") or t.get("romaji") or t.get("native") or "Unknown",
            t.get("romaji") or "")


def build_global_lists(media):
    """trending / popularity 두 정렬의 Top20 리스트(공통 구조)를 만든다."""
    def make(sorted_media):
        out = []
        for i, m in enumerate(sorted_media[:HEADLINE_N], start=1):
            title_en, title_romaji = _title_en_romaji(m)
            out.append({
                "rank": i,
                "anilist_id": m.get("id"),
                "title_en": title_en,
                "title_romaji": title_romaji,
                "score": m.get("averageScore"),
                "popularity": m.get("popularity"),
                "trending": m.get("trending"),
                "cover": (m.get("coverImage") or {}).get("large"),
                "url": m.get("siteUrl"),
                "country": m.get("countryOfOrigin"),
                "delta": None,  # 5단계에서 채움
            })
        return out

    by_trending = sorted(media, key=lambda m: (m.get("trending") or 0), reverse=True)
    by_popularity = sorted(media, key=lambda m: (m.get("popularity") or 0), reverse=True)
    return make(by_trending), make(by_popularity)


def load_prev_snapshot(cur_week):
    """직전 주 스냅샷(가장 최근, 현재 주 제외)을 로드. 없으면 None."""
    files = sorted(glob.glob(os.path.join(HISTORY_DIR, "*.json")))
    cur_path = os.path.join(HISTORY_DIR, f"{cur_week}.json")
    prev = [f for f in files if os.path.abspath(f) != os.path.abspath(cur_path)]
    if not prev:
        return None
    try:
        with open(prev[-1], "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f"[delta] prev snapshot load failed: {e}")
        return None


def _rank_index(items, key_id="anilist_id", key_title="title_en"):
    """이전 스냅샷 리스트에서 {식별키: rank} 인덱스 생성."""
    idx = {}
    for it in items or []:
        rank = it.get("rank")
        aid = it.get("anilist_id")
        if aid is not None:
            idx[("id", aid)] = rank
        title = it.get(key_title) or it.get("title")
        if title:
            idx[("t", str(title).lower())] = rank
    return idx


def _delta_for(item, prev_idx, title_key="title_en"):
    """prev_rank - cur_rank. 신규는 'new', 동일/하락/상승을 부호로."""
    cur = item.get("rank")
    aid = item.get("anilist_id")
    title = item.get(title_key) or item.get("title")
    prev = None
    if aid is not None and ("id", aid) in prev_idx:
        prev = prev_idx[("id", aid)]
    elif title and ("t", str(title).lower()) in prev_idx:
        prev = prev_idx[("t", str(title).lower())]
    if prev is None:
        return "new"
    diff = prev - cur
    if diff > 0:
        return f"+{diff}"
    if diff < 0:
        return str(diff)
    return "0"


def apply_deltas(cur_list, prev_list, title_key="title_en"):
    prev_idx = _rank_index(prev_list, key_title=title_key)
    for it in cur_list:
        it["delta"] = _delta_for(it, prev_idx, title_key=title_key)


def main():
    now = dt.datetime.now(dt.timezone.utc)
    week = iso_week_str(now.date())
    print(f"=== anime-weekly-rank build | week={week} | {now.isoformat()} ===")

    # 1) AniList 글로벌
    media = anilist.fetch_global(per_page=50)
    print(f"[main] anilist media: {len(media)}")

    # 2) 애니 인덱스
    index = aidx.build(media)

    # 3) 글로벌 Top20 (trending / popularity)
    trending_list, popularity_list = build_global_lists(media)

    # 4) Netflix 권역별 실시청
    regions_netflix, netflix_week = netflix.fetch(index)

    # 5) Trends 후보 = 헤드라인 trending Top20
    trends_candidates = [
        {"title": it["title_en"], "anilist_id": it["anilist_id"]}
        for it in trending_list[:TRENDS_CANDIDATES]
    ]
    regions_trends = trends.fetch(trends_candidates)

    # 6) delta — 직전 주 스냅샷과 비교
    prev = load_prev_snapshot(week)
    if prev:
        apply_deltas(trending_list, prev.get("global", {}).get("trending"), "title_en")
        apply_deltas(popularity_list, prev.get("global", {}).get("popularity"), "title_en")
        for key in REGIONS:
            prev_nf = (prev.get("regions", {}).get(key, {}) or {}).get("netflix")
            apply_deltas(regions_netflix.get(key, []), prev_nf, "title")
    else:
        print("[delta] no previous snapshot -> all 'new'")
        for it in trending_list + popularity_list:
            it["delta"] = "new"
        for key in REGIONS:
            for it in regions_netflix.get(key, []):
                it["delta"] = "new"

    # 7) data.json 조립
    regions_out = {}
    for key in REGION_ORDER:
        region = REGIONS[key]
        nf = []
        for it in regions_netflix.get(key, []):
            nf.append({
                "rank": it["rank"],
                "title": it["title"],
                "anilist_id": it.get("anilist_id"),
                "cover": it.get("cover"),
                "url": it.get("url"),
                "delta": it.get("delta", "new"),
            })
        tr = []
        for it in regions_trends.get(key, []):
            # 포스터 보강: anilist_id 가 헤드라인에 있으면 cover 연결
            cover = None
            if it.get("anilist_id"):
                for g in trending_list:
                    if g["anilist_id"] == it["anilist_id"]:
                        cover = g["cover"]
                        break
            tr.append({
                "rank": it["rank"],
                "title": it["title"],
                "anilist_id": it.get("anilist_id"),
                "score": it.get("score"),
                "cover": cover,
            })
        regions_out[key] = {
            "label_ko": region["label_ko"],
            "label_en": region["label_en"],
            "netflix": nf,
            "trends": tr,
        }

    data = {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "week": week,
        "netflix_week": netflix_week,
        "global": {
            "trending": trending_list,
            "popularity": popularity_list,
        },
        "regions": regions_out,
        "sources": {
            "anilist": "https://anilist.co",
            "netflix": "https://www.netflix.com/tudum/top10",
            "trends": "https://trends.google.com",
        },
        "notes": "권역 실시청은 Netflix Top10 내 애니만 반영하며 카탈로그 한계로 누락이 있을 수 있습니다.",
    }

    os.makedirs(HISTORY_DIR, exist_ok=True)
    with open(DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    snap_path = os.path.join(HISTORY_DIR, f"{week}.json")
    with open(snap_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 8) 요약
    print("\n=== SUMMARY ===")
    print(f"  week={week}  netflix_week={netflix_week}")
    print(f"  global trending top: {trending_list[0]['title_en'] if trending_list else '-'}")
    for key in REGION_ORDER:
        nf_n = len(regions_out[key]["netflix"])
        tr_n = len(regions_out[key]["trends"])
        print(f"  {key:<15} netflix={nf_n:<2} trends={tr_n}")
    print(f"  wrote: {DATA_JSON}")
    print(f"  wrote: {snap_path}")


if __name__ == "__main__":
    main()
