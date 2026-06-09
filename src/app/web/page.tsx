import Link from "next/link";
import { ArrowRight, Leaf, MapPin, Snowflake, Sparkles, Star } from "lucide-react";

import { productFamilies } from "./data";

export default function HomePage() {
  const featured = productFamilies.slice(0, 4);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-32 h-72 w-72 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-16 md:grid-cols-2 md:pt-24">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
              <Sparkles className="h-3.5 w-3.5" /> Artesano desde 2009 · Salou
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              El helado que
              <span className="bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent">
                {" "}
                sabe a verano
              </span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">
              Gelado artesano elaborado cada mañana con ingredientes naturales. Batidos, smoothies,
              crepes y café en pleno paseo de Salou.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/web/carta"
                className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
              >
                Ver la carta <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/web/ubicaciones"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <MapPin className="h-4 w-4" /> Cómo llegar
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
              <div className="flex text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <span className="font-medium text-slate-700">4,8</span>
              <span>· +1.200 reseñas de clientes felices</span>
            </div>
          </div>

          <div className="relative animate-fade-in">
            <div className="aspect-square w-full rounded-[2.5rem] bg-gradient-to-br from-rose-300 via-pink-200 to-amber-200 shadow-xl shadow-rose-200/50">
              <div className="flex h-full items-center justify-center text-[10rem] leading-none drop-shadow-sm md:text-[12rem]">
                🍦
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg">
              <span className="text-2xl">🍓</span>
              <div>
                <p className="text-xs font-semibold text-slate-900">Fruta natural</p>
                <p className="text-xs text-slate-500">Sin colorantes</p>
              </div>
            </div>
            <div className="absolute -right-3 top-6 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg">
              <span className="text-2xl">🥛</span>
              <div>
                <p className="text-xs font-semibold text-slate-900">Hecho hoy</p>
                <p className="text-xs text-slate-500">Cada mañana</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Valores */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="grid gap-4 rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:grid-cols-3">
          {[
            { icon: Leaf, title: "Ingredientes naturales", text: "Fruta fresca, leche local y nada de aromas artificiales." },
            { icon: Snowflake, title: "Artesanía diaria", text: "Producción propia, en pequeñas tandas, cada día." },
            { icon: Sparkles, title: "Más de 30 sabores", text: "Clásicos de siempre y especialidades de temporada." },
          ].map((v) => (
            <div key={v.title} className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                <v.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{v.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{v.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Destacados */}
      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Lo más pedido</h2>
            <p className="mt-2 text-slate-500">Una pequeña muestra de lo que te espera en la carta.</p>
          </div>
          <Link
            href="/web/carta"
            className="hidden items-center gap-1 text-sm font-semibold text-rose-600 hover:text-rose-700 sm:inline-flex"
          >
            Ver todo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-5 stagger-children sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((fam) => (
            <article
              key={fam.slug}
              className="group rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 to-amber-100 text-3xl">
                {fam.emoji}
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{fam.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{fam.tagline}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto mt-20 max-w-6xl px-5">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-rose-500 to-amber-400 px-8 py-14 text-center text-white shadow-xl">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,white_0,transparent_40%),radial-gradient(circle_at_80%_60%,white_0,transparent_35%)]" />
          <h2 className="relative text-3xl font-extrabold sm:text-4xl">¿Te apetece un helado?</h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/90">
            Ven a vernos al paseo de Salou o escríbenos para eventos y pedidos especiales.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/web/ubicaciones"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              <MapPin className="h-4 w-4" /> Ver ubicación
            </Link>
            <Link
              href="/web/contacto"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Contactar
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
