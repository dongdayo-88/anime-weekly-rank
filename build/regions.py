# build/regions.py
# 권역 정의 — 단일 소스 오브 트루스 (single source of truth).
# Netflix country_name 기준 + Google Trends geo 코드(ISO-3166-1 alpha-2).
# 권역 추가/수정은 이 파일 한 곳만 고친다.

REGIONS = {
    "japan": {
        "label_ko": "일본", "label_en": "Japan",
        "netflix_countries": ["Japan"],
        "trends_geo": ["JP"],
    },
    "korea": {
        "label_ko": "한국", "label_en": "Korea",
        "netflix_countries": ["South Korea"],
        "trends_geo": ["KR"],
    },
    "north_america": {
        "label_ko": "북미", "label_en": "North America",
        "netflix_countries": ["United States", "Canada"],
        "trends_geo": ["US", "CA"],
    },
    "europe": {
        "label_ko": "유럽", "label_en": "Europe",
        "netflix_countries": ["United Kingdom", "Germany", "France",
                              "Spain", "Italy", "Netherlands", "Poland"],
        "trends_geo": ["GB", "DE", "FR"],
    },
    "southeast_asia": {
        "label_ko": "동남아", "label_en": "SE Asia",
        "netflix_countries": ["Thailand", "Indonesia", "Philippines",
                              "Singapore", "Malaysia", "Vietnam"],
        "trends_geo": ["TH", "ID", "PH"],
    },
}

# 권역 표시 순서 (프런트 탭 순서와 일치)
REGION_ORDER = ["japan", "korea", "north_america", "europe", "southeast_asia"]
