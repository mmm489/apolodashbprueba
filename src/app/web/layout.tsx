import type { Metadata } from "next";

import { Footer } from "./footer";
import { Navbar } from "./navbar";

export const metadata: Metadata = {
  title: {
    default: "Gelateria Apolo · Helado artesano en Salou",
    template: "%s · Gelateria Apolo",
  },
  description:
    "Gelateria Apolo: helado artesano elaborado cada día en Salou. Gelados, batidos, smoothies, crepes, gofres y café. Ingredientes naturales y recetas de siempre.",
};

export default function WebLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fffdfa] text-slate-900">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
