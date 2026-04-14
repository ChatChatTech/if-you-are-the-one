/**
 * Profile / "我的" — bento grid layout.
 */

import { api, isLoggedIn, clearToken } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "../toast.js";
import { icon } from "../icons.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

const TAG_CATEGORIES = [
  { key: "skill_offer", label: "我能提供", icon: "tag", color: "var(--success)" },
  { key: "skill_want", label: "我在找", icon: "search", color: "var(--accent)" },
  { key: "interests", label: "兴趣 / 话题", icon: "sparkles", color: "var(--pink)" },
];

export function renderMe(app) {
  if (!isLoggedIn()) {
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    return;
  }

  app.innerHTML = `
    <div class="me-layout newsprint-page me-newsprint">
    <header class="topbar">
      <button class="btn btn-ghost" id="btn-back-street">${icon.arrowLeft(14)} 街区</button>
      <span class="topbar__title">${icon.user(16)} 我的</span>
      <button class="btn btn-ghost" id="btn-logout">${icon.logOut(14)} 退出</button>
    </header>
    <section class="np-me-headline">
      <p class="np-kicker">PROFILE DESK</p>
      <h1>My Evening Ledger</h1>
      <p class="np-me-meta">Vol. 1 | ${new Date().toLocaleDateString("zh-CN")} | Personal Edition</p>
    </section>
    <div class="me-bento" id="profile-content">
      <div class="empty-state" style="grid-column:1/-1">载入中…</div>
    </div>
    <nav class="bottomnav">
      <button class="bottomnav__item" data-tab="street">${icon.home(18)}<span>街区</span></button>
      <button class="bottomnav__item" data-tab="lobster">${icon.shell(18)}<span>龙虾池</span></button>
      <button class="bottomnav__item" data-tab="hot">${icon.flame(18)}<span>热榜</span></button>
      <button class="bottomnav__item bottomnav__item--active" data-tab="me">${icon.user(18)}<span>我的</span></button>
    </nav>
    </div>
  `;

  document.getElementById("btn-back-street").addEventListener("click", () => navigate("/"));
  document.getElementById("btn-logout").addEventListener("click", () => {
    clearToken();
    navigate("/login");
  });

  document.querySelectorAll(".bottomnav__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "street") navigate("/");
      else if (tab === "lobster") navigate("/lobster");
      else if (tab === "hot") navigate("/hot");
      else if (tab === "me") navigate("/me");
    });
  });

  loadProfile();
}

