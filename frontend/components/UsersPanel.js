"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

const ROLE_LABEL = { SOCIO: "Sócio", GESTOR: "Gestor de tráfego", ATENDENTE: "Atendente", CLIENTE: "Cliente (portal)" };

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "GESTOR", clientId: "" });
  const [resetting, setResetting] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([api("/api/users"), api("/api/clients")]);
      setUsers(u);
      setClients(c);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e) {
    e.preventDefault();
    try {
      await api("/api/users", { method: "POST", body: form });
      setForm({ name: "", email: "", password: "", role: "GESTOR", clientId: "" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleActive(u) {
    await api(`/api/users/${u.id}`, { method: "PATCH", body: { active: !u.active } });
    load();
  }

  async function submitReset(u) {
    if (!resetPassword.trim()) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { password: resetPassword } });
      setResetting(null);
      setResetPassword("");
      alert(`Senha de ${u.name} atualizada.`);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <section className="space-y-6 max-w-3xl">
      <form onSubmit={createUser} className="bg-surface border border-border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Nome</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Email</label>
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Senha</label>
          <input required type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Papel</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, clientId: e.target.value === "CLIENTE" ? form.clientId : "" })}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
            <option value="GESTOR">Gestor de tráfego</option>
            <option value="ATENDENTE">Atendente</option>
            <option value="SOCIO">Sócio</option>
            <option value="CLIENTE">Cliente (portal)</option>
          </select>
        </div>
        {form.role === "CLIENTE" && (
          <div>
            <label className="block text-[11px] text-inkfaint mb-1">Cliente vinculado</label>
            <select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink">
              <option value="">Selecione</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <button className="bg-accent text-white text-sm font-medium py-1.5 rounded-md hover:bg-accentink transition">Criar login</button>
      </form>

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4.5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm text-ink">Equipe</h2>
          <span className="text-xs text-inkfaint">{users.length} usuário(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                <th className="px-4.5 py-2.5">Nome</th>
                <th className="px-4.5 py-2.5">Papel</th>
                <th className="px-4.5 py-2.5">Status</th>
                <th className="px-4.5 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border align-top">
                  <td className="px-4.5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-accentsoft text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-ink truncate">{u.name}</div>
                        <div className="text-xs text-inkfaint truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4.5 py-3 text-inksoft whitespace-nowrap">
                    {ROLE_LABEL[u.role]}
                    {u.role === "CLIENTE" && u.client && <div className="text-[10.5px] text-inkfaint">{u.client.name}</div>}
                  </td>
                  <td className="px-4.5 py-3 whitespace-nowrap">
                    <span className={`pill ${u.active ? "pill-ATIVO" : "pill-CANCELADO"}`}>{u.active ? "Ativo" : "Desativado"}</span>
                  </td>
                  <td className="px-4.5 py-3">
                    {resetting === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="Nova senha"
                          className="px-2 py-1 text-xs rounded-md border border-border bg-surface2 text-ink w-28"
                        />
                        <button onClick={() => submitReset(u)} className="text-xs text-accent font-medium hover:underline">Salvar</button>
                        <button onClick={() => { setResetting(null); setResetPassword(""); }} className="text-xs text-inkfaint hover:underline">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <button onClick={() => toggleActive(u)} className="text-xs text-inksoft hover:text-accent">
                          {u.active ? "Desativar" : "Reativar"}
                        </button>
                        <button onClick={() => setResetting(u.id)} className="text-xs text-inksoft hover:text-accent">
                          Redefinir senha
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={4} className="px-4.5 py-8 text-center text-inkfaint">Nenhum usuário cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
