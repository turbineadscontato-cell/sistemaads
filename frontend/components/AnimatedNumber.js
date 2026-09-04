"use client";

import { useEffect, useRef, useState } from "react";

function currency(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Contador animado — sobe (ou desce) do valor anterior até o novo valor,
// tipo "saindo do 0 até 497" quando um valor muda (MRR, saldo do gestor
// etc.), em vez do número simplesmente trocar sem aviso. Respeita
// prefers-reduced-motion (pula direto pro valor final).
export default function AnimatedNumber({ value, duration = 900, format = "currency", className }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevRef.current = target;
      setDisplay(target);
      return;
    }
    const from = prevRef.current;
    const to = target;
    if (from === to) return;

    const reduceMotion = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      prevRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        setDisplay(to);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  const text = format === "currency" ? currency(display) : Math.round(display).toLocaleString("pt-BR");
  return <span className={className}>{text}</span>;
}
