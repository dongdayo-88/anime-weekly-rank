# 글로벌 애니메이션 주간 인기 랭킹

매주 자동으로 갱신되는, **비용 0**의 정적 웹페이지입니다. 사용자 PC 없이 GitHub Actions가 매주 데이터를 수집해 갱신·배포합니다.

🔗 **공개 URL**: https://dongdayo-88.github.io/anime-weekly-rank/

- **헤드라인**: 글로벌 주간 애니 인기 Top 20 (AniList 기반, 트렌딩/인기도 토글)
- **권역 탭**: 일본 / 한국 / 북미 / 유럽 / 동남아 — 각 탭에 두 신호 병기
  - `실시청`: Netflix 국가별 Top10 중 애니만 필터링
  - `관심도`: Google Trends 권역별 검색 관심도
- **자동 갱신**: GitHub Actions cron (매주 월요일 09:00 KST)
- **비용**: 전부 무료 (GitHub Pages + Actions 무료 티어)

---

## 아키텍처

```
GitHub Actions (cron: 매주 월 00:00 UTC)
        │
        ▼
 build/fetch_data.py  ──┬──► AniList GraphQL  (글로벌 랭킹)
        │               ├──► anime-offline-database (애니 식별 인덱스)
        │               ├──► Netflix Tudum xlsx (권역별 실시청)
        │               └──► Google Trends/pytrends (권역별 관심도)
        ▼
 site/data.json  (+ site/history/YYYY-Www.json 누적)
        ▼
 GitHub Pages (site/ 정적 호스팅)
```

핵심 원칙: **프런트엔드는 외부 API를 직접 호출하지 않는다.** 모든 수집은 빌드 시점(Python)에 끝내고, 프런트는 정적 `data.json`만 읽는다.

## 리포 구조

```
anime-weekly-rank/
├── .github/workflows/update.yml   # 주간 cron + 배포
├── build/
│   ├── fetch_data.py              # 메인 오케스트레이션
│   ├── regions.py                 # 권역 정의 (단일 소스)
│   ├── requirements.txt
│   └── sources/
│       ├── anilist.py             # AniList GraphQL
│       ├── anime_index.py         # 애니 식별 인덱스 (manami DB) + rapidfuzz
│       ├── netflix.py             # Netflix xlsx 파싱
│       └── trends.py              # Google Trends (백오프·graceful)
├── site/
│   ├── index.html / styles.css / app.js
│   ├── data.json                  # 빌드 산출물 (최신 주)
│   └── history/                   # 주차별 스냅샷 누적
└── README.md
```

## 로컬 실행 / 검증

> Python 3.11 필요.

```bash
pip install -r build/requirements.txt

# (a) 정상 빌드: data.json 생성
python build/fetch_data.py

# (b) Trends 강제 실패시켜도 빌드가 끝까지 도는지 (graceful degrade)
TRENDS_FORCE_FAIL=1 python build/fetch_data.py      # Windows PowerShell: $env:TRENDS_FORCE_FAIL=1; python build/fetch_data.py

# (c) 사이트 로컬 미리보기 → http://localhost:8000
python -m http.server 8000 --directory site
```

## 배포 초기 설정 (1회만)

0. (사전) 로컬에 Git + GitHub 인증 완료 (`gh auth login` 또는 PAT).
1. GitHub 계정 `dongdayo-88`에 **public** 리포 `anime-weekly-rank` 생성 후 이 구조 push.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** 선택.
3. **Settings → Actions → General → Workflow permissions: Read and write** 활성화.
4. **Actions 탭 → `Weekly Anime Rank Update` → Run workflow**로 1회 수동 실행 → 첫 `data.json` 생성·배포 확인.
5. 발급된 https://dongdayo-88.github.io/anime-weekly-rank/ 링크 공유.
6. 이후 매주 월요일 자동 갱신.

> cron 시각 변경: KST 기준 원하는 시각 −9시간을 UTC cron으로 환산해 `update.yml` 수정.

## 데이터 소스 & 한계

- **출처**: [AniList](https://anilist.co) · [Netflix Tudum Top10](https://www.netflix.com/tudum/top10) · [Google Trends](https://trends.google.com) · [anime-offline-database](https://github.com/manami-project/anime-offline-database)
- **권역 실시청은 얇다**: Netflix Top10에 애니가 권역당 1~2편만 드는 주가 많습니다(데이터 한계). 그래서 관심도(Trends)를 병기합니다. 두 신호가 모두 비어도 글로벌 랭킹은 항상 표시됩니다.
- **Google Trends는 간헐적으로 실패**합니다(비공식 API). 빌드는 죽지 않고 해당 섹션만 비웁니다.
- **현지화 제목 매칭 누락** 가능: 퍼지 매칭(token_set_ratio ≥ 90)으로 대부분 잡지만 완벽하지 않습니다.

## 라이선스 / 비고

데이터는 각 출처의 소유이며, 본 페이지는 비영리 정보 집계 용도입니다.
