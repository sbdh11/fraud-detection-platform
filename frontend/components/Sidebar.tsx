"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, ExternalLink, LayoutDashboard, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

const DOCS_URL = API_BASE.replace(/\/api$/, "") + "/docs";

const NAV = [
  { href: "/", label: "Live Dashboard", icon: LayoutDashboard },
  { href: "/explainability", label: "Explainability", icon: Sparkles },
  { href: "/drift", label: "Drift Monitoring", icon: Activity },
  { href: "/models", label: "Model Comparison", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
          <ShieldAlert className="size-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">
            <span className="text-primary">Fraud</span>Watch
          </div>
          <div className="text-[11px] text-muted-foreground">real-time detection</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 px-2 pt-6 text-[11px] leading-relaxed text-muted-foreground/80">
        <p>FastAPI · XGBoost / LightGBM · SHAP · MLflow · Next.js</p>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          API docs <ExternalLink className="size-3" />
        </a>
      </div>
    </aside>
  );
}
