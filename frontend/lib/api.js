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

// Baixa um arquivo (CSV/Excel) de uma rota que devolve o binário direto,
// em vez de JSON — usado pelos relatórios exportáveis da Administração.
// Precisa de um helper à parte porque api() sempre espera/faz parse de JSON.
export async function apiDownload(path, filename) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || `Erro ${res.status}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
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
