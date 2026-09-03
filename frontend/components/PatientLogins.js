"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

// Dedicated screen to create/manage each patient's own portal login — split
// out from the Pacientes board (PatientsBoard) on purpose: cramming a login
// form inside an already-tall expanded Kanban card made it hard to use,
// especially on narrower screens. This is a flat, responsive list instead —
// one row per patient, stacking cleanly on mobile.
export default function PatientLogins() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [resetDraft, setResetDraft] = useState("");
  const [resettingId, setResettingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPatients(await api("/api/patients"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate(p) {
    setOpenId(openId === p.id ? null : p.id);
    setLoginForm({ email: "", password: "" });
    setResettingId(null);
    setResetDraft("");
  }

  async function createLogin(p) {
    if (!loginForm.email.trim() || !loginForm.password.trim()) return;
    setSaving(true);
    try {
      await api(`/api/patients/${p.id}/portal-user`, { method: "POST", body: { name: p.name, ...loginForm } });
      setLoginForm({ email: "", password: "" });
      setOpenId(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(p) {
    if (!resetDraft.trim()) return;
    setSaving(true);
    try {
      await api(`/api/patients/${p.id}/portal-user`, { method: "PATCH", body: { password: resetDraft } });
      setResetDraft("");
      setResettingId(null);
      alert("Senha atualizada.");
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p) {
    if (!p.portalUser) return;
    try {
      await api(`/api/patients/${p.id}/portal-user`, { method: "PATCH", body: { active: !p.portalUser.active } });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function removeLogin(p) {
    if (!confirm(`Remover o login de acesso de "${p.name}"? Ele não vai mais conseguir entrar no portal dele.`)) return;
    try {
      await api(`/api/patients/${p.id}/portal-user`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="text-xs text-inkfaint">Carregando…</div>;
  if (error) return <div className="text-xs text-danger">{error}</div>;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display font-semibold text-base text-ink">Acessos dos pacientes</h2>
        <p className="text-[11px] text-inkfaint mt-0.5">
          Crie um login pra cada paciente entrar no portal dele (agenda, atividades, relatórios liberados, diário) — com a marca que você configurou na aba Marca, não a da TurbinaADS.
        </p>
      </div>

      {patients.length === 0 && (
        <div className="bg-surface border border-border rounded-xl shadow-sm p-6 text-center text-xs text-inkfaint">
          Nenhum paciente cadastrado ainda — adicione na aba Pacientes primeiro.
        </div>
      )}

      <div className="space-y-2">
        {patients.map((p) => {
          const login = p.portalUser;
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{p.name}</div>
                  {login ? (
                    <div className="text-[11px] text-inksoft truncate mt-0.5">{login.email}</div>
                  ) : (
                    <div className="text-[11px] text-inkfaint mt-0.5">Sem login ainda</div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {login && (
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${login.active ? "bg-successsoft text-success" : "bg-dangersoft text-danger"}`}>
                      {login.active ? "Ativo" : "Desativado"}
                    </span>
                  )}

                  {!login && (
                    <button onClick={() => startCreate(p)}
                      className="text-[11px] bg-accent text-white font-medium px-3 py-1.5 rounded-md hover:bg-accentink whitespace-nowrap">
                      {isOpen ? "Cancelar" : "Criar login"}
                    </button>
                  )}

                  {login && (
                    <>
                      <button onClick={() => toggleActive(p)} className="text-[11px] text-inksoft hover:text-accent whitespace-nowrap">
                        {login.active ? "Desativar" : "Reativar"}
                      </button>
                      <button
                        onClick={() => { setResettingId(resettingId === p.id ? null : p.id); setResetDraft(""); }}
                        className="text-[11px] text-inksoft hover:text-accent whitespace-nowrap">
                        Redefinir senha
                      </button>
                      <button onClick={() => removeLogin(p)} className="text-[11px] text-danger hover:underline whitespace-nowrap">
                        Remover
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!login && isOpen && (
                <div className="border-t border-border bg-surface2/60 px-3.5 py-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      placeholder="Email do paciente" autoComplete="off"
                      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface text-ink" />
                    <input value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="Senha" autoComplete="off"
                      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface text-ink" />
                  </div>
                  <button onClick={() => createLogin(p)} disabled={saving}
                    className="w-full sm:w-auto bg-accent text-white text-xs font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60">
                    {saving ? "Criando…" : "Criar login"}
                  </button>
                </div>
              )}

              {login && resettingId === p.id && (
                <div className="border-t border-border bg-surface2/60 px-3.5 py-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={resetDraft} onChange={(e) => setResetDraft(e.target.value)} placeholder="Nova senha" autoComplete="off"
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface text-ink" />
                    <button onClick={() => resetPassword(p)} disabled={saving}
                      className="bg-accent text-white text-xs font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60 shrink-0">
                      {saving ? "Salvando…" : "Salvar nova senha"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
