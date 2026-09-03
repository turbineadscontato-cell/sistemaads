// Small set of hand-written line icons (feather-style) used across the
// internal panel's premium shell — kept as plain inline SVG components (no
// icon library dependency) so the manual-upload deploy workflow never has
// to worry about a missing npm package.
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export function IconHome(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function IconUsers(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M2.5 20v-1.2A4.3 4.3 0 0 1 6.8 14.5h4.4A4.3 4.3 0 0 1 15.5 18.8V20" />
      <path d="M15.5 8a3.3 3.3 0 1 1 0 6.6" />
      <path d="M21.5 20v-1.2a4.3 4.3 0 0 0-3-4.1" />
    </svg>
  );
}

export function IconTasks(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 12.3 10.7 15 16 9" />
    </svg>
  );
}

export function IconChat(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M21 12a7.5 7.5 0 0 1-11.4 6.4L4 20l1.4-4.8A7.5 7.5 0 1 1 21 12Z" />
    </svg>
  );
}

export function IconMegaphone(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l9 5V4l-9 5H4a1 1 0 0 0-1 1Z" />
      <path d="M18 9.5a4 4 0 0 1 0 5" />
    </svg>
  );
}

export function IconChart(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconSpark(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M12 3v3M12 18v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M3 12h3M18 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function IconUserCog(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <circle cx="9.5" cy="8" r="3.3" />
      <path d="M2.5 20v-1a4.3 4.3 0 0 1 4.3-4.3h5.4" />
      <circle cx="18" cy="16.5" r="2.4" />
      <path d="M18 12.7v1M18 19.3v1M14.7 16.5h1M19.3 16.5h1M15.4 13.9l.7.7M19.9 18.4l.7.7M20.6 13.9l-.7.7M16.1 18.4l-.7.7" />
    </svg>
  );
}

export function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

export function IconAlert(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M10.3 4.3 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4.3a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </svg>
  );
}

export function IconMoney(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M12 2v20" />
      <path d="M17 6.5H9.7a3 3 0 0 0 0 6h4.6a3 3 0 0 1 0 6H6" />
    </svg>
  );
}

export function IconTrophy(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M7 4h10v4.5a5 5 0 0 1-10 0Z" />
      <path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4" />
      <path d="M12 13.5V17M8.5 21h7M9.5 17h5v2.5a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5Z" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconChevronRight(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconX(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconMenu(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </svg>
  );
}

export function IconStar(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M12 3.3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9Z" />
    </svg>
  );
}

export function IconLogout(props) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export const NAV_ICON = {
  clientes: IconUsers,
  tarefas: IconTasks,
  atendimento: IconChat,
  campanhas: IconMegaphone,
  relatorios: IconChart,
  assistentes: IconSpark,
  usuarios: IconUserCog,
};
