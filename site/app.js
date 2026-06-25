// app.js — 정적 data.json 한 번 fetch → 메모리 상태 → 렌더 (스펙 §8)
// 외부 API 직접 호출 없음. localStorage 사용 안 함. 탭/정렬 상태는 메모리 변수.

const state = {
  data: null,
  sort: "trending",      // "trending" | "popularity"
  region: null,          // 현재 권역 key
};

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

// ---- 글로벌 Top20 ----
function renderGlobal() {
  const grid = document.getElementById("global-grid");
  const list = (state.data.global && state.data.global[state.sort]) || [];
  if (!list.length) {
    grid.innerHTML = '<p class="empty">데이터가 없습니다.</p>';
    return;
  }
  grid.innerHTML = list.map((it) => {
    const metric = state.sort === "trending"
      ? `🔥 ${it.trending ?? "-"}`
      : `👥 ${(it.popularity ?? 0).toLocaleString()}`;
    const score = it.score != null ? `<span class="score">★ ${it.score}</span>` : "";
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
          <div class="card-meta">${score}<span>${metric}</span></div>
        </div>
      </a>`;
  }).join("");
}

// ---- 권역 탭 ----
function renderTabs() {
  const tabs = document.getElementById("region-tabs");
  const regions = state.data.regions || {};
  const keys = Object.keys(regions);
  tabs.innerHTML = keys.map((k) => {
    const active = k === state.region ? " active" : "";
    return `<button class="tab-btn${active}" data-region="${k}" role="tab">` +
      `${escapeHtml(regions[k].label_ko)}</button>`;
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
        <div class="row-sub">관심도 ${it.score ?? "-"}</div>
        <div class="score-bar" style="width:${w}%"></div>
      </div>
    </div>`;
}

function renderRegionPanel() {
  const panel = document.getElementById("region-panel");
  const region = (state.data.regions || {})[state.region];
  if (!region) {
    panel.innerHTML = '<p class="empty">권역 데이터가 없습니다.</p>';
    return;
  }
  const nf = region.netflix || [];
  const tr = region.trends || [];
  const nfHtml = nf.length
    ? `<div class="list">${nf.map(netflixRow).join("")}</div>`
    : '<p class="empty">이번 주 Netflix Top10 내 애니가 없습니다.</p>';
  const trHtml = tr.length
    ? `<div class="list">${tr.map(trendsRow).join("")}</div>`
    : '<p class="empty">이번 주 관심도 데이터 없음</p>';

  panel.innerHTML = `
    <div class="region-cols">
      <div>
        <h3 class="col-head">실시청 <span class="pill">Netflix Top10</span></h3>
        ${nfHtml}
      </div>
      <div>
        <h3 class="col-head">관심도 <span class="pill">Google Trends</span></h3>
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
      kst = d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    } catch (e) { kst = gen; }
  }
  document.getElementById("updated").textContent =
    `최종 갱신: ${kst} (KST)` + (state.data.week ? ` · ${state.data.week}` : "");

  const s = state.data.sources || {};
  document.getElementById("sources").innerHTML =
    "데이터 출처: " +
    `<a href="${escapeHtml(s.anilist || "#")}" target="_blank" rel="noopener">AniList</a> · ` +
    `<a href="${escapeHtml(s.netflix || "#")}" target="_blank" rel="noopener">Netflix Tudum</a> · ` +
    `<a href="${escapeHtml(s.trends || "#")}" target="_blank" rel="noopener">Google Trends</a>`;
  document.getElementById("notes").textContent = state.data.notes || "";
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

// ---- init ----
async function init() {
  const main = document.querySelector("main");
  try {
    const res = await fetch("./data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (e) {
    main.innerHTML = `<p class="state-msg">데이터를 불러오지 못했습니다. (${escapeHtml(e.message)})<br/>` +
      "잠시 후 다시 시도해 주세요.</p>";
    return;
  }
  const keys = Object.keys(state.data.regions || {});
  state.region = keys[0] || null;

  renderMeta();
  wireSortToggle();
  renderGlobal();
  renderTabs();
  renderRegionPanel();
}

document.addEventListener("DOMContentLoaded", init);
