"use client";

import { LoaderCircle, SendHorizonal, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import type { ChatAnswer } from "@/lib/types";

import { SectionCard } from "./section-card";

export function ChatPanel({ suggestions }: { suggestions: string[] }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [isPending, startTransition] = useTransition();

  function ask(prompt: string) {
    startTransition(async () => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: prompt }),
      });

      const payload = (await response.json()) as ChatAnswer;
      setAnswer(payload);
      setQuestion(prompt);
    });
  }

  return (
    <SectionCard
      title="Chat analitico"
      eyebrow="Claude + datos estructurados"
      description="Haz preguntas sobre ventas, gastos, nominas y banco. El modelo solo contesta con datos ya guardados."
    >
      <div className="space-y-4">
        {/* Suggestions */}
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => ask(suggestion)}
              className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <label className="text-[12px] font-medium text-slate-500" htmlFor="question">
            Escribe una pregunta
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && question.trim()) ask(question);
              }}
              placeholder="Ej. Cuanto vendimos hoy?"
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-slate-50 px-4 py-2.5 text-[13px] outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
            />
            <button
              type="button"
              onClick={() => ask(question)}
              disabled={isPending || !question.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
              Preguntar
            </button>
          </div>
        </div>

        {/* Answer */}
        <div className="rounded-xl border border-[var(--line)] bg-slate-50/50 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Respuesta</p>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-7 text-slate-700">
            {answer?.answer ??
              "Todavia no hay ninguna pregunta enviada. Prueba con una consulta de ventas, proveedores, nominas o banco."}
          </p>
          {answer?.sources?.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {answer.sources.map((source) => (
                <span key={source} className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-600">
                  {source}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
