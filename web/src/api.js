/**
 * API client — wraps fetch with auth token handling.
 */

let _token = localStorage.getItem("night_token");

export function setToken(token) {
  _token = token;
  localStorage.setItem("night_token", token);
}

export function getToken() {
  return _token;
}

export function clearToken() {
  _token = null;
  localStorage.removeItem("night_token");
}

export function isLoggedIn() {
  return !!_token;
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path) => request("GET", path),
  post:   (path, body) => request("POST", path, body),
  patch:  (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};
