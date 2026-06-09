"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // De momento no hay backend: mostramos confirmación visual.
    // Cuando exista un endpoint, aquí se haría el fetch a /api/...
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 px-6 py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h3 className="text-xl font-bold text-slate-900">¡Mensaje enviado!</h3>
        <p className="max-w-sm text-sm text-slate-600">
          Gracias por escribirnos. Te responderemos lo antes posible. 🍦
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Nombre</span>
          <input required name="name" type="text" className="field mt-1" placeholder="Tu nombre" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input required name="email" type="email" className="field mt-1" placeholder="tu@email.com" />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Asunto</span>
        <input name="subject" type="text" className="field mt-1" placeholder="Reserva, evento, pedido especial..." />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Mensaje</span>
        <textarea required name="message" rows={5} className="field mt-1 resize-none" placeholder="Cuéntanos en qué podemos ayudarte" />
      </label>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
      >
        <Send className="h-4 w-4" /> Enviar mensaje
      </button>
    </form>
  );
}
