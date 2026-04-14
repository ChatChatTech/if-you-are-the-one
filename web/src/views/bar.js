/**
 * Bar interior view — chat + members.
 */

import { api, isLoggedIn, getToken } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "../toast.js";
import { icon } from "../icons.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

export function renderBar(app, { id }) {
  let ws = null;
  let currentUser = null;

  app.innerHTML = `
    <div class="newsprint-page bar-newsprint">
      <header class="topbar">
        <button class="btn btn-ghost" id="btn-back">${icon.arrowLeft(14)} 回到街区</button>
        <span class="topbar__title">${icon.wine(16)} BAR DESK</span>
        <span></span>
      </header>
      <section class="np-bar-headline">
        <p class="np-kicker">LIVE ROOM</p>
        <h1 id="bar-topic">载入中…</h1>
        <p class="np-bar-meta" id="bar-timer">正在获取房间状态</p>
      </section>
      <section class="bar-brief" id="bar-brief"></section>
      <div class="chat-feed" id="chat-feed"></div>
      <div class="bar-auth-tip" id="bar-auth-tip" style="display:none">
        <p>登录后可进入实时聊天并发送消息。</p>
        <button class="btn btn-secondary" id="btn-login-chat">${icon.doorOpen(12)} 登录后加入</button>
      </div>
      <div class="msg-input" id="msg-area" style="display:none">
        <input type="text" id="msg-text" placeholder="说点什么…" maxlength="2000" autocomplete="off" />
        <button class="btn btn-primary" id="btn-send">发送</button>
      </div>
    </div>
  `;

  document.getElementById("btn-back").addEventListener("click", () => navigate("/"));

  init();

  async function init() {
    try {
      const bar = await api.get(`/api/bars/${id}`);
      document.getElementById("bar-topic").textContent = bar.topic;
      document.getElementById("bar-timer").textContent = `状态：${bar.status} · 席位 ${bar.current_users.length}/${bar.max_seats}`;
      document.getElementById("bar-brief").innerHTML = `
        <div class="bar-brief__label">City Brief</div>
        <p class="bar-brief__desc">${bar.description ? esc(bar.description) : "今晚的讨论正在这里发生，推门入场，留下你的观点。"}</p>
      `;

      // Load messages
      const messages = await api.get(`/api/bars/${id}/messages`);
      renderMessages(messages);

      if (isLoggedIn()) {
        currentUser = await api.get("/api/users/me");
        document.getElementById("msg-area").style.display = "flex";
        document.getElementById("bar-auth-tip").style.display = "none";

        // Auto join if not in this bar
        if (currentUser.current_bar_id !== id && bar.status !== "sealed") {
          await api.post(`/api/bars/${id}/join`);
        }

        connectWs();
        setupInput();
      } else {
        document.getElementById("bar-auth-tip").style.display = "block";
        document.getElementById("btn-login-chat")?.addEventListener("click", () => {
          navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
        });
      }
    } catch (err) {
      showToast(err.message, "pink");
    }
  }

  function renderMessages(msgs) {
    const feed = document.getElementById("chat-feed");
    if (msgs.length === 0) {
      feed.innerHTML = `<div class="empty-state"><p>安静的场子，说点什么打破沉默吧</p></div>`;
      return;
    }
    feed.innerHTML = msgs.map((m) => {
      const isSelf = currentUser && m.user_uuid === currentUser.uuid;
      const cls = isSelf ? "msg-bubble msg-bubble--self" : "msg-bubble msg-bubble--other";
      const time = m.created_at ? new Date(m.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
      return `
        <div class="${cls}">
          ${!isSelf ? `<div class="msg-bubble__meta">${esc(m.nickname)} ${time}</div>` : `<div class="msg-bubble__meta">${time}</div>`}
          <div>${esc(m.content)}</div>
        </div>`;
    }).join("");
    feed.scrollTop = feed.scrollHeight;
  }

  function appendMessage(msg) {
    const feed = document.getElementById("chat-feed");
    // Clear empty state
    const empty = feed.querySelector(".empty-state");
    if (empty) empty.remove();

    const isSelf = currentUser && msg.user_uuid === currentUser.uuid;
    const cls = isSelf ? "msg-bubble msg-bubble--self" : "msg-bubble msg-bubble--other";
    const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = `
      ${!isSelf ? `<div class="msg-bubble__meta">${esc(msg.nickname)} ${time}</div>` : `<div class="msg-bubble__meta">${time}</div>`}
      <div>${esc(msg.content)}</div>`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  function connectWs() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws/bar/${id}`;
    ws = new WebSocket(url);
    ws.onopen = () => console.log("[ws] connected", url);
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.event === "message.new") {
        appendMessage(data.data);
      } else if (data.event === "user.joined") {
        showToast(`${data.data.nickname} 推门进来了`, "cyan", 2000);
      } else if (data.event === "user.left") {
        showToast(`${data.data.nickname} 离开了场子`, "cyan", 2000);
      }
    };
    ws.onerror = (e) => console.warn("[ws] error", e);
    ws.onclose = (evt) => {
      console.log("[ws] closed", evt.code);
      if (evt.code !== 1000 && document.getElementById("chat-feed")) {
        setTimeout(connectWs, 2000);
      }
    };
  }

  function setupInput() {
    const input = document.getElementById("msg-text");
    const btn = document.getElementById("btn-send");

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      try {
        await api.post(`/api/bars/${id}/messages`, { content: text });
      } catch (err) {
        showToast(err.message, "pink");
      }
    }

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  // Return cleanup function
  return () => {
    if (ws) ws.close();
  };
}
