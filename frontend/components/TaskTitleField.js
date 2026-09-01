"use client";

import { useState, useEffect } from "react";
import { TASK_PRESETS, OTHER_OPTION } from "../lib/taskPresets";

// Dropdown of preset task titles + a free-text "Outros" fallback. Keeps its
// own select-mode state so switching to "Outros" doesn't collapse back to
// the placeholder while the parent's text value is still empty.
export default function TaskTitleField({ value, onChange, className = "" }) {
  const [mode, setMode] = useState(() => (TASK_PRESETS.includes(value) ? value : value ? OTHER_OPTION : ""));

  useEffect(() => {
    if (value === "") setMode("");
  }, [value]);

  return (
    <div className={className}>
      <select
        required
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          setMode(v);
          onChange(v === OTHER_OPTION ? "" : v);
        }}
        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink"
      >
        <option value="">Selecione a tarefa</option>
        {TASK_PRESETS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
        <option value={OTHER_OPTION}>Outros…</option>
      </select>
      {mode === OTHER_OPTION && (
        <input
          autoFocus
          required
          placeholder="Descreva a tarefa"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full mt-1.5 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface2 text-ink"
        />
      )}
    </div>
  );
}
