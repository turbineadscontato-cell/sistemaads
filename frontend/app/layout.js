import "./globals.css";
import { LOGO_SIDEBAR_SRC } from "../lib/logo";

export const metadata = {
  title: "Painel TurbinaADS",
  description: "Sistema interno de gestão de clientes da TurbinaADS",
  // Ícone exibido na aba do navegador / barra de endereço — reaproveita a
  // mesma logo já usada na sidebar (evita depender de um arquivo estático
  // .ico sobrevivendo ao fluxo de upload manual pelo GitHub Desktop).
  icons: {
    icon: LOGO_SIDEBAR_SRC,
    shortcut: LOGO_SIDEBAR_SRC,
    apple: LOGO_SIDEBAR_SRC,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="font-body">{children}</body>
    </html>
  );
}
