import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apolo Heladeria Dashboard",
  description:
    "Controla ventas, gastos, nominas y banco con dashboard web y consultas por Telegram.",
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
