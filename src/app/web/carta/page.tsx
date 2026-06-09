import type { Metadata } from "next";

import { productFamilies } from "../data";

export const metadata: Metadata = {
  title: "Carta",
  description:
    "Descubre la carta de la Gelateria Apolo: gelados artesanos, frozen yogurt, batidos, smoothies, frappés, crepes, gofres, café y granizados.",
};

export default function CartaPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
          Nuestra carta
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Para todos los gustos
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Helado artesano y mucho más. Estos son nuestros grandes clásicos; en tienda encontrarás
          también especialidades y sabores de temporada.
        </p>
      </section>

      <section className="mx-auto max-w-6xl space-y-14 px-5 pt-14">
        {productFamilies.map((fam) => (
          <div key={fam.slug} id={fam.slug} className="scroll-mt-24">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 to-amber-100 text-3xl">
                {fam.emoji}
              </span>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{fam.name}</h2>
                <p className="text-sm text-slate-500">{fam.tagline}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fam.items.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-sm transition hover:border-rose-200"
                >
                  <span className="font-medium text-slate-800">{item}</span>
                  <span className="text-rose-400">♦</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-5">
        <p className="rounded-3xl border border-amber-100 bg-amber-50 px-6 py-5 text-center text-sm text-amber-800">
          🌱 Disponemos de opciones <strong>sin lactosa</strong> y <strong>veganas</strong>. Pregunta
          a nuestro equipo por los alérgenos de cada producto.
        </p>
      </section>
    </>
  );
}
