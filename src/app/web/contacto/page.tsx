import type { Metadata } from "next";
import { AtSign, Mail, MapPin, Phone } from "lucide-react";

import { contact, locations } from "../data";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Contacta con la Gelateria Apolo en Salou: teléfono, email y formulario para reservas y eventos.",
};

export default function ContactoPage() {
  const loc = locations[0];
  const items = [
    { icon: Phone, label: "Teléfono", value: contact.phone, href: `tel:${contact.phone.replace(/\s/g, "")}` },
    { icon: Mail, label: "Email", value: contact.email, href: `mailto:${contact.email}` },
    { icon: AtSign, label: "Instagram", value: contact.instagram, href: "#" },
    { icon: MapPin, label: "Dirección", value: `${loc.address}, ${loc.city}`, href: "/web/ubicaciones" },
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 pt-16">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
          Hablemos
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Contacto
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          ¿Una reserva, un evento o un pedido especial? Escríbenos y te ayudamos encantados.
        </p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
          <ContactForm />
        </div>

        <div className="lg:col-span-2 space-y-3">
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href}
              className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition hover:border-rose-200"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                <it.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{it.label}</p>
                <p className="mt-0.5 text-sm text-slate-500">{it.value}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
