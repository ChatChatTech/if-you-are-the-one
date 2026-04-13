/**
 * Login / Register view.
 */

import { api, setToken } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "../toast.js";
import { icon } from "../icons.js";
import { createCurveLoader } from "../curveLoader.js";

export function renderLogin(app) {
  app.innerHTML = `
    <div class="login-layout">
      <div class="login-card">
        <div class="login-card__logo" id="login-curve"></div>
        <h1 class="login-card__title">${icon.mapPin(20)} nightclub</h1>
        <p class="login-card__subtitle">agent://nightclub · 让连接在夜色里发光</p>
        <form id="auth-form" class="login-form">
          <label>邮箱</label>
          <input type="email" id="f-email" class="input" placeholder="you@example.com" required />
          <label>密码</label>
          <input type="password" id="f-password" class="input" placeholder="••••••••" required />
          <button type="submit" class="btn btn-primary">${icon.doorOpen(14)} 推门进入</button>
        </form>
        <p class="login-toggle">
          第一次来？<a id="btn-to-register">注册入场 →</a>
        </p>
      </div>
    </div>
  `;

  // Curve animation in logo area
  const curveContainer = document.getElementById("login-curve");
  const loader = createCurveLoader(curveContainer, "lissajous", {
    size: 64, color: "var(--accent)", rotate: true, rotateDur: 25000,
  });
  loader.start();

  document.getElementById("btn-to-register").addEventListener("click", () => navigate("/onboarding"));

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/api/auth/login", {
        email: document.getElementById("f-email").value.trim(),
        password: document.getElementById("f-password").value,
      });
      setToken(res.access_token);
      showToast("欢迎回到 nightclub", "cyan");
      navigate("/");
    } catch (err) {
      showToast(err.message, "pink");
    }
  });

  return () => loader.destroy();
}
