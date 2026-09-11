import "./globals.css";
import { LOGO_SIDEBAR_SRC } from "../lib/logo";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";

export const metadata = {
  title: "Painel TurbinaADS",
  description: "Sistema interno de gestão de clientes da TurbinaADS",
  // PWA — manifest + ícones quadrados de verdade (public/icon-192.png,
  // icon-512.png, apple-touch-icon.png), gerados a partir da mesma logo da
  // sidebar. O favicon de aba continua sendo a logo embutida (LOGO_SIDEBAR_SRC)
  // pra não depender de nenhum arquivo estático sobrevivendo ao upload manual.
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: LOGO_SIDEBAR_SRC,
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "TurbinaADS",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#0b0b0c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="font-body">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
