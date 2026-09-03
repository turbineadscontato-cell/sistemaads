"use client";

import { useState } from "react";
import { api } from "../lib/api";

const MAX_LOGO_BYTES = 2_000_000; // ~2MB, keeps the base64 JSON request comfortably small

// Self-service white-label branding for the client's OWN patients' portal.
// This never changes the TurbinaADS branding the client themselves sees —
// only what the client's patients see when they log into their own portal
// (see app/paciente-portal). Aimed at agencies/professionals reselling the
// system under their own name.
export default function BrandingSettings({ client, onChange }) {
  const [brandName, setBrandName] = useState(client.brandName || "");
  const [logoPreview, setLogoPreview] = useState(client.logoBase64 || null);
  const [logoMimeType, setLogoMimeType] = useState(client.logoMimeType || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie um arquivo de imagem (PNG, JPG ou SVG).");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Imagem muito grande — use um arquivo de até 2MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result);
      setLogoMimeType(file.type);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/api/clients/me/branding", {
        method: "PATCH",
        body: { brandName: brandName || null, logoBase64: logoPreview || null, logoMimeType: logoMimeType || null },
      });
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function removeLogo() {
    setLogoPreview(null);
    setLogoMimeType(null);
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="font-display font-semibold text-base text-ink">Marca do seu portal de pacientes</h2>
        <p className="text-[11px] text-inkfaint mt-0.5">
          Isso não muda nada aqui no seu painel — é só a marca que aparece pros SEUS pacientes quando eles entram no portal deles (agenda, atividades, diário). Em vez da logo da TurbinaADS, eles veem a sua.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-sm p-4 space-y-4">
        <div>
          <label className="block text-[11px] text-inkfaint mb-1">Nome exibido (sua clínica/consultório)</label>
          <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="ex: Consultório Ana Paula Silva"
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink" />
        </div>

        <div>
          <label className="block text-[11px] text-inkfaint mb-1.5">Logo</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg border border-border bg-surface2 flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-inkfaint text-center px-1">sem logo</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-accent hover:underline cursor-pointer w-fit">
                {logoPreview ? "Trocar imagem" : "Enviar imagem"}
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
              </label>
              {logoPreview && (
                <button onClick={removeLogo} className="text-xs text-inkfaint hover:text-danger text-left w-fit">Remover logo</button>
              )}
            </div>
          </div>
        </div>

        {error && <div className="text-xs text-danger bg-dangersoft border border-danger/30 rounded-lg px-3 py-2">{error}</div>}

        <button onClick={save} disabled={saving} className="bg-accent text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-accentink disabled:opacity-60">
          {saving ? "Salvando…" : "Salvar marca"}
        </button>
      </div>
    </div>
  );
}
