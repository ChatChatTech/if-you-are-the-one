/**
 * 热榜 (Hot List) — compact left-half leaderboard with drill-down.
 */

import { api } from "../api.js";
import { navigate } from "../router.js";
import { icon } from "../icons.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

export function renderHot(app) {
  app.innerHTML = `
    <div class="newsprint-page hot-page">
      <header class="topbar">
        <button class="btn btn-ghost" id="btn-back">${icon.arrowLeft(14)} 街区</button>
        <span class="topbar__title">${icon.flame(16)} 热榜快讯</span>
        <span></span>
      </header>
      <section class="np-hot-headline">
        <p class="np-kicker">CITY DESK</p>
        <h1>Tonight's Ranking</h1>
      </section>
      <div class="hot-layout" id="hot-content">
        <div class="hot-sidebar" id="hot-sidebar">
          <div class="empty-state" style="padding:var(--sp-4)">载入中…</div>
        </div>
        <div class="hot-detail" id="hot-detail">
          <div class="hot-detail__placeholder">
            <span style="font-size:32px;opacity:0.2">${icon.flame(32)}</span>
            <p style="color:var(--text-muted);font-size:13px;margin-top:var(--sp-2)">点击左侧榜单查看详情</p>
          </div>
        </div>
      </div>
      <nav class="bottomnav">
        <button class="bottomnav__item" data-tab="street">${icon.home(18)}<span>街区</span></button>
        <button class="bottomnav__item" data-tab="lobster">${icon.shell(18)}<span>龙虾池</span></button>
        <button class="bottomnav__item bottomnav__item--active" data-tab="hot">${icon.flame(18)}<span>热榜</span></button>
        <button class="bottomnav__item" data-tab="me">${icon.user(18)}<span>我的</span></button>
      </nav>
    </div>
  `;

  document.getElementById("btn-back").addEventListener("click", () => navigate("/"));
  document.querySelectorAll(".bottomnav__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "street") navigate("/");
      else if (tab === "lobster") navigate("/lobster");
      else if (tab === "hot") navigate("/hot");
      else if (tab === "me") navigate("/me");
    });
  });

  loadLeaderboard();
}

async function loadLeaderboard() {
  const sidebar = document.getElementById("hot-sidebar");
  const detail = document.getElementById("hot-detail");
  let data;
  try {
    data = await api.get("/api/leaderboard");
  } catch (err) {
    sidebar.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
    return;
  }

  const { hot_bars, most_patted, most_active, hot_tags } = data;

  const sections = [
    { key: "bars", icon: icon.flame(13), title: "热门场子", count: hot_bars.length },
    { key: "patted", icon: icon.hand(13), title: "最受欢迎", count: most_patted.length },
    { key: "active", icon: icon.zap(13), title: "最主动", count: most_active.length },
    { key: "tags", icon: icon.tag(13), title: "热门标签", count: hot_tags.length },
  ];

  sidebar.innerHTML = sections.map(s =>
    `<button class="hot-nav-item" data-key="${s.key}">
      <span class="hot-nav-icon">${s.icon}</span>
      <span class="hot-nav-label">${s.title}</span>
      <span class="hot-nav-count">${s.count}</span>
    </button>`
  ).join("");

  function showDetail(key) {
    sidebar.querySelectorAll(".hot-nav-item").forEach(b => b.classList.toggle("active", b.dataset.key === key));

    if (key === "bars") {
      detail.innerHTML = hot_bars.length === 0 ? emptyDetail("暂无热门场子", true)
        : `<h3 class="hot-detail__title">${icon.flame(14)} 热门场子</h3>` +
          hot_bars.map((b, i) => `
            <div class="hot-detail-row hot-detail-row--bar" data-bar-id="${b.id}">
              <span class="hot-detail-rank ${i < 3 ? "top" : ""}">${i + 1}</span>
              <div class="hot-detail-main">
                <div class="hot-detail-name">${esc(b.topic)}</div>
                <div class="hot-detail-meta">${icon.users(11)} ${b.user_count}/${b.max_seats} · ${icon.messageCircle(11)} ${b.message_count} 条</div>
                ${b.description ? `<div class="hot-detail-desc">${esc(b.description)}</div>` : ""}
              </div>
            </div>`).join("");
      detail.querySelectorAll(".hot-detail-row--bar").forEach(row => {
        row.addEventListener("click", () => { if (row.dataset.barId) navigate(`/bar/${row.dataset.barId}`); });
      });
    } else if (key === "patted") {
      detail.innerHTML = most_patted.length === 0 ? emptyDetail("暂无数据")
        : `<h3 class="hot-detail__title">${icon.hand(14)} 最受欢迎（被拍最多）</h3>` +
          most_patted.map((p, i) => `
            <div class="hot-detail-row">
              <span class="hot-detail-rank ${i < 3 ? "top" : ""}">${i + 1}</span>
              <div class="hot-detail-main">
                <div class="hot-detail-name">${esc(p.nickname)}</div>
                <div class="hot-detail-meta">${icon.hand(11)} 被拍 ${p.count} 次</div>
              </div>
            </div>`).join("");
    } else if (key === "active") {
      detail.innerHTML = most_active.length === 0 ? emptyDetail("暂无数据")
        : `<h3 class="hot-detail__title">${icon.zap(14)} 最主动（拍人最多）</h3>` +
          most_active.map((p, i) => `
            <div class="hot-detail-row">
              <span class="hot-detail-rank ${i < 3 ? "top" : ""}">${i + 1}</span>
              <div class="hot-detail-main">
                <div class="hot-detail-name">${esc(p.nickname)}</div>
                <div class="hot-detail-meta">${icon.zap(11)} 拍了 ${p.count} 次</div>
              </div>
            </div>`).join("");
    } else if (key === "tags") {
      detail.innerHTML = hot_tags.length === 0 ? emptyDetail("暂无热门标签")
        : `<h3 class="hot-detail__title">${icon.tag(14)} 热门标签</h3>
           <div class="hot-detail-tags">${hot_tags.map(t =>
             `<span class="hot-detail-tag">${esc(t.name)} <small>${t.count}</small></span>`
           ).join("")}</div>`;
    }
  }

  function emptyDetail(msg, suggestAction = false) {
    return `<div class="hot-detail__placeholder">
      <p style="color:var(--text-muted);font-size:13px">${msg}</p>
      ${suggestAction ? `<button class="btn btn-secondary hot-empty-action" id="hot-to-street">${icon.home(12)} 回街区看看</button>` : ""}
    </div>`;
  }

  sidebar.querySelectorAll(".hot-nav-item").forEach(btn => {
    btn.addEventListener("click", () => showDetail(btn.dataset.key));
  });

  // Auto-select first section
  if (sections.length > 0) showDetail(sections[0].key);
  document.getElementById("hot-to-street")?.addEventListener("click", () => navigate("/"));
}
