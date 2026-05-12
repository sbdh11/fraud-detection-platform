"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ModelRun } from "@/lib/api";
import { ModelMetricBars } from "@/components/Charts";
import { Badge, Card, ErrorNote, fmt, PageHeader, Spinner } from "@/components/ui";

const METRIC_COLS: { key: string; label: string }[] = [
  { key: "roc_auc", label: "ROC-AUC" },
  { key: "pr_auc", label: "PR-AUC" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1" },
  { key: "accuracy", label: "Accuracy" },
];

export default function ModelsPage() {
  const [latest, setLatest] = useState<ModelRun[]>([]);
  const [history, setHistory] = useState<ModelRun[]>([]);
  const [active, setActive] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, h, a] = await Promise.all([api.modelsLatest(), api.models(), api.activeModel()]);
      setLatest(l);
      setHistory(h);
      setActive(a);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const activeName: string | null = active?.active_model ?? null;
  const training = active?.training ?? null;

  const orderedLatest = useMemo(
    () => latest.slice().sort((a, b) => (b.metrics?.pr_auc ?? 0) - (a.metrics?.pr_auc ?? 0)),
    [latest],
  );

  const activate = async (name: string) => {
    setBusy(name);
    setMsg(null);
    try {
      await api.activate(name);
      setMsg(`Activated ${name}.`);
      await refresh();
    } catch (e: any) {
      setMsg(`Activate failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const retrain = async () => {
    setBusy("__train__");
    setMsg(null);
    try {
      await api.train();
      setMsg("Training started — refresh in ~30–60s.");
    } catch (e: any) {
      setMsg(`Could not start training: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const metricBarData = (key: string) =>
    orderedLatest.map((m) => ({ model_name: m.model_name, value: Number(m.metrics?.[key] ?? 0), active: m.model_name === activeName }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Comparison"
        subtitle="XGBoost vs LightGBM vs RandomForest baseline — trained on the same synthetic data, tracked in MLflow."
        right={
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={retrain} disabled={busy === "__train__" || training?.running}>
              {training?.running ? "training…" : "↻ Retrain all models"}
            </button>
            {activeName && <Badge tone="brand">active: {activeName}</Badge>}
          </div>
        }
      />
      {err && <ErrorNote msg={err} />}
      {msg && <div className="rounded-lg border border-brand-500/30 bg-brand-600/10 px-3 py-2 text-sm text-brand-400">{msg}</div>}
      {training?.running && <div className="rounded-lg border border-warn-500/30 bg-warn-500/10 px-3 py-2 text-sm text-warn-400">Training in progress…</div>}

      {orderedLatest.length === 0 ? (
        <Card><Spinner label="no model runs yet — train one." /></Card>
      ) : (
        <>
          <Card title="Latest run per model">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="table-cell">Model</th>
                    {METRIC_COLS.map((c) => (
                      <th key={c.key} className="table-cell text-right">{c.label}</th>
                    ))}
                    <th className="table-cell text-right">Threshold</th>
                    <th className="table-cell text-right">Train / Test</th>
                    <th className="table-cell"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/50">
                  {orderedLatest.map((m) => (
                    <tr key={m.id} className={m.model_name === activeName ? "bg-brand-600/[0.07]" : "hover:bg-ink-800/40"}>
                      <td className="table-cell font-medium text-slate-200">
                        {m.model_name}
                        {m.model_name === activeName && <span className="ml-2"><Badge tone="brand">active</Badge></span>}
                      </td>
                      {METRIC_COLS.map((c) => {
                        const v = m.metrics?.[c.key];
                        const best = orderedLatest.every((o) => (o.metrics?.[c.key] ?? -1) <= (v ?? -1));
                        return (
                          <td key={c.key} className={`table-cell text-right tabular ${best ? "text-brand-400" : "text-slate-300"}`}>
                            {v != null ? Number(v).toFixed(4) : "—"}
                          </td>
                        );
                      })}
                      <td className="table-cell text-right tabular text-slate-400">{m.threshold?.toFixed(3) ?? "—"}</td>
                      <td className="table-cell text-right tabular text-slate-500">{fmt.num(m.n_train)} / {fmt.num(m.n_test)}</td>
                      <td className="table-cell text-right">
                        <button
                          className="btn"
                          disabled={m.model_name === activeName || busy === m.model_name}
                          onClick={() => activate(m.model_name)}
                        >
                          {busy === m.model_name ? "…" : m.model_name === activeName ? "in use" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {active?.run?.mlflow_run_id && (
              <p className="mt-3 text-[11px] text-slate-500">Active MLflow run: <span className="font-mono">{active.run.mlflow_run_id}</span> (experiment “fraud-detection”).</p>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="ROC-AUC"><ModelMetricBars models={metricBarData("roc_auc")} metric="roc_auc" label="ROC-AUC" /></Card>
            <Card title="PR-AUC (imbalanced)"><ModelMetricBars models={metricBarData("pr_auc")} metric="pr_auc" label="PR-AUC" /></Card>
            <Card title="F1 @ tuned threshold"><ModelMetricBars models={metricBarData("f1")} metric="f1" label="F1" /></Card>
            <Card title="Precision"><ModelMetricBars models={metricBarData("precision")} metric="precision" label="Precision" /></Card>
            <Card title="Recall"><ModelMetricBars models={metricBarData("recall")} metric="recall" label="Recall" /></Card>
            <Card title="Accuracy"><ModelMetricBars models={metricBarData("accuracy")} metric="accuracy" label="Accuracy" /></Card>
          </div>

          <Card title="Training history (all runs)">
            <div className="max-h-80 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-ink-850/95 text-left text-[11px] uppercase tracking-wider text-slate-500 backdrop-blur">
                  <tr>
                    <th className="table-cell">When</th>
                    <th className="table-cell">Model</th>
                    <th className="table-cell text-right">ROC-AUC</th>
                    <th className="table-cell text-right">PR-AUC</th>
                    <th className="table-cell text-right">F1</th>
                    <th className="table-cell text-right">Rows</th>
                    <th className="table-cell">MLflow run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/50">
                  {history.map((m) => (
                    <tr key={m.id} className="hover:bg-ink-800/40">
                      <td className="table-cell tabular text-slate-400">{new Date(m.ts).toLocaleString()}</td>
                      <td className="table-cell text-slate-300">{m.model_name}{m.is_active && <span className="ml-1 text-brand-400">●</span>}</td>
                      <td className="table-cell text-right tabular">{m.metrics?.roc_auc?.toFixed(4) ?? "—"}</td>
                      <td className="table-cell text-right tabular">{m.metrics?.pr_auc?.toFixed(4) ?? "—"}</td>
                      <td className="table-cell text-right tabular">{m.metrics?.f1?.toFixed(4) ?? "—"}</td>
                      <td className="table-cell text-right tabular text-slate-500">{fmt.num((m.n_train ?? 0) + (m.n_test ?? 0))}</td>
                      <td className="table-cell font-mono text-[11px] text-slate-500">{m.mlflow_run_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
