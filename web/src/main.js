/**
 * Agent://Night — main entry point.
 */

import { route, render } from "./router.js";
import { renderStreet } from "./views/street.js";
import { renderBar } from "./views/bar.js";
import { renderLogin } from "./views/login.js";
import { renderOnboarding } from "./views/onboarding.js";
import { renderMe } from "./views/me.js";
import { renderLobster } from "./views/lobster.js";
import { renderHot } from "./views/hot.js";

// ── Register routes ──
route("/", renderStreet);
route("/login", renderLogin);
route("/onboarding", renderOnboarding);
route("/bar/:id", renderBar);
route("/me", renderMe);
route("/lobster", renderLobster);
route("/hot", renderHot);

// ── Initial render ──
render();
