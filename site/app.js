// app.js — 정적 data.json 한 번 fetch → 메모리 상태 → 렌더 (스펙 §8)
// 외부 API 직접 호출 없음. 탭/정렬 상태는 메모리 변수, 언어 선택만 localStorage 유지.

const state = {
  data: null,
  lang: "ko",            // UI 언어: "ko" | "ja"
  view: "global",        // 랭킹 탭: "global" | "seasonal" | "upcoming"
  sort: "trending",      // 글로벌: "trending" | "popularity"
  seasonSort: "trending", // 시즌: "trending" | "popularity" | "score"
  upcomingSort: "popularity", // 기대작: "popularity" | "trending" | "favourites"
  upcomingIdx: 0,        // 선택된 기대작 분기 인덱스
  region: null,          // 현재 권역 key
};

// ---- i18n 사전 (UI 라벨만. 애니 제목은 원문 유지) ----
const I18N = {
  ko: {
    "title": "글로벌 애니 주간 랭킹",
    "tab.global": "글로벌 Top 20", "tab.seasonal": "이번 분기 방영작", "tab.upcoming": "분기별 기대작",
    "sort.trending": "트렌딩", "sort.popularity": "인기도", "sort.score": "평점",
    "usort.popularity": "기대지수", "usort.trending": "화제성", "usort.favourites": "즐겨찾기",
    "h.global": "글로벌 Top 20", "h.seasonal": "이번 분기 방영작", "h.upcoming": "분기별 기대작", "h.region": "권역별 랭킹",
    "lg.score": "평점", "lg.score.d": "AniList 평균점수 (100점 만점)",
    "lg.trending": "트렌딩", "lg.trending.d": "이번 주 화제성 지수",
    "lg.popularity": "인기도", "lg.popularity.d": "작품을 등록한 이용자 수",
    "ulg.anticipation": "기대지수", "ulg.anticipation.d": "작품을 등록한(기다리는) 이용자 수",
    "ulg.buzz": "화제성", "ulg.buzz.d": "최근 PV·뉴스 반응",
    "ulg.fav": "즐겨찾기", "ulg.fav.d": "즐겨찾기에 추가한 이용자 수",
    "col.netflix": "실시청", "col.trends": "관심도",
    "empty.netflix": "이번 주 Netflix Top10 내 애니가 없습니다.",
    "empty.trends": "이번 주 관심도 데이터 없음",
    "empty.seasonal": "이번 분기 데이터가 없습니다.",
    "empty.upcoming": "기대작 데이터가 없습니다.",
    "empty.data": "데이터가 없습니다.",
    "empty.region": "권역 데이터가 없습니다.",
    "updated": "최종 갱신", "sources": "데이터 출처",
    "season.suffix": "분기",
    "tt.score": "평점: AniList 평균점수 (100점 만점)",
    "tt.trending": "트렌딩: 이번 주 화제성 지수",
    "tt.popularity": "인기도: 작품을 등록한 이용자 수",
    "tt.favourites": "즐겨찾기: 즐겨찾기에 추가한 이용자 수",
    "tt.epfmt": "에피소드 / 형식",
    "load.fail": "데이터를 불러오지 못했습니다.",
  },
  ja: {
    "title": "グローバルアニメ週間ランキング",
    "tab.global": "グローバル Top 20", "tab.seasonal": "今期放送作品", "tab.upcoming": "期待の新作",
    "sort.trending": "トレンド", "sort.popularity": "人気", "sort.score": "評価",
    "usort.popularity": "期待度", "usort.trending": "話題性", "usort.favourites": "お気に入り",
    "h.global": "グローバル Top 20", "h.seasonal": "今期放送作品", "h.upcoming": "期待の新作", "h.region": "地域別ランキング",
    "lg.score": "評価", "lg.score.d": "AniList 平均スコア (100点満点)",
    "lg.trending": "トレンド", "lg.trending.d": "今週の話題度",
    "lg.popularity": "人気", "lg.popularity.d": "リストに追加したユーザー数",
    "ulg.anticipation": "期待度", "ulg.anticipation.d": "視聴予定に追加した(待っている)ユーザー数",
    "ulg.buzz": "話題性", "ulg.buzz.d": "最近のPV・ニュース反応",
    "ulg.fav": "お気に入り", "ulg.fav.d": "お気に入り登録したユーザー数",
    "col.netflix": "実視聴", "col.trends": "関心度",
    "empty.netflix": "今週のNetflix Top10にアニメはありません。",
    "empty.trends": "今週の関心度データなし",
    "empty.seasonal": "今期のデータがありません。",
    "empty.upcoming": "期待作のデータがありません。",
    "empty.data": "データがありません。",
    "empty.region": "地域データがありません。",
    "updated": "最終更新", "sources": "データ出典",
    "season.suffix": "",
    "tt.score": "評価: AniList 平均スコア (100点満点)",
    "tt.trending": "トレンド: 今週の話題度",
    "tt.popularity": "人気: リストに追加したユーザー数",
    "tt.favourites": "お気に入り: お気に入り登録したユーザー数",
    "tt.epfmt": "エピソード / 形式",
    "load.fail": "データを読み込めませんでした。",
  },
};

