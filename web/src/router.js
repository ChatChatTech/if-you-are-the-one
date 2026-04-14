/**
 * Simple client-side router for SPA navigation.
 */

const routes = {};
let currentCleanup = null;
let renderVersion = 0;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  history.pushState(null, "", path);
  render();
}

export function render() {
  const currentVersion = ++renderVersion;
  const path = location.pathname;
  const app = document.getElementById("app");
  if (!app) return;

  // Cleanup previous view
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  // Find matching route (exact or parameterized)
  let handler = routes[path];
  let params = {};

  if (!handler) {
    for (const [pattern, h] of Object.entries(routes)) {
      const regex = new RegExp("^" + pattern.replace(/:([^/]+)/g, "(?<$1>[^/]+)") + "$");
      const match = path.match(regex);
      if (match) {
        handler = h;
        params = match.groups || {};
        break;
      }
    }
  }

  if (!handler) {
    app.innerHTML = `<div class="empty-state"><p>404 — 这条街走不通</p></div>`;
    return;
  }

  const result = handler(app, params);
  if (result && typeof result.then === "function") {
    result
      .then((resolved) => {
        if (currentVersion !== renderVersion) {
          if (typeof resolved === "function") resolved();
          return;
        }
        if (typeof resolved === "function") {
          currentCleanup = resolved;
        }
      })
      .catch((err) => {
        if (currentVersion !== renderVersion) return;
        app.innerHTML = `<div class="empty-state"><p>页面加载失败：${err?.message || "Unknown error"}</p></div>`;
      });
    return;
  }

  if (typeof result === "function") {
    currentCleanup = result;
  }
}

// Handle back/forward
window.addEventListener("popstate", render);
