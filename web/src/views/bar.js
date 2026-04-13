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
    <header class="topbar">
      <button class="btn btn-ghost" id="btn-back">${icon.arrowLeft(14)} 回到街区</button>
      <span class="topbar__title" id="bar-topic">载入中…</span>
      <span id="bar-timer" style="color:var(--text-muted);font-size:12px"></span>
    </header>
    <div class="chat-feed" id="chat-feed"></div>
    <div class="msg-input" id="msg-area" style="display:none">
      <input type="text" id="msg-text" placeholder="说点什么…" maxlength="2000" autocomplete="off" />
      <button class="btn btn-primary" id="btn-send">发送</button>
    </div>
  `;

  document.getElementById("btn-back").addEventListener("click", () => navigate("/"));

  init();

  async function init() {
    try {
      const bar = await api.get(`/api/bars/${id}`);
      document.getElementById("bar-topic").innerHTML = `${icon.wine(14)} ${esc(bar.topic)}`;

      // Load messages
      const messages = await api.get(`/api/bars/${id}/messages`);
      renderMessages(messages);

      if (isLoggedIn()) {
        currentUser = await api.get("/api/users/me");
        document.getElementById("msg-area").style.display = "flex";

        // Auto join if not in this bar
        if (currentUser.current_bar_id !== id && bar.status !== "sealed") {
          await api.post(`/api/bars/${id}/join`);
        }

        connectWs();
        setupInput();
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
