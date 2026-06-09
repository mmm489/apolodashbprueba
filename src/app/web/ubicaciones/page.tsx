import type { Metadata } from "next";
import { Clock, MapPin, Navigation } from "lucide-react";

import { locations } from "../data";

export const metadata: Metadata = {
  title: "Ubicaciones",
  description: "Encuentra la Gelateria Apolo en el paseo de Salou. Dirección, horarios y cómo llegar.",
};

export default function UbicacionesPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
          Dónde estamos
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Ven a vernos
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Estamos en pleno paseo de Salou, a un paso del mar. Te esperamos.
        </p>
      </section>

      <section className="mx-auto max-w-6xl space-y-10 px-5 pt-12">
        {locations.map((loc) => {
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.mapsQuery)}`;
          const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(loc.mapsQuery)}&output=embed`;
          return (
            <div
              key={loc.name}
              className="grid overflow-hidden rounded-[2.5rem] border border-black/5 bg-white shadow-sm lg:grid-cols-2"
            >
              <div className="p-8 sm:p-10">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{loc.name}</h2>
                <div className="mt-5 flex items-start gap-3 text-slate-700">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                  <span>
                    {loc.address}
                    <br />
                    {loc.city}
                  </span>
                </div>

                <div className="mt-6">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Clock className="h-4 w-4 text-rose-500" /> Horario
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {loc.hours.map((h) => (
                      <li key={h.days} className="flex justify-between border-b border-dashed border-slate-100 pb-2">
                        <span className="text-slate-500">{h.days}</span>
                        <span className="font-medium text-slate-900">{h.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
                >
                  <Navigation className="h-4 w-4" /> Cómo llegar
                </a>
              </div>

              <div className="min-h-[320px] bg-slate-100">
                <iframe
                  title={`Mapa de ${loc.name}`}
                  src={embedUrl}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
