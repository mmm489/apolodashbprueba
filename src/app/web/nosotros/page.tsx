import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Leaf, Sparkles, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Nosotros",
  description:
    "La historia de la Gelateria Apolo: helado artesano elaborado en Salou con ingredientes naturales y pasión por el oficio.",
};

const values = [
  { icon: Leaf, title: "Natural de verdad", text: "Trabajamos con fruta de temporada, leche fresca y sin aromas artificiales." },
  { icon: Heart, title: "Hecho con cariño", text: "Cada tanda se elabora a mano, en pequeñas cantidades, para cuidar el sabor." },
  { icon: Users, title: "Gente de Salou", text: "Somos un equipo local que disfruta viendo sonreír a cada cliente." },
  { icon: Sparkles, title: "Siempre innovando", text: "Recetas de siempre combinadas con especialidades nuevas cada temporada." },
];

export default function NosotrosPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
              Nuestra historia
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Pasión por el helado artesano
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              La Gelateria Apolo nació en Salou con una idea sencilla: hacer el mejor helado posible,
              con ingredientes de verdad y mucho mimo. Lo que empezó como un pequeño obrador se ha
              convertido en una parada imprescindible del paseo.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Seguimos elaborando cada mañana, en pequeñas tandas, para que cada bola tenga el sabor y
              la textura que nos hizo enamorarnos de este oficio.
            </p>
          </div>
          <div className="aspect-[4/5] rounded-[2.5rem] bg-gradient-to-br from-amber-200 via-rose-200 to-pink-300 shadow-xl">
            <div className="flex h-full items-center justify-center text-[9rem]">🍨</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <div key={v.title} className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                <v.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-bold text-slate-900">{v.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="grid gap-6 rounded-[2.5rem] bg-slate-900 px-8 py-12 text-center text-white sm:grid-cols-3">
          {[
            { n: "+15", l: "años endulzando Salou" },
            { n: "+30", l: "sabores artesanos" },
            { n: "100%", l: "elaboración propia" },
          ].map((s) => (
            <div key={s.l}>
              <p className="bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-4xl font-extrabold text-transparent">
                {s.n}
              </p>
              <p className="mt-1 text-sm text-slate-400">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-12 text-center">
        <Link
          href="/web/carta"
          className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
        >
          Descubre la carta
        </Link>
      </section>
    </>
  );
}
