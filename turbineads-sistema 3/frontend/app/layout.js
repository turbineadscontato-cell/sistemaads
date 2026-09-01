import "./globals.css";

export const metadata = {
  title: "Painel TurbinaADS",
  description: "Sistema interno de gestão de clientes da TurbinaADS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="font-body">{children}</body>
    </html>
  );
}