const REGION_NAMES = {
  ko: { japan: "일본", korea: "한국", north_america: "북미", europe: "유럽", southeast_asia: "동남아" },
  ja: { japan: "日本", korea: "韓国", north_america: "北米", europe: "ヨーロッパ", southeast_asia: "東南アジア" },
};
const SEASON_NAMES = {
  ko: { WINTER: "겨울", SPRING: "봄", SUMMER: "여름", FALL: "가을" },
  ja: { WINTER: "冬", SPRING: "春", SUMMER: "夏", FALL: "秋" },
};
// 미방영이라 평점 제외하는 일본어 권역 안내문(없으면 data.notes 사용)
const NOTES_JA = "地域別の実視聴はNetflix Top10内のTVアニメのみを反映し、カタログの制約により抜けがある場合があります。";

function t(key) {
  const lang = I18N[state.lang] ? state.lang : "ko";
  const v = I18N[lang][key];
  return (v === undefined || v === null) ? (I18N.ko[key] != null ? I18N.ko[key] : key) : v;
}
function regionName(key) {
  return (REGION_NAMES[state.lang] || REGION_NAMES.ko)[key] || key;
}
function seasonLabel(season, year) {
  const nm = (SEASON_NAMES[state.lang] || SEASON_NAMES.ko)[season] || season;
  return state.lang === "ja" ? `${year}年 ${nm}` : `${year} ${nm}`;
}
function epLabel(n) {
  return state.lang === "ja" ? `全${n}話` : `${n}화`;
}

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120">' +
    '<rect width="100%" height="100%" fill="#1e222c"/>' +
    '<text x="50%" y="50%" fill="#9aa1ad" font-size="9" text-anchor="middle" dy=".3em">no image</text>' +
    "</svg>"
  );

// ---- delta 배지 렌더 ----
function deltaBadge(delta) {
  if (delta === "new" || delta === "NEW") {
    return '<span class="delta-badge delta-new">NEW</span>';
  }
  if (delta == null || delta === "0") {
    return '<span class="delta-badge delta-same">–</span>';
  }
  const n = parseInt(delta, 10);
  if (isNaN(n)) return '<span class="delta-badge delta-same">–</span>';
  if (n > 0) return `<span class="delta-badge delta-up">▲${n}</span>`;
  return `<span class="delta-badge delta-down">▼${Math.abs(n)}</span>`;
}