async function loadProfile() {
  const el = document.getElementById("profile-content");
  let me, pats, availableTags;
  try {
    [me, pats, availableTags] = await Promise.all([
      api.get("/api/users/me"),
      api.get("/api/pats/received"),
      api.get("/api/network/tags/available"),
    ]);
  } catch (err) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>${esc(err.message)}</p></div>`;
    return;
  }

  const personalityBadge = me.personality
    ? me.personality.test_type === "mbti"
      ? `<span class="badge-personality badge-personality--mbti">${esc(me.personality.result)}</span>`
      : `<span class="badge-personality badge-personality--sbti">${esc(me.personality.result)} · ${esc(me.personality.result_cn)}</span>`
    : `<span class="badge badge-default">未测试</span>`;

  const tagSectionsHTML = TAG_CATEGORIES.map((cat) => {
    const tags = me[cat.key] || [];
    const iconFn = icon[cat.icon] || icon.tag;
    return `
      <div class="me-tag-section" data-cat="${cat.key}">
        <h3 class="me-tag-section__title" style="color:${cat.color}">
          ${iconFn(12)} ${cat.label}
        </h3>
        <div class="me-tag-list" id="tags-${cat.key}">
          ${tags.map((t) => `<span class="me-tag" data-tag="${esc(t)}" style="border-color:${cat.color}33;color:${cat.color}">${esc(t)} <button class="me-tag__rm" title="移除 ${esc(t)}" aria-label="移除 ${esc(t)}">&times;</button></span>`).join("")}
        </div>
        <div class="me-tag-input-row">
          <input class="me-tag-input" id="input-${cat.key}" type="text"
            list="dl-${cat.key}" placeholder="输入关键词，回车添加"
            maxlength="20" autocomplete="off" />
          <button type="button" class="btn btn-secondary btn-sm me-tag-add-btn" id="add-${cat.key}">添加</button>
          <datalist id="dl-${cat.key}">
            ${(availableTags || []).map((t) => `<option value="${esc(t.name)}">`).join("")}
          </datalist>
        </div>
      </div>`;
  }).join("");

  el.innerHTML = `
    <!-- Card 1: Avatar (tall, spans 2 rows) -->
    <div class="bento-card bento-avatar">
      ${me.avatar_url
        ? `<img class="bento-avatar__img" src="${me.avatar_url}" alt="" />`
        : `<div class="bento-avatar__placeholder">👤</div>`}
      <h2 class="bento-avatar__name">${esc(me.nickname)}</h2>
      <p class="bento-avatar__bio">${esc(me.bio)}</p>
    </div>

    <!-- Card 2: Stats -->
    <div class="bento-card bento-stats">
      <div class="bento-stat">
        <span class="bento-stat__value">${me.total_pats_received}</span>
        <span class="bento-stat__label">${icon.hand(12)} 被拍</span>
      </div>
      <div class="bento-stat">
        <span class="bento-stat__value">${(me.skill_offer || []).length + (me.skill_want || []).length + (me.interests || []).length}</span>
        <span class="bento-stat__label">${icon.tag(12)} 关键词</span>
      </div>
      <div class="bento-stat-badge">${personalityBadge}</div>
    </div>

    <!-- Card 3: Keywords (wide, spans 2 cols) -->
    <div class="bento-card bento-keywords">
      <h3 class="bento-card__title">${icon.tag(14)} 我的关键词</h3>
      <p class="me-keywords-panel__hint">关键词会在街区图谱中把你和有相同关键词的人连起来</p>
      ${tagSectionsHTML}
    </div>

    <!-- Card 4: Who patted me -->
    <div class="bento-card bento-pats">
      <h3 class="bento-card__title">${icon.hand(14)} 谁拍了我</h3>
      ${pats.length === 0 ? '<p style="color:var(--text-muted);font-size:13px">还没人拍你</p>' : `
        <div class="bento-pats__list">
          ${pats.map((p) => `
            <div class="bento-pat-row">
              <span class="bento-pat-name">${esc(p.from_nickname)}</span>
              <span class="bento-pat-count">${icon.hand(10)} ${p.count}</span>
            </div>
          `).join("")}
        </div>
      `}
    </div>

    <!-- Card 5: Agent / DID -->
    <div class="bento-card bento-agent">
      <h3 class="bento-card__title">${icon.shell(14)} 我的龙虾</h3>
      ${me.agent_bound
        ? `<p class="bento-agent__did">DID: <code>${esc(me.agent_did)}</code></p>`
        : `<p class="bento-agent__did">UUID: <code>${esc(me.uuid)}</code></p>`
      }
    </div>
  `;

  // ── Tag interaction: add / remove ──
  const MAX_TAGS = 10;
  const tagState = {};
  for (const cat of TAG_CATEGORIES) {
    tagState[cat.key] = [...(me[cat.key] || [])];
  }

  async function saveCategory(catKey) {
    try {
      await api.patch("/api/users/me", { [catKey]: tagState[catKey] });
    } catch (err) {
      showToast("保存失败: " + err.message, "pink");
    }
  }

  function renderTagList(catKey) {
    const cat = TAG_CATEGORIES.find((c) => c.key === catKey);
    const container = document.getElementById(`tags-${catKey}`);
    if (!container) return;
    container.innerHTML = tagState[catKey].map((t) =>
      `<span class="me-tag" data-tag="${esc(t)}" style="border-color:${cat.color}33;color:${cat.color}">${esc(t)} <button class="me-tag__rm" title="移除">&times;</button></span>`
    ).join("");
  }

  function addTag(catKey, valRaw) {
    const val = valRaw.trim();
    if (!val) return { ok: false };
    if (tagState[catKey].length >= MAX_TAGS) {
      showToast(`最多 ${MAX_TAGS} 个关键词`, "pink");
      return { ok: false };
    }
    if (tagState[catKey].includes(val)) {
      showToast("已有此关键词", "pink");
      return { ok: false };
    }
    tagState[catKey].push(val);
    renderTagList(catKey);
    return { ok: true, value: val };
  }

  for (const cat of TAG_CATEGORIES) {
    const input = document.getElementById(`input-${cat.key}`);
    const addBtn = document.getElementById(`add-${cat.key}`);
    if (!input) continue;
    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const result = addTag(cat.key, input.value);
      if (!result.ok) return;
      input.value = "";
      await saveCategory(cat.key);
      showToast(`已添加「${result.value}」`, "cyan");
    });

    addBtn?.addEventListener("click", async () => {
      const result = addTag(cat.key, input.value);
      if (!result.ok) return;
      input.value = "";
      await saveCategory(cat.key);
      showToast(`已添加「${result.value}」`, "cyan");
    });
  }

  el.addEventListener("click", async (e) => {
    const rmBtn = e.target.closest(".me-tag__rm");
    if (!rmBtn) return;
    const tagEl = rmBtn.closest(".me-tag");
    const tagName = tagEl?.dataset.tag;
    const section = tagEl?.closest(".me-tag-section");
    const catKey = section?.dataset.cat;
    if (!tagName || !catKey || !tagState[catKey]) return;

    tagState[catKey] = tagState[catKey].filter((t) => t !== tagName);
    renderTagList(catKey);
    await saveCategory(catKey);
    showToast(`已移除「${tagName}」`, "cyan");
  });
}
