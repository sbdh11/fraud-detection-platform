"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ModelRun } from "@/lib/api";
import { ModelMetricBars } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardSkeleton, ErrorNote, fmt, Note, PageHeader } from "@/components/widgets";

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
      setMsg("Training started. Refresh in about a minute.");
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
        subtitle="XGBoost vs LightGBM vs a RandomForest baseline, trained on the same synthetic data, tracked in MLflow."
        right={
          <div className="flex items-center gap-3">
            <Button variant="subtle" size="sm" onClick={retrain} disabled={busy === "__train__" || training?.running}>
              {training?.running ? "training…" : "Retrain all models"}
            </Button>
            {activeName && <Badge variant="primary">active: {activeName}</Badge>}
          </div>
        }
      />
      {err && <ErrorNote msg={err} />}
      {msg && <Note>{msg}</Note>}
      {training?.running && <Note tone="warning">Training in progress…</Note>}

      {orderedLatest.length === 0 ? (
        <Card>
          <CardContent className="pt-5"><CardSkeleton rows={5} /></CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Latest run per model</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Model</TableHead>
                    {METRIC_COLS.map((c) => (
                      <TableHead key={c.key} className="text-right">{c.label}</TableHead>
                    ))}
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Train / Test</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderedLatest.map((m) => (
                    <TableRow key={m.id} className={m.model_name === activeName ? "bg-primary/[0.07]" : undefined}>
                      <TableCell className="font-medium">
                        {m.model_name}
                        {m.model_name === activeName && <Badge variant="primary" className="ml-2">active</Badge>}
                      </TableCell>
                      {METRIC_COLS.map((c) => {
                        const v = m.metrics?.[c.key];
                        const best = orderedLatest.every((o) => (o.metrics?.[c.key] ?? -1) <= (v ?? -1));
                        return (
                          <TableCell key={c.key} className={`text-right tabular ${best ? "text-primary" : ""}`}>
                            {v != null ? Number(v).toFixed(4) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular text-muted-foreground">{m.threshold?.toFixed(3) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground/80">
                        {fmt.num(m.n_train)} / {fmt.num(m.n_test)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" disabled={m.model_name === activeName || busy === m.model_name} onClick={() => activate(m.model_name)}>
                          {busy === m.model_name ? "…" : m.model_name === activeName ? "in use" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {active?.run?.mlflow_run_id && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Active MLflow run: <span className="font-mono">{active.run.mlflow_run_id}</span> (experiment “fraud-detection”).
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {METRIC_COLS.map((c) => (
              <Card key={c.key}>
                <CardHeader><CardTitle>{c.label}</CardTitle></CardHeader>
                <CardContent><ModelMetricBars models={metricBarData(c.key)} label={c.label} /></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>Training history · all runs</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card/95 backdrop-blur">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>When</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">ROC-AUC</TableHead>
                      <TableHead className="text-right">PR-AUC</TableHead>
                      <TableHead className="text-right">F1</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead>MLflow run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="tabular text-muted-foreground">{new Date(m.ts).toLocaleString()}</TableCell>
                        <TableCell>
                          {m.model_name}
                          {m.is_active && <span className="ml-1 text-primary">●</span>}
                        </TableCell>
                        <TableCell className="text-right tabular">{m.metrics?.roc_auc?.toFixed(4) ?? "—"}</TableCell>
                        <TableCell className="text-right tabular">{m.metrics?.pr_auc?.toFixed(4) ?? "—"}</TableCell>
                        <TableCell className="text-right tabular">{m.metrics?.f1?.toFixed(4) ?? "—"}</TableCell>
                        <TableCell className="text-right tabular text-muted-foreground/80">{fmt.num((m.n_train ?? 0) + (m.n_test ?? 0))}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{m.mlflow_run_id ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
