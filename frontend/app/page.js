"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, setSession, getUser } from "../lib/api";
import { LOGO_LOGIN_SRC } from "../lib/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (u) router.replace(u.role === "CLIENTE" ? "/portal" : "/dashboard");
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      setSession(data.token, data.user);
      router.push(data.user.role === "CLIENTE" ? "/portal" : "/dashboard");
    } catch (err) {
      setError(err.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_LOGIN_SRC} alt="TurbinaADS" className="h-16 w-auto" />
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
