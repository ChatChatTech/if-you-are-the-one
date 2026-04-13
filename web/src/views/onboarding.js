/**
 * Onboarding wizard — 5 steps per design doc §2.
 * Step 1: Basic info (nickname, bio, contact)
 * Step 2: Skills & interests (tag input)
 * Step 3: Humation avatar editor
 * Step 4: Personality test (MBTI or SBTI)
 * Step 5: Agent passport (show UUID, done)
 */

import { api, setToken, isLoggedIn } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "../toast.js";
import { createAvatarEditor } from "../avatar/avatarEditor.js";
import { icon } from "../icons.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

const STEP_TITLES = ["基础信息", "技能 & 兴趣", "形象定制", "性格测试", "Agent 护照"];

export function renderOnboarding(app) {
  let step = 0;
  let avatarEditorApi = null;
  let testType = null; // 'mbti' | 'sbti'
  let questions = [];
  let currentQ = 0;
  let answers = {};
  let personalityResult = null;
  let userProfile = null;

  // Collect data across steps
  const data = {
    nickname: "",
    bio: "",
    email: "",
    password: "",
    skill_offer: [],
    skill_want: [],
    interests: [],
  };

  function renderShell() {
    app.innerHTML = `
      <div class="onboarding-wrap">
        <div class="onboarding-header">
          <h1 class="topbar__title" style="font-size:24px">${icon.mapPin(20)} nightclub</h1>
          <div class="onboarding-progress">
            ${STEP_TITLES.map((t, i) => `<div class="progress-dot ${i <= step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}" title="${t}"><span>${i + 1}</span></div>`).join('<div class="progress-line"></div>')}
          </div>
          <p class="onboarding-step-label">${STEP_TITLES[step]}</p>
        </div>
        <div class="onboarding-body glass-panel" id="ob-body"></div>
        <div class="onboarding-footer" id="ob-footer"></div>
      </div>`;
  }

  function renderStep() {
    renderShell();
    const body = document.getElementById("ob-body");
    const footer = document.getElementById("ob-footer");
    if (step === 0) renderStep0(body, footer);
    else if (step === 1) renderStep1(body, footer);
    else if (step === 2) renderStep2(body, footer);
    else if (step === 3) renderStep3(body, footer);
    else if (step === 4) renderStep4(body, footer);
  }

  // ── Step 0: Basic info + account creation ──
  function renderStep0(body, footer) {
    body.innerHTML = `
      <div class="ob-form">
        <label class="ob-label">昵称 <span class="ob-required">*</span></label>
        <input type="text" id="f-nickname" class="ob-input" placeholder="今晚姓什么？" value="${esc(data.nickname)}" maxlength="30" required />

        <label class="ob-label">一句话介绍</label>
        <input type="text" id="f-bio" class="ob-input" placeholder="一句话让别人记住你" value="${esc(data.bio)}" maxlength="200" />

        <label class="ob-label">邮箱 <span class="ob-required">*</span></label>
        <input type="email" id="f-email" class="ob-input" placeholder="you@example.com" value="${esc(data.email)}" />

        <label class="ob-label">密码 <span class="ob-required">*</span></label>
        <input type="password" id="f-password" class="ob-input" placeholder="至少 6 位" value="${esc(data.password)}" />
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btn-to-login">已有账号？登录</button>
      <button class="btn btn-primary" id="btn-next">下一步 ${icon.arrowLeft(12)}</button>`;

    document.getElementById("btn-to-login").addEventListener("click", () => navigate("/login"));
    document.getElementById("btn-next").addEventListener("click", async () => {
      data.nickname = document.getElementById("f-nickname").value.trim();
      data.bio = document.getElementById("f-bio").value.trim();
      data.email = document.getElementById("f-email").value.trim();
      data.password = document.getElementById("f-password").value;

      if (!data.nickname) { showToast("请输入昵称", "pink"); return; }
      if (!data.email) { showToast("请输入邮箱", "pink"); return; }
      if (!data.password || data.password.length < 6) { showToast("密码至少 6 位", "pink"); return; }

      try {
        // Register account
        const res = await api.post("/api/auth/register", {
          nickname: data.nickname,
          bio: data.bio,
          email: data.email,
          password: data.password,
        });
        setToken(res.access_token);
        showToast("账号已创建，欢迎入场", "cyan");
        step = 1;
        renderStep();
      } catch (err) {
        showToast(err.message, "pink");
      }
    });
  }

  // ── Step 1: Skills & Interests ──
  function renderStep1(body, footer) {
    body.innerHTML = `
      <div class="ob-form">
        <label class="ob-label">${icon.tag(12)} 我能提供的技能</label>
        <div class="tag-input-wrap" id="offer-tags">
          <div class="tag-list" id="offer-list"></div>
          <input type="text" class="ob-input tag-input" id="offer-input" placeholder="输入技能后按回车，如: React, Python..." />
        </div>

        <label class="ob-label">${icon.search(12)} 我想找的技能 / 资源</label>
        <div class="tag-input-wrap" id="want-tags">
          <div class="tag-list" id="want-list"></div>
          <input type="text" class="ob-input tag-input" id="want-input" placeholder="如: 设计师, 投资人..." />
        </div>

        <label class="ob-label">${icon.lightbulb(12)} 兴趣 / 话题</label>
        <div class="tag-input-wrap" id="interest-tags">
          <div class="tag-list" id="interest-list"></div>
          <input type="text" class="ob-input tag-input" id="interest-input" placeholder="如: AI, Web3, 独立开发..." />
        </div>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btn-skip">跳过</button>
      <button class="btn btn-primary" id="btn-next">下一步 ${icon.arrowLeft(12)}</button>`;

    // Tag input setup
    setupTagInput("offer", data.skill_offer);
    setupTagInput("want", data.skill_want);
    setupTagInput("interest", data.interests);

    document.getElementById("btn-skip").addEventListener("click", () => { step = 2; renderStep(); });
    document.getElementById("btn-next").addEventListener("click", async () => {
      try {
        await api.patch("/api/users/me", {
          skill_offer: data.skill_offer,
          skill_want: data.skill_want,
          interests: data.interests,
        });
        step = 2;
        renderStep();
      } catch (err) {
        showToast(err.message, "pink");
      }
    });
  }

  function setupTagInput(prefix, arr) {
    const list = document.getElementById(`${prefix}-list`);
    const input = document.getElementById(`${prefix}-input`);

    function renderTags() {
      list.innerHTML = arr.map((t, i) =>
        `<span class="tag tag-removable">${esc(t)}<button class="tag-remove" data-idx="${i}">×</button></span>`
      ).join("");
    }
    renderTags();

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = input.value.trim().replace(/,$/,"");
        if (val && !arr.includes(val) && arr.length < 10) {
          arr.push(val);
          input.value = "";
          renderTags();
        }
      }
    });

    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".tag-remove");
      if (btn) {
        arr.splice(Number(btn.dataset.idx), 1);
        renderTags();
      }
    });
  }

  // ── Step 2: Avatar Editor ──
  function renderStep2(body, footer) {
    body.innerHTML = `
      <div class="ob-form">
        <p class="ob-hint">定制你的形象，让别人在夜色里认出你</p>
        <div id="avatar-editor-container"></div>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btn-skip">跳过</button>
      <button class="btn btn-primary" id="btn-next">下一步 ${icon.arrowLeft(12)}</button>`;

    const container = document.getElementById("avatar-editor-container");
    avatarEditorApi = createAvatarEditor(container);

    document.getElementById("btn-skip").addEventListener("click", () => { step = 3; renderStep(); });
    document.getElementById("btn-next").addEventListener("click", async () => {
      try {
        const payload = avatarEditorApi.getPayload();
        await api.patch("/api/users/me", {
          avatar_config: payload.avatar_config,
          avatar_url: payload.avatar_url,
        });
        showToast("头像已保存", "cyan");
        step = 3;
        renderStep();
      } catch (err) {
        showToast(err.message, "pink");
      }
    });
  }

  // ── Step 3: Personality Test ──
  function renderStep3(body, footer) {
    if (!testType) {
      // Show test type selection
      body.innerHTML = `
        <div class="ob-form" style="text-align:center">
          <p class="ob-hint" style="margin-bottom:var(--sp-6)">选一个测试，让 nightclub 更懂你</p>
          <div class="test-type-grid">
            <button class="test-type-card glass-panel" data-test="mbti">
              <span class="test-type-icon">${icon.brain(28)}</span>
              <h3>MBTI</h3>
              <p>经典 16 型人格<br>20 道黑客松情境题</p>
              <span class="badge-personality badge-personality--mbti">~3 分钟</span>
            </button>
            <button class="test-type-card glass-panel" data-test="sbti">
              <span class="test-type-icon">${icon.beer(28)}</span>
              <h3>SBTI · 社交酒局指数</h3>
              <p>25 种社交原型<br>30+ 道喝酒社交题</p>
              <span class="badge-personality badge-personality--sbti">~5 分钟</span>
            </button>
          </div>
        </div>`;

      footer.innerHTML = `
        <button class="btn btn-ghost" id="btn-skip">跳过测试</button>`;

      document.getElementById("btn-skip").addEventListener("click", () => { step = 4; renderStep(); });

      body.querySelectorAll(".test-type-card").forEach((btn) => {
        btn.addEventListener("click", async () => {
          testType = btn.dataset.test;
          try {
            const res = await api.get(`/api/personality/questions?type=${testType}`);
            questions = res.questions;
            currentQ = 0;
            answers = {};
            renderStep();
          } catch (err) {
            showToast(err.message, "pink");
            testType = null;
          }
        });
      });

    } else if (!personalityResult) {
      // Show current question
      renderQuestion(body, footer);
    } else {
      // Show result
      renderResult(body, footer);
    }
  }

  function renderQuestion(body, footer) {
    const q = questions[currentQ];
    const total = questions.length;
    const pct = Math.round(((currentQ) / total) * 100);

    body.innerHTML = `
      <div class="ob-form quiz-panel">
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${pct}%"></div>
        </div>
        <p class="quiz-counter">${currentQ + 1} / ${total}</p>
        <h3 class="quiz-question">${esc(q.text)}</h3>
        <div class="quiz-options">
          ${q.options.map((opt) => `
            <button class="quiz-option glass-panel ${answers[q.id] == opt.value ? 'is-selected' : ''}" data-qid="${q.id}" data-val="${opt.value}">
              ${esc(opt.label)}
            </button>
          `).join("")}
        </div>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btn-prev-q" ${currentQ === 0 ? 'disabled' : ''}>${icon.arrowLeft(12)} 上一题</button>
      <button class="btn btn-primary" id="btn-next-q" ${!answers[q.id] && answers[q.id] !== 0 ? 'disabled' : ''}>
        ${currentQ === total - 1 ? '提交测试' : '下一题'}
      </button>`;

    body.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        answers[btn.dataset.qid] = btn.dataset.val;
        // Auto-advance after short delay
        body.querySelectorAll(".quiz-option").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        document.getElementById("btn-next-q").disabled = false;
      });
    });

    document.getElementById("btn-prev-q").addEventListener("click", () => {
      if (currentQ > 0) { currentQ--; renderStep(); }
    });

    document.getElementById("btn-next-q").addEventListener("click", async () => {
      if (!answers[q.id] && answers[q.id] !== 0) return;
      if (currentQ < total - 1) {
        currentQ++;
        renderStep();
      } else {
        // Submit
        try {
          const btn = document.getElementById("btn-next-q");
          btn.textContent = "提交中...";
          btn.disabled = true;
          const result = await api.post("/api/personality/submit", {
            test_type: testType,
            answers,
          });
          personalityResult = result;
          renderStep();
        } catch (err) {
          showToast(err.message, "pink");
        }
      }
    });
  }

  function renderResult(body, footer) {
    const r = personalityResult;
    const isMbti = r.test_type === "mbti";
    const badgeCls = isMbti ? "badge-personality--mbti" : "badge-personality--sbti";

    let dimensionsHtml = "";
    if (r.sbti_dimensions) {
      const dims = Object.entries(r.sbti_dimensions);
      dimensionsHtml = `
        <div class="sbti-dims">
          ${dims.map(([k, v]) => `<span class="sbti-dim-chip sbti-dim-${v.toLowerCase()}">${k}:${v}</span>`).join("")}
        </div>`;
    }

    body.innerHTML = `
      <div class="ob-form" style="text-align:center">
        <div class="result-reveal">
          <span class="result-emoji">${isMbti ? icon.brain(36) : icon.beer(36)}</span>
          <h2 class="result-type">${esc(r.result)}</h2>
          ${r.result_cn ? `<p class="result-cn">${esc(r.result_cn)}</p>` : ''}
          <span class="badge-personality ${badgeCls}" style="font-size:14px;padding:4px 16px">${esc(r.test_type.toUpperCase())}</span>
          ${dimensionsHtml}
        </div>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btn-retest">重新测试</button>
      <button class="btn btn-primary" id="btn-next">下一步 ${icon.arrowLeft(12)}</button>`;

    document.getElementById("btn-retest").addEventListener("click", () => {
      testType = null;
      personalityResult = null;
      questions = [];
      currentQ = 0;
      answers = {};
      renderStep();
    });
    document.getElementById("btn-next").addEventListener("click", () => { step = 4; renderStep(); });
  }

  // ── Step 4: Agent Passport ──
  function renderStep4(body, footer) {
    loadPassport(body, footer);
  }

  async function loadPassport(body, footer) {
    try {
      userProfile = await api.get("/api/users/me");
    } catch (err) {
      body.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
      return;
    }

    const u = userProfile;
    const personalityHtml = u.personality
      ? `<span class="badge-personality ${u.personality.test_type === 'mbti' ? 'badge-personality--mbti' : 'badge-personality--sbti'}">
          ${esc(u.personality.result)}${u.personality.result_cn ? ' · ' + esc(u.personality.result_cn) : ''}
        </span>`
      : '<span style="color:var(--text-muted)">未测试</span>';

    const avatarHtml = u.avatar_url
      ? `<img src="${u.avatar_url}" alt="Avatar" class="passport-avatar" />`
      : `<div class="passport-avatar-placeholder">${icon.user(32)}</div>`;

    body.innerHTML = `
      <div class="passport-card">
        <div class="passport-header">
          ${avatarHtml}
          <div class="passport-info">
            <h2>${esc(u.nickname)}</h2>
            <p class="passport-bio">${esc(u.bio)}</p>
          </div>
        </div>
        <div class="passport-fields">
          <div class="passport-field">
            <span class="passport-key">UUID</span>
            <code class="passport-val">${esc(u.uuid)}</code>
          </div>
          <div class="passport-field">
            <span class="passport-key">性格</span>
            ${personalityHtml}
          </div>
          <div class="passport-field">
            <span class="passport-key">技能</span>
            <span>${(u.skill_offer || []).map(s => `<span class="tag">${esc(s)}</span>`).join(' ') || '—'}</span>
          </div>
          <div class="passport-field">
            <span class="passport-key">想找</span>
            <span>${(u.skill_want || []).map(s => `<span class="tag">${esc(s)}</span>`).join(' ') || '—'}</span>
          </div>
          <div class="passport-field">
            <span class="passport-key">Agent</span>
            <span style="color:var(--text-muted)">${u.agent_bound ? icon.shield(12) + ' 已绑定' : icon.hourglass(12) + ' 进入夜场后可绑定'}</span>
          </div>
        </div>
        <p class="passport-hint">这是你的 agent://nightclub 通行证，推门后就是你的身份</p>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-primary btn-lg" id="btn-enter" style="width:100%">${icon.doorOpen(14)} 推门进入 nightclub</button>`;

    document.getElementById("btn-enter").addEventListener("click", () => {
      showToast("欢迎来到 nightclub！今晚这里有人。", "cyan");
      navigate("/");
    });
  }

  // Start
  if (isLoggedIn()) {
    // If already logged in, skip to step 1
    step = 1;
  }
  renderStep();
}
