"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IceCream, Menu, X } from "lucide-react";

import { navLinks } from "./data";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/web" className="flex items-center gap-2 font-extrabold tracking-tight text-rose-600">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-amber-300 text-white shadow-sm">
            <IceCream className="h-5 w-5" />
          </span>
          <span className="text-lg text-slate-900">
            Apolo<span className="text-rose-500">.</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-rose-50 text-rose-600"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/web/contacto"
            className="ml-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
          >
            Reservar
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100 md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-black/5 bg-white px-5 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-medium ${
                    active ? "bg-rose-50 text-rose-600" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
