"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { PERMISSION_ACTION_LABEL } from "../../lib/adminFormat";

export default function AdminPermissoes() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/admin/permissoes");
      setData(res);
      if (!selectedUserId && res.usuarios.length) setSelectedUserId(res.usuarios[0].id);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data || !selectedUserId) return;
    const u = data.usuarios.find((x) => x.id === selectedUserId);
    setDraft(u ? { ...u.overrides } : {});
  }, [data, selectedUserId]);

  function toggle(area, action) {
    setDraft((d) => {
      const areaPerms = { ...(d[area] || {}) };
      areaPerms[action] = !areaPerms[action];
      return { ...d, [area]: areaPerms };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/api/admin/permissoes/${selectedUserId}`, { method: "PATCH", body: { overrides: draft } });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) return <div className="text-center text-sm text-inkfaint py-6">Carregando…</div>;

  const usuario = data.usuarios.find((u) => u.id === selectedUserId);

  return (
    <div className="space-y-4">
      <div className="text-[11.5px] text-inkfaint bg-surface border border-border rounded-xl px-4 py-3">
        Sócio sempre tem acesso total — isso aqui é só pra quando, no futuro, vocês quiserem liberar uma área específica pra algum gestor ou atendente. Hoje ninguém tem nenhuma permissão marcada, então nada muda no dia a dia de vocês dois.
      </div>

      {data.usuarios.length === 0 ? (
        <div className="text-center text-sm text-inkfaint py-6 bg-surface border border-border rounded-2xl">Nenhum gestor/atendente cadastrado ainda.</div>
      ) : (
        <>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink">
            {data.usuarios.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role === "GESTOR" ? "Gestor" : "Atendente"})</option>)}
          </select>

          {usuario && (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase text-inkfaint text-left">
                      <th className="px-4 py-2.5">Área</th>
                      {data.actions.map((a) => <th key={a} className="px-3 py-2.5 text-center">{PERMISSION_ACTION_LABEL[a] || a}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.areas.map((area) => (
                      <tr key={area.key} className="border-t border-border">
                        <td className="px-4 py-2.5 text-ink font-medium">{area.label}</td>
                        {data.actions.map((action) => (
                          <td key={action} className="px-3 py-2.5 text-center">
                            <input type="checkbox" className="accent-accent" checked={!!draft[area.key]?.[action]} onChange={() => toggle(area.key, action)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border">
                <button disabled={saving} onClick={save} className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentink transition disabled:opacity-60">{saving ? "Salvando…" : "Salvar permissões"}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
