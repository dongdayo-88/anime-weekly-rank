# build/sources/anime_index.py
# 애니 식별 인덱스 (스펙 §5.2, §6).
# manami anime-offline-database 의 모든 제목+동의어로 거대한 "애니 제목 집합"을 만들고,
# AniList 상위 작품의 제목/동의어로 보강한다. Netflix 제목이 이 집합에 매칭되면 "애니"로 판정.

import re
import requests

try:
    from rapidfuzz import process, fuzz
    _HAS_RAPIDFUZZ = True
except Exception:  # noqa: BLE001
    _HAS_RAPIDFUZZ = False

MANAMI_URL = (
    "https://raw.githubusercontent.com/manami-project/"
    "anime-offline-database/master/anime-offline-database-minified.json"
)

FUZZ_THRESHOLD = 90  # token_set_ratio 임계값


def norm(s) -> str:
    """공통 정규화: 영숫자만 남기고 소문자화."""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _download_manami():
    print("[anime_index] downloading manami anime-offline-database ...")
    r = requests.get(MANAMI_URL, timeout=120)
    r.raise_for_status()
    data = r.json()
    entries = data.get("data", data) if isinstance(data, dict) else data
    print(f"[anime_index] manami entries: {len(entries)}")
    return entries


class AnimeIndex:
    """
    set A  : 정규화된 애니 제목 집합 (정확 매칭용)
    norm_list : 퍼지 매칭 후보 리스트 (set A 와 동일 원소)
    map M  : 정규화 제목 -> AniList 메타 (포스터/링크 연결용)
    """

    def __init__(self):
        self.title_set = set()        # set A
        self.norm_list = []           # 퍼지 매칭 후보 (정규화 문자열)
        self.anilist_by_norm = {}     # map M: norm(title) -> anilist meta dict

    # ---- 구축 ----
    def _add_title(self, raw):
        n = norm(raw)
        if n and n not in self.title_set:
            self.title_set.add(n)
            self.norm_list.append(n)

    def build(self, anilist_media):
        """
        1) manami DB 의 모든 title+synonyms 정규화 -> set A
        2) AniList 상위 작품의 title/synonyms 도 set A 에 보강
        3) AniList 메타를 map M 으로 인덱싱 (포스터/score/siteUrl 연결)
        """
        # 1) manami
        try:
            for e in _download_manami():
                self._add_title(e.get("title"))
                for syn in e.get("synonyms", []) or []:
                    self._add_title(syn)
        except Exception as ex:  # noqa: BLE001
            # manami 다운로드 실패해도 AniList 제목만으로 동작 (degrade)
            print(f"[anime_index] WARNING manami download failed: {ex}")

        # 2)+3) AniList 보강 + 메타 인덱스
        for m in anilist_media:
            t = m.get("title", {}) or {}
            meta = {
                "anilist_id": m.get("id"),
                "title_en": t.get("english"),
                "title_romaji": t.get("romaji"),
                "title_native": t.get("native"),
                "cover": (m.get("coverImage") or {}).get("large"),
                "url": m.get("siteUrl"),
                "score": m.get("averageScore"),
            }
            names = [t.get("romaji"), t.get("english"), t.get("native")]
            names += m.get("synonyms", []) or []
            for nm in names:
                if not nm:
                    continue
                self._add_title(nm)
                key = norm(nm)
                # 동일 정규화 제목이 여러 작품에 매핑될 수 있으나,
                # 먼저 들어온(상위 trending) 작품을 우선 유지.
                self.anilist_by_norm.setdefault(key, meta)

        print(
            f"[anime_index] title_set={len(self.title_set)} "
            f"anilist_meta={len(self.anilist_by_norm)} "
            f"rapidfuzz={'on' if _HAS_RAPIDFUZZ else 'off'}"
        )
        return self

    # ---- 매칭 ----
    def is_anime(self, title) -> bool:
        n = norm(title)
        if not n:
            return False
        if n in self.title_set:
            return True
        if _HAS_RAPIDFUZZ and self.norm_list:
            match = process.extractOne(
                n, self.norm_list, scorer=fuzz.token_set_ratio
            )
            if match and match[1] >= FUZZ_THRESHOLD:
                return True
        return False

    def lookup_meta(self, title):
        """매칭된 제목을 AniList 메타에 연결. 실패 시 None."""
        n = norm(title)
        if not n:
            return None
        meta = self.anilist_by_norm.get(n)
        if meta:
            return meta
        if _HAS_RAPIDFUZZ and self.anilist_by_norm:
            keys = list(self.anilist_by_norm.keys())
            match = process.extractOne(n, keys, scorer=fuzz.token_set_ratio)
            if match and match[1] >= FUZZ_THRESHOLD:
                return self.anilist_by_norm[match[0]]
        return None


def build(anilist_media):
    """편의 함수: 인덱스를 만들어 반환."""
    return AnimeIndex().build(anilist_media)


if __name__ == "__main__":
    from anilist import fetch_global

    media = fetch_global(per_page=50)
    idx = build(media)
    # 간단 테스트
    for sample in ["ONE PIECE", "Solo Leveling", "Totally Not An Anime 12345"]:
        print(f'  is_anime({sample!r}) = {idx.is_anime(sample)}')
