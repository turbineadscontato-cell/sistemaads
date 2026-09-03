"use client";

import { useEffect, useState } from "react";
import AvatarButton from "./AvatarButton";

// Shared premium navigation shell for the client portal (/portal) and the
// patient portal (/paciente-portal): a persistent left sidebar on desktop,
// collapsing into a slide-in drawer (from the left, with a backdrop) on
// mobile — tap the menu button to open it, pick a section, it closes and
// you keep browsing. Replaces the old horizontal scrolling tab strip, which
// felt cramped and boxed-in on small screens.
export default function PortalShell({ brand, tabs, activeTab, onTabChange, userName, user, onAvatarSaved, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const activeLabel = tabs.find((t) => t.key === activeTab)?.label || "";

  // Lock page scroll behind the drawer while it's open on mobile.
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
      {/* Mobile top bar — menu button opens the drawer; shows the current section. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-sidebar/95 backdrop-blur border-b border-border flex items-center gap-3 px-3">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu"
          className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl text-ink hover:bg-white/5 active:bg-white/10 transition">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2.5 5.5h15M2.5 10h15M2.5 14.5h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <div className="min-w-0 flex-1 text-sm font-display font-semibold text-ink truncate">{activeLabel}</div>
        <button onClick={onLogout} className="shrink-0 text-[11px] text-[#8a8175] hover:text-accent underline px-1">Sair</button>
      </div>

      {/* Backdrop behind the mobile drawer */}
      {open && (
        <div onClick={() => setOpen(false)} aria-hidden
          className="md:hidden fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] transition-opacity" />
      )}

      {/* Sidebar / drawer — always position:fixed (never sticky) so it's fully
          removed from normal document flow at every breakpoint. The parent
          wrapper here is a plain block div, not a flex container, so a
          sticky/static sidebar would otherwise reserve its own full-height
          row in the flow and push the whole main content below the fold
          instead of beside it. */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-[272px] shrink-0 bg-sidebar border-r border-border flex flex-col
          shadow-2xl md:shadow-none transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="h-16 shrink-0 flex items-center px-5 border-b border-border">{brand}</div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <div className="px-2 pb-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-inkfaint">Navegação</div>
          {tabs.map((t) => {
            const isActive = t.key === activeTab;
            return (
              <button key={t.key} onClick={() => selectTab(t.key)}
                className={`w-full flex items-center gap-2.5 text-left px-3.5 py-3 md:py-2.5 rounded-xl text-[14px] md:text-[13.5px] font-medium transition-all
                  ${isActive
                    ? "bg-accent text-white shadow-[0_6px_20px_-6px_rgba(255,122,26,0.55)]"
                    : "text-[#a89f92] hover:text-ink hover:bg-white/[0.06]"}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition ${isActive ? "bg-white" : "bg-white/15"}`} />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-border px-4 py-4">
          {user ? (
            <div className="flex items-center gap-2.5">
              <AvatarButton src={user.avatarUrl} name={user.name} size={34} onSaved={onAvatarSaved} />
              <span className="text-xs text-[#d9cfc2] truncate flex-1 min-w-0">{user.name}</span>
              <button onClick={onLogout} className="shrink-0 text-[11px] text-[#8a8175] hover:text-accent underline">Sair</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#d9cfc2] truncate">{userName}</span>
              <button onClick={onLogout} className="shrink-0 text-[11px] text-[#8a8175] hover:text-accent underline">Sair</button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="md:ml-[272px] pt-14 md:pt-0 min-h-screen">
        <div className="hidden md:flex items-center px-8 h-16 border-b border-border sticky top-0 z-20 bg-bg/85 backdrop-blur">
          <h2 className="font-display font-semibold text-lg text-ink">{activeLabel}</h2>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
