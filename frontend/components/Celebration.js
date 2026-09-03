"use client";

// Pequena comemoração visual (emoji + confete simples em CSS, sem lib
// externa) disparada quando uma tarefa é marcada como concluída — pedido
// explícito do usuário: "da um parabens e um emoji de parabens e de festa
// com interacao que conseguiu realizar a tarefa". Autodesaparece sozinha.
const CONFETTI = ["🎉", "🎊", "✨", "🥳", "⭐", "🎈"];

export default function Celebration({ show, text = "Tarefa concluída!" }) {
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 top-4 sm:top-6 z-[100] flex justify-center pointer-events-none px-4">
      <div className="relative bg-surface border border-success/40 shadow-2xl rounded-2xl px-5 py-3.5 flex items-center gap-2.5 animate-celebrate-in">
        <span className="text-2xl" aria-hidden>🎉</span>
        <div>
          <div className="font-display font-semibold text-sm text-ink">Parabéns! 🥳</div>
          <div className="text-[12px] text-inksoft">{text}</div>
        </div>
        <span className="text-2xl" aria-hidden>🎊</span>
        {CONFETTI.map((e, i) => (
          <span key={i} className="confetti-piece" style={{ left: `${8 + i * 16}%`, animationDelay: `${i * 70}ms` }} aria-hidden>
            {e}
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes celebrateIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-celebrate-in { animation: celebrateIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes confettiFall {
          0% { opacity: 0; transform: translateY(-6px) rotate(0deg); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translateY(46px) rotate(220deg); }
        }
        .confetti-piece {
          position: absolute;
          top: -4px;
          font-size: 15px;
          animation: confettiFall 1.1s ease-in forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-celebrate-in, .confetti-piece { animation: none; }
        }
      `}</style>
    </div>
  );
}
