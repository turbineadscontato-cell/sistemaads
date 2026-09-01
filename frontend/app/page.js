"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, setSession, getUser } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getUser()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      setSession(data.token, data.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#ff7a1a" strokeWidth="1.6" />
            <path d="M12 12 L12 4.2 A7.8 7.8 0 0 1 18.7 8.3 Z" fill="#ff7a1a" />
            <path d="M12 12 L18.7 15.7 A7.8 7.8 0 0 1 12 19.8 Z" fill="#ff7a1a" opacity=".65" />
            <path d="M12 12 L5.3 15.7 A7.8 7.8 0 0 1 5.3 8.3 Z" fill="#ff7a1a" opacity=".35" />
            <circle cx="12" cy="12" r="2" fill="#0b0b0c" />
          </svg>
          <span className="font-display font-bold text-lg text-ink">TurbinaADS</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl shadow-sm p-6">
          <h1 className="font-display font-semibold text-base text-ink mb-1">Entrar no painel</h1>
          <p className="text-inksoft text-xs mb-5">Acesso restrito à equipe TurbinaADS.</p>

          <label className="block text-xs font-medium text-inksoft mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-3 px-3 py-2 text-sm rounded-lg border border-border bg-surface2 focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="voce@turbineads.com.br"
          />

          <label className="block text-xs font-medium text-inksoft mb-1">Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 px-3 py-2 text-sm rounded-lg border border-border bg-surface2 focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="••••••••"
          />

          {error && (
            <div className="mb-4 text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-white text-sm font-medium py-2.5 rounded-lg hover:bg-accentink transition disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
