"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  LayoutDashboard,
  Menu,
  Receipt,
  Search,
  Settings,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", section: "General", icon: LayoutDashboard },
  { href: "/finanzas", label: "Finanzas", section: "General", icon: Building2 },
  { href: "/gastos", label: "Gastos", section: "General", icon: Receipt },
  { href: "/tesoreria", label: "Tesoreria", section: "General", icon: Landmark },
  { href: "/documentos", label: "Documentos", section: "Sistema", icon: FileText },
];

export function AppFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--sidebar)] transition-all duration-300 ease-in-out lg:relative",
          collapsed ? "w-[72px]" : "w-[260px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className={cn("flex h-16 items-center border-b border-white/[0.06] px-4", collapsed && "justify-center")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
            <span className="text-sm font-bold">A</span>
          </div>
          {!collapsed && (
            <div className="ml-3 animate-fade-in">
              <p className="text-[13px] font-semibold text-white">Apolo Finance</p>
              <p className="text-[11px] text-slate-400">Heladeria Dashboard</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto text-slate-400 hover:text-white lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {!collapsed && (
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-widest text-slate-500">
                Menu
              </p>
            )}
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-indigo-500/20 text-white shadow-sm shadow-indigo-500/10"
                      : "text-slate-400 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className={cn("size-[18px] shrink-0", active && "text-indigo-300")} />
                  {!collapsed && <span>{item.label}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto size-1.5 rounded-full bg-indigo-300" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/[0.06] p-3">
          {!collapsed && (
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-[11px] font-bold text-white">
                M
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-200">Montane</p>
                <p className="text-[11px] text-slate-500">Admin</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden w-full items-center justify-center rounded-xl py-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-300 lg:flex"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[var(--line)] bg-[var(--background)]/80 px-4 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative hidden max-w-md flex-1 md:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar..."
                className="w-full rounded-xl border border-[var(--line)] bg-white py-2 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100"
            >
              <Bell className="size-[18px]" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-indigo-500" />
            </button>
            <button
              type="button"
              className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100"
            >
              <Settings className="size-[18px]" />
            </button>
            <div className="ml-1 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
              M
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-[1400px]">
            {/* Page title */}
            <div className="mb-6 animate-fade-in">
              <h1 className="text-[28px] font-bold tracking-tight text-slate-900 lg:text-[32px]">
                {title}
              </h1>
              <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-slate-500">
                {description}
              </p>
            </div>

            {/* Children */}
            <div className="space-y-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
