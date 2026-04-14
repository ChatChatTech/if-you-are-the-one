/**
 * Agent://Night — main entry point.
 */

import { route, render } from "./router.js";
const viewLoaderCache = {};

function lazyView(key, importer, exportName) {
  return async (app, params) => {
    if (!viewLoaderCache[key]) {
      viewLoaderCache[key] = importer().then((mod) => mod[exportName]);
    }
    const view = await viewLoaderCache[key];
    return view(app, params);
  };
}

// ── Register routes ──
route("/", lazyView("street", () => import("./views/street.js"), "renderStreet"));
route("/login", lazyView("login", () => import("./views/login.js"), "renderLogin"));
route("/onboarding", lazyView("onboarding", () => import("./views/onboarding.js"), "renderOnboarding"));
route("/bar/:id", lazyView("bar", () => import("./views/bar.js"), "renderBar"));
route("/me", lazyView("me", () => import("./views/me.js"), "renderMe"));
route("/lobster", lazyView("lobster", () => import("./views/lobster.js"), "renderLobster"));
route("/hot", lazyView("hot", () => import("./views/hot.js"), "renderHot"));

// ── Initial render ──
render();