function imgTag(src, cls, alt) {
  const safe = src || PLACEHOLDER;
  return `<img class="${cls}" loading="lazy" alt="${escapeHtml(alt || "")}" src="${safe}" ` +
    `onerror="this.onerror=null;this.src='${PLACEHOLDER}'" />`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---- 공용 애니 카드 (글로벌/시즌 공용) ----
function metricHtml(it, sort) {
  if (sort === "popularity") {
    return `<span title="${t("tt.popularity")}">👥 ${(it.popularity ?? 0).toLocaleString()}</span>`;
  }
  if (sort === "score") {
    // 평점 정렬에선 ★ 배지가 이미 점수를 보여주므로, 보조 정보로 화수/형식 표시
    const ep = it.episodes ? `📺 ${epLabel(it.episodes)}` : (it.format || "");
    return ep ? `<span title="${t("tt.epfmt")}">${escapeHtml(ep)}</span>` : "";
  }
  if (sort === "favourites") {
    return `<span title="${t("tt.favourites")}">♥ ${(it.favourites ?? 0).toLocaleString()}</span>`;
  }
  return `<span title="${t("tt.trending")}">🔥 ${it.trending ?? "-"}</span>`;
}

function animeCard(it, sort) {
  const score = it.score != null
    ? `<span class="score" title="${t("tt.score")}">★ ${it.score}</span>`
    : "";
  const href = it.url || "#";
  return `
    <a class="card" href="${escapeHtml(href)}" target="_blank" rel="noopener">
      <div class="card-cover">
        ${imgTag(it.cover, "", it.title_en)}
        <span class="rank-badge">${it.rank}</span>
        ${deltaBadge(it.delta)}
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(it.title_en || it.title_romaji)}</p>
        <p class="card-romaji">${escapeHtml(it.title_romaji || "")}</p>
        <div class="card-meta">${score}${metricHtml(it, sort)}</div>
      </div>
    </a>`;
}

// ---- 글로벌 Top20 ----
function renderGlobal() {
  const grid = document.getElementById("global-grid");
  const list = (state.data.global && state.data.global[state.sort]) || [];
  grid.innerHTML = list.length
    ? list.map((it) => animeCard(it, state.sort)).join("")
    : `<p class="empty">${t("empty.data")}</p>`;
}

// ---- 이번 분기 방영작 ----
function renderSeasonal() {
  const s = state.data.seasonal;
  const label = document.getElementById("season-label");
  if (label) {
    const suffix = t("season.suffix");
    label.textContent = s && s.season
      ? `(${seasonLabel(s.season, s.season_year)}${suffix ? " " + suffix : ""})`
      : "";
  }
  const list = (s && s[state.seasonSort]) || [];
  const grid = document.getElementById("seasonal-grid");
  if (!grid) return;
  grid.innerHTML = list.length
    ? list.map((it) => animeCard(it, state.seasonSort)).join("")
    : `<p class="empty">${t("empty.seasonal")}</p>`;
}

// ---- 분기별 기대작 (차기 + 차차기) ----
function seasonsUpcoming() {
  return (state.data.upcoming && state.data.upcoming.seasons) || [];
}

function renderUpcomingChips() {
  const chips = document.getElementById("upcoming-chips");
  const seasons = seasonsUpcoming();
  if (!chips) return;
  chips.innerHTML = seasons.map((s, i) =>
    `<button class="chip${i === state.upcomingIdx ? " active" : ""}" data-idx="${i}">` +
    `${escapeHtml(seasonLabel(s.season, s.season_year))}</button>`
  ).join("");
  chips.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.upcomingIdx = Number(btn.dataset.idx);
      renderUpcomingChips();
      renderUpcoming();
    });
  });
}

