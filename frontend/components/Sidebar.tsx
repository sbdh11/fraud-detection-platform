"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_BASE } from "@/lib/api";

const DOCS_URL = API_BASE.replace(/\/api$/, "") + "/docs";

const NAV = [
  { href: "/", label: "Live Dashboard", icon: "◎" },
  { href: "/explainability", label: "Explainability", icon: "❖" },
  { href: "/drift", label: "Drift Monitoring", icon: "≈" },
  { href: "/models", label: "Model Comparison", icon: "▤" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col gap-1 border-r border-ink-700/70 bg-ink-900/60 px-3 py-6 backdrop-blur">
      <div className="px-3 pb-6">
        <div className="text-lg font-semibold tracking-tight">
          <span className="text-brand-400">Fraud</span>Watch
        </div>
        <div className="text-[11px] text-slate-500">real-time detection platform</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-brand-600/15 text-brand-400 ring-1 ring-brand-500/30"
                  : "text-slate-400 hover:bg-ink-800 hover:text-slate-200"
              }`}
            >
              <span className="w-4 text-center opacity-80">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 pt-6 text-[11px] leading-relaxed text-slate-600">
        <p>FastAPI · XGBoost / LightGBM · SHAP · MLflow · Next.js</p>
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-brand-400">
          API docs ↗
        </a>
      </div>
    </aside>
  );
}
