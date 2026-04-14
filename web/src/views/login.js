/**
 * Login / Register view.
 */

import { api, setToken } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "../toast.js";
import { icon } from "../icons.js";
import { createCurveLoader } from "../curveLoader.js";

export function renderLogin(app) {
  const params = new URLSearchParams(location.search);
  const nextPath = params.get("next");
  const safeNext = nextPath && nextPath.startsWith("/") ? nextPath : "/";

  app.innerHTML = `
    <div class="newsprint-page login-layout">
      <header class="np-masthead">
        <p class="np-kicker">Vol. 1 · ${new Date().toLocaleDateString("zh-CN")} · Night Edition</p>
        <h1>Nightclub Daily</h1>
      </header>
      <div class="login-card">
        <div class="login-card__logo" id="login-curve"></div>
        <h2 class="login-card__title">${icon.mapPin(20)} 推门入场</h2>
        <p class="login-card__subtitle">SIGN IN TO CONTINUE YOUR NIGHT PATH</p>
        <form id="auth-form" class="login-form">
          <label for="f-email">邮箱</label>
          <input type="email" id="f-email" class="input" placeholder="you@example.com" autocomplete="email" required />
          <label for="f-password">密码</label>
          <input type="password" id="f-password" class="input" placeholder="••••••••" autocomplete="current-password" required />
          <button type="submit" class="btn btn-primary">${icon.doorOpen(14)} 进入街区</button>
        </form>
        <p class="login-toggle">
          第一次来？<a id="btn-to-register">注册入场 →</a>
        </p>
      </div>
      <p class="np-edition">All the News That's Fit to Print.</p>
    </div>
  `;

  // Curve animation in logo area
  const curveContainer = document.getElementById("login-curve");
  const loader = createCurveLoader(curveContainer, "lissajous", {
    size: 64, color: "var(--accent)", rotate: true, rotateDur: 25000,
  });
  loader.start();

  document.getElementById("btn-to-register").addEventListener("click", () => {
    navigate(`/onboarding${safeNext !== "/" ? `?next=${encodeURIComponent(safeNext)}` : ""}`);
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/api/auth/login", {
        email: document.getElementById("f-email").value.trim(),
        password: document.getElementById("f-password").value,
      });
      setToken(res.access_token);
      showToast("登录成功，正在进入你的版面", "cyan");
      navigate(safeNext);
    } catch (err) {
      showToast(err.message, "pink");
    }
  });

  return () => loader.destroy();
}
