const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("tads_token");
}

export function setSession(token, user) {
  window.localStorage.setItem("tads_token", token);
  window.localStorage.setItem("tads_user", JSON.stringify(user));
}

export function getUser() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("tads_user");
  return raw ? JSON.parse(raw) : null;
}

// Mescla campos (ex: avatarUrl novo) no usuário salvo na sessão sem precisar
// logar de novo, e devolve o objeto já atualizado pra colocar no state.
export function updateStoredUser(patch) {
  if (typeof window === "undefined") return null;
  const current = getUser();
  if (!current) return null;
  const merged = { ...current, ...patch };
  window.localStorage.setItem("tads_user", JSON.stringify(merged));
  return merged;
}

export function clearSession() {
  window.localStorage.removeItem("tads_token");
  window.localStorage.removeItem("tads_user");
}

export async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Sessão expirada.");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
  return data;
}
