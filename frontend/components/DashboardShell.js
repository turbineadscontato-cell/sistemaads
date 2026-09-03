"use client";

import { useEffect, useState } from "react";
import { IconMenu, IconX, IconLogout } from "./icons";
import AvatarButton from "./AvatarButton";

const ROLE_LABEL = { SOCIO: "Sócio", GESTOR: "Gestor de tráfego", ATENDENTE: "Atendente" };

// Premium navigation shell for the internal panel (/dashboard) — sócio,
// gestor and atendente. Mirrors the same proven pattern as PortalShell.js
// (always position:fixed sidebar, never sticky — see that file's comment
// for why a sticky sidebar inside a non-flex wrapper pushes the whole page
// content off-screen) but with a more "empresa grande" executive treatment:
// icon-led nav, a subtle brand gradient, and a role badge on the user card.
export default function DashboardShell({ brand, items, activeTab, onTabChange, user, onLogout, onAvatarSaved, topbarRight, children }) {
  const [open, setOpen] = useState(false);
  const activeItem = items.find((i) => i.key === activeTab);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  function selectTab(key) {
    onTabChange(key);
    setOpen(false);
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-sidebar/95 backdrop-blur border-b border-white/10 flex items-center gap-3 px-3">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu"
          className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl text-white hover:bg-white/5 active:bg-white/10 transition">
          <IconMenu className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 text-sm font-display font-semibold text-white truncate">{activeItem?.label}</div>
        <button onClick={onLogout} className="shrink-0 text-[11px] text-[#8a8175] hover:text-accent underline px-1">Sair</button>
      </div>

      {open && (
        <div onClick={() => setOpen(false)} aria-hidden
          className="lg:hidden fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] transition-opacity" />
      )}

      {/* Sidebar — always position:fixed at every breakpoint (see PortalShell.js). */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-[264px] shrink-0 bg-sidebar border-r border-white/10 flex flex-col
          shadow-2xl lg:shadow-none transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="relative shrink-0 px-5 pt-6 pb-5 overflow-hidden">
          <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative flex items-center justify-between">
            {brand}
            <button onClick={() => setOpen(false)} className="lg:hidden text-[#8a8175] hover:text-white transition text-lg leading-none px-1">
              <IconX className="w-4 h-4" />
            </button>
          </div>
          <div className="relative text-[10px] uppercase tracking-[0.14em] text-[#8a8175] mt-4">Painel interno</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {items.map((item) => {
            const isActive = item.key === activeTab;
            const Ic = item.icon;
            return (
              <button key={item.key} onClick={() => selectTab(item.key)}
                className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all group
                  ${isActive
                    ? "bg-accent text-white shadow-[0_6px_20px_-6px_rgba(255,122,26,0.55)]"
                    : "text-[#a89f92] hover:text-white hover:bg-white/[0.06]"}`}>
                {Ic && <Ic className={`w-[17px] h-[17px] shrink-0 ${isActive ? "text-white" : "text-[#8a8175] group-hover:text-accent"}`} strokeWidth={1.8} />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <div className="text-[10px] uppercase tracking-[0.14em] text-[#6b6559] px-3.5 pt-4 pb-1.5">Em breve</div>
          <div className="px-3.5 py-2.5 text-[#6b6559] flex items-center gap-2 text-[13px]">
            Bot WhatsApp
            <span className="ml-auto text-[9px] uppercase font-semibold tracking-wide bg-white/5 text-[#8a8175] px-1.5 py-0.5 rounded-full">Fase 4</span>
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 shadow-[0_4px_12px_-2px_rgba(255,122,26,0.5)] rounded-full">
              <AvatarButton src={user.avatarUrl} name={user.name} size={36} onSaved={onAvatarSaved} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-[13px] font-semibold truncate">{user.name}</div>
              <div className="text-[10.5px] text-[#8a8175] truncate">{ROLE_LABEL[user.role] || user.role}</div>
            </div>
            <button onClick={onLogout} aria-label="Sair" title="Sair"
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#8a8175] hover:text-accent hover:bg-white/5 transition">
              <IconLogout className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-[264px] pt-14 lg:pt-0 min-h-screen">
        <div className="hidden lg:flex items-center justify-between gap-4 px-8 h-16 border-b border-border sticky top-0 z-20 bg-bg/85 backdrop-blur">
          <h2 className="font-display font-semibold text-lg text-ink">{activeItem?.label}</h2>
          {topbarRight && <div className="flex items-center gap-2">{topbarRight}</div>}
        </div>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
