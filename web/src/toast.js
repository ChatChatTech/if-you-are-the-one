/**
 * Toast notification system.
 */

export function showToast(message, type = "pink", duration = 3000) {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