function renderUpcoming() {
  const seasons = seasonsUpcoming();
  const grid = document.getElementById("upcoming-grid");
  const label = document.getElementById("upcoming-label");
  if (!grid) return;
  const blk = seasons[state.upcomingIdx];
  if (!blk) {
    if (label) label.textContent = "";
    grid.innerHTML = `<p class="empty">${t("empty.upcoming")}</p>`;
    return;
  }
  if (label) label.textContent = blk.season ? `(${seasonLabel(blk.season, blk.season_year)})` : "";
  const list = blk[state.upcomingSort] || [];
  grid.innerHTML = list.length
    ? list.map((it) => animeCard(it, state.upcomingSort)).join("")
    : `<p class="empty">${t("empty.upcoming")}</p>`;
}

// ---- 랭킹 탭 전환 ----
function setTabAvailable(view, available) {
  const btn = document.querySelector(`.rank-tab[data-view="${view}"]`);
  if (btn) btn.style.display = available ? "" : "none";
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".rank-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".rank-view").forEach((v) => {
    const on = v.id === `${view}-view`;
    v.classList.toggle("active", on);
    v.hidden = !on;
  });
}

function wireRankTabs() {
  document.querySelectorAll(".rank-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

// ---- 권역 탭 ----
function renderTabs() {
  const tabs = document.getElementById("region-tabs");
  const regions = state.data.regions || {};
  const keys = Object.keys(regions);
  tabs.innerHTML = keys.map((k) => {
    const active = k === state.region ? " active" : "";
    return `<button class="tab-btn${active}" data-region="${k}" role="tab">` +
      `${escapeHtml(regionName(k))}</button>`;
  }).join("");
  tabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.region = btn.dataset.region;
      renderTabs();
      renderRegionPanel();
    });
  });
}

// ---- 권역 패널 (좌: Netflix 실시청 / 우: Trends 관심도) ----
function netflixRow(it) {
  const thumb = it.cover
    ? imgTag(it.cover, "row-thumb", it.title)
    : `<div class="row-thumb placeholder">—</div>`;
  const href = it.url || "#";
  const sub = it.anilist_id ? "AniList" : "Netflix";
  return `
    <a class="row" href="${escapeHtml(href)}" target="_blank" rel="noopener">
      <span class="row-rank">${it.rank}</span>
      ${thumb}
      <div class="row-body">
        <div class="row-title">${escapeHtml(it.title)}</div>
        <div class="row-sub">${escapeHtml(sub)} ${deltaBadge(it.delta)}</div>
      </div>
    </a>`;
}

function trendsRow(it) {
  const thumb = it.cover
    ? imgTag(it.cover, "row-thumb", it.title)
    : `<div class="row-thumb placeholder">—</div>`;
  const w = Math.max(2, Math.min(100, it.score || 0));
  return `
    <div class="row">
      <span class="row-rank">${it.rank}</span>
      ${thumb}
      <div class="row-body">
        <div class="row-title">${escapeHtml(it.title)}</div>
        <div class="row-sub">${t("col.trends")} ${it.score ?? "-"}</div>
        <div class="score-bar" style="width:${w}%"></div>
      </div>
    </div>`;
}

function renderRegionPanel() {
  const panel = document.getElementById("region-panel");
  const region = (state.data.regions || {})[state.region];
  if (!region) {
    panel.innerHTML = `<p class="empty">${t("empty.region")}</p>`;
    return;
  }
  const nf = region.netflix || [];
  const tr = region.trends || [];
  const nfHtml = nf.length
    ? `<div class="list">${nf.map(netflixRow).join("")}</div>`
    : `<p class="empty">${t("empty.netflix")}</p>`;
  const trHtml = tr.length
    ? `<div class="list">${tr.map(trendsRow).join("")}</div>`
    : `<p class="empty">${t("empty.trends")}</p>`;

  panel.innerHTML = `
    <div class="region-cols">
      <div>
        <h3 class="col-head">${t("col.netflix")} <span class="pill">Netflix Top10</span></h3>
        ${nfHtml}
      </div>
      <div>
        <h3 class="col-head">${t("col.trends")} <span class="pill">Google Trends</span></h3>
        ${trHtml}
      </div>
    </div>`;
}

