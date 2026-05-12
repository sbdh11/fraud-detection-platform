"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

const DOCS_URL = API_BASE.replace(/\/api$/, "") + "/docs";

const NAV = [
  { href: "/", label: "Live Dashboard" },
  { href: "/explainability", label: "Explainability" },
  { href: "/drift", label: "Drift Monitoring" },
  { href: "/models", label: "Model Comparison" },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2.5 py-4 md:flex">
      <div className="px-2.5 pb-5">
        <div className="text-[15px] font-semibold tracking-tight text-foreground">
          fraudwatch<span className="text-primary">.</span>
        </div>
        <div className="text-[11px] text-muted-foreground">real-time fraud detection</div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1.5 px-2.5 pt-5 text-[11px] leading-relaxed text-muted-foreground/80">
        <p>FastAPI · XGBoost / LightGBM · SHAP · MLflow · Next.js</p>
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          API reference →
        </a>
      </div>
    </aside>
  );
}
