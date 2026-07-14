import type { Metadata, Viewport } from "next";

import { PwaRegistration } from "@/components/pwa-registration";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://apolodashbprueba.vercel.app",
  ),
  title: {
    default: "Apolo · Gelateria Dashboard",
    template: "%s · Apolo",
  },
  description:
    "Dashboard financer i operatiu de la gelateria Apolo (Salou): vendes, costos, marges, comparatives i previsions.",
  applicationName: "Apolo Dashboard",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/api/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { url: "/api/pwa-icon/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/api/pwa-icon/180", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Apolo",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f9fc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <div className="grain" />
        <div className="app-shell">{children}</div>
        <PwaRegistration />
      </body>
    </html>
  );
}
