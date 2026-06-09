import Link from "next/link";
import { AtSign, IceCream, Mail, MapPin, Phone } from "lucide-react";

import { contact, locations, navLinks } from "./data";

export function Footer() {
  const loc = locations[0];
  return (
    <footer className="mt-24 border-t border-black/5 bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-amber-300">
              <IceCream className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold">Gelateria Apolo</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Helado artesano elaborado cada día en Salou. Ingredientes naturales, recetas de siempre y
            mucho mimo en cada bola.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white">Navegación</h4>
          <ul className="mt-4 space-y-2 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-slate-400 transition hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white">Contacto</h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>
                {loc.address}
                <br />
                {loc.city}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-rose-400" />
              <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="hover:text-white">
                {contact.phone}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-rose-400" />
              <a href={`mailto:${contact.email}`} className="hover:text-white">
                {contact.email}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <AtSign className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{contact.instagram}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Gelateria Apolo · Salou. Todos los derechos reservados.
      </div>
    </footer>
  );
}
