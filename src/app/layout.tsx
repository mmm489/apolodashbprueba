import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Apolo · Gelateria Dashboard",
    template: "%s · Apolo",
  },
  description:
    "Dashboard financer i operatiu de la gelateria Apolo (Salou): vendes, costos, marges, comparatives i previsions.",
  applicationName: "Apolo Dashboard",
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
      </body>
    </html>
  );
}
