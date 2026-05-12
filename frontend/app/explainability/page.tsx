"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ExplainResponse, FeedRow, Prediction } from "@/lib/api";
import { FeatureImportanceChart, ShapBars } from "@/components/Charts";
import { Badge, Card, ErrorNote, fmt, PageHeader, ProbBar, Spinner } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<Spinner label="loading explainability…" />}>
      <Explainability />
    </Suspense>
  );
}

function Explainability() {
  const search = useSearchParams();
  const presetId = search.get("prediction");

  const [importance, setImportance] = useState<{ model_name: string; feature_importance: Record<string, number>; feature_names: string[] } | null>(null);
  const [recent, setRecent] = useState<FeedRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(presetId ? Number(presetId) : null);
  const [explain, setExplain] = useState<ExplainResponse | null>(null);
  const [predMeta, setPredMeta] = useState<Prediction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingExplain, setLoadingExplain] = useState(false);

  useEffect(() => {
    api.importance().then(setImportance).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    const load = () => api.feed(60, true).then((r) => {
      setRecent(r);
      setSelectedId((cur) => cur ?? (r[0]?.prediction_id ?? null));
    }).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    setLoadingExplain(true);
    Promise.all([api.explainPrediction(selectedId), api.prediction(selectedId).catch(() => null)])
      .then(([ex, pm]) => {
        setExplain(ex);
        setPredMeta(pm);
        setErr(null);
      })
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoadingExplain(false));
  }, [selectedId]);

  const importanceItems = useMemo(() => {
    if (!importance) return [];
    return Object.entries(importance.feature_importance)
      .map(([feature, v]) => ({ feature, importance: Number(v) }))
      .sort((a, b) => b.importance - a.importance);
  }, [importance]);

  const sortedContribs = useMemo(
    () => (explain ? explain.contributions.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)) : []),
    [explain],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explainability"
        subtitle="Global feature importance and per-prediction SHAP attributions — why the model flagged a transaction."
        right={importance ? <Badge tone="brand">model: {importance.model_name}</Badge> : null}
      />
      {err && <ErrorNote msg={err} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Global feature importance (active model)">
          {importance ? <FeatureImportanceChart items={importanceItems} /> : <Spinner />}
        </Card>

        <Card
          title="Inspect a prediction"
          right={
            <select
              className="rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-sm text-slate-200"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">recent fraud alerts…</option>
              {recent.map((r) => (
                <option key={r.prediction_id} value={r.prediction_id}>
                  #{r.prediction_id} · {r.user_id} · ${fmt.num(r.amount, 0)} · {r.merchant_type} · p={fmt.prob(r.fraud_probability)}
                </option>
              ))}
            </select>
          }
        >
          {selectedId == null ? (
            <p className="text-sm text-slate-500">Pick a prediction (or follow a “why” link from the dashboard).</p>
          ) : loadingExplain && !explain ? (
            <Spinner label="computing SHAP values…" />
          ) : explain ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-400">prediction #{selectedId}</span>
                {predMeta && <span className="font-mono text-xs text-slate-400">{predMeta.user_id}</span>}
                <span className="tabular">
                  fraud probability <span className="text-white">{fmt.prob(explain.prediction)}</span>
                </span>
                {predMeta && (predMeta.predicted_fraud ? <Badge tone="danger">FLAGGED</Badge> : <Badge tone="ok">cleared</Badge>)}
                {predMeta?.actual_fraud != null && (
                  <Badge tone={predMeta.actual_fraud ? "warn" : "default"}>label: {predMeta.actual_fraud ? "fraud" : "legit"}</Badge>
                )}
              </div>
              <div className="w-full">
                <ProbBar p={explain.prediction} threshold={predMeta?.threshold} />
                <div className="mt-1 text-[11px] text-slate-500">
                  base value (avg model output): {explain.base_value.toFixed(4)} → push to {explain.prediction.toFixed(4)}
                </div>
              </div>
              <ShapBars contributions={explain.contributions} />
            </div>
          ) : (
            <Spinner />
          )}
        </Card>
      </div>

      {explain && (
        <Card title="Feature values & SHAP contributions">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="table-cell">Feature</th>
                  <th className="table-cell text-right">Value</th>
                  <th className="table-cell text-right">SHAP</th>
                  <th className="table-cell w-56">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/50">
                {sortedContribs.map((c) => {
                  const mag = Math.min(1, Math.abs(c.shap) / (Math.abs(sortedContribs[0]?.shap || 1) || 1));
                  return (
                    <tr key={c.feature} className="hover:bg-ink-800/40">
                      <td className="table-cell capitalize text-slate-300">{fmt.feature(c.feature)}</td>
                      <td className="table-cell text-right tabular text-slate-400">{c.value.toFixed(4)}</td>
                      <td className={`table-cell text-right tabular ${c.shap >= 0 ? "text-danger-400" : "text-brand-400"}`}>
                        {c.shap >= 0 ? "+" : ""}
                        {c.shap.toFixed(4)}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <div className="flex-1">
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-700/60">
                              <div className="flex w-1/2 justify-end">
                                {c.shap < 0 && <div className="h-full rounded-l-full bg-brand-500" style={{ width: `${mag * 100}%` }} />}
                              </div>
                              <div className="flex w-1/2">
                                {c.shap >= 0 && <div className="h-full rounded-r-full bg-danger-500" style={{ width: `${mag * 100}%` }} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-slate-500">
              Positive SHAP (red) pushes the prediction toward <span className="text-danger-400">fraud</span>; negative (teal) toward legit.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