// ---- 헤더/푸터 ----
function renderMeta() {
  const gen = state.data.generated_at;
  let kst = "—";
  if (gen) {
    try {
      const d = new Date(gen);
      kst = d.toLocaleString(state.lang === "ja" ? "ja-JP" : "ko-KR", { timeZone: "Asia/Seoul" });
    } catch (e) { kst = gen; }
  }
  document.getElementById("updated").textContent =
    `${t("updated")}: ${kst} (KST)` + (state.data.week ? ` · ${state.data.week}` : "");

  const s = state.data.sources || {};
  document.getElementById("sources").innerHTML =
    `${t("sources")}: ` +
    `<a href="${escapeHtml(s.anilist || "#")}" target="_blank" rel="noopener">AniList</a> · ` +
    `<a href="${escapeHtml(s.netflix || "#")}" target="_blank" rel="noopener">Netflix Tudum</a> · ` +
    `<a href="${escapeHtml(s.trends || "#")}" target="_blank" rel="noopener">Google Trends</a>`;
  document.getElementById("notes").textContent =
    (state.lang === "ja" ? NOTES_JA : state.data.notes) || "";
}

// ---- 정렬 토글 ----
function wireSortToggle() {
  document.querySelectorAll("#sort-toggle .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll("#sort-toggle .toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderGlobal();
    });
  });
}

function wireSeasonToggle() {
  document.querySelectorAll("#season-sort-toggle .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.seasonSort = btn.dataset.sort;
      document.querySelectorAll("#season-sort-toggle .toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderSeasonal();
    });
  });
}

function wireUpcomingToggle() {
  document.querySelectorAll("#upcoming-sort-toggle .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.upcomingSort = btn.dataset.sort;
      document.querySelectorAll("#upcoming-sort-toggle .toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderUpcoming();
    });
  });
}

// ---- 언어 전환 ----
function applyLang(lang) {
  state.lang = lang === "ja" ? "ja" : "ko";
  try { localStorage.setItem("awr_lang", state.lang); } catch (e) { /* 무시 */ }
  document.documentElement.lang = state.lang;

  // 정적 라벨([data-i18n])
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  // 언어 버튼 활성 상태
  document.querySelectorAll("#lang-toggle .lang-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === state.lang));

  // 동적 영역 재렌더
  if (!state.data) return;
  renderMeta();
  renderGlobal();
  renderSeasonal();
  renderUpcomingChips();
  renderUpcoming();
  renderTabs();
  renderRegionPanel();
}

function wireLangToggle() {
  document.querySelectorAll("#lang-toggle .lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyLang(btn.dataset.lang));
  });
}

// ---- init ----
async function init() {
  // 저장된 언어 선호 복원
  try {
    const saved = localStorage.getItem("awr_lang");
    if (saved === "ko" || saved === "ja") state.lang = saved;
  } catch (e) { /* 무시 */ }

  const main = document.querySelector("main");
  try {
    const res = await fetch("./data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (e) {
    main.innerHTML = `<p class="state-msg">${t("load.fail")} (${escapeHtml(e.message)})</p>`;
    return;
  }
  const keys = Object.keys(state.data.regions || {});
  state.region = keys[0] || null;

  wireSortToggle();
  wireSeasonToggle();
  wireUpcomingToggle();
  wireRankTabs();
  wireLangToggle();

  // 데이터 유무에 따라 탭 노출 결정
  const s = state.data.seasonal;
  const hasSeasonal = s && ((s.trending && s.trending.length) ||
    (s.popularity && s.popularity.length) || (s.score && s.score.length));
  setTabAvailable("seasonal", !!hasSeasonal);
  setTabAvailable("upcoming", seasonsUpcoming().length > 0);

  switchView(state.view);
  applyLang(state.lang); // 정적 라벨 + 전체 렌더를 한 번에 처리
}

document.addEventListener("DOMContentLoaded", init);
