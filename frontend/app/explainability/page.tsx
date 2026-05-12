"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ExplainResponse, FeedRow, Prediction } from "@/lib/api";
import { FeatureImportanceChart, ShapBars } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardSkeleton, ErrorNote, fmt, PageHeader, ProbBar, Spinner } from "@/components/widgets";

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

  const [importance, setImportance] = useState<{
    model_name: string;
    feature_importance: Record<string, number>;
    feature_names: string[];
  } | null>(null);
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
    const load = () =>
      api
        .feed(60, true)
        .then((r) => {
          setRecent(r);
          setSelectedId((cur) => cur ?? (r[0]?.prediction_id ?? null));
        })
        .catch(() => {});
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

  const importanceItems = useMemo(
    () =>
      importance
        ? Object.entries(importance.feature_importance)
            .map(([feature, v]) => ({ feature, importance: Number(v) }))
            .sort((a, b) => b.importance - a.importance)
        : [],
    [importance],
  );
  const sortedContribs = useMemo(
    () => (explain ? explain.contributions.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)) : []),
    [explain],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explainability"
        subtitle="Global feature importance and per-prediction SHAP attributions: why the model flagged a transaction."
        right={importance ? <Badge variant="primary">model: {importance.model_name}</Badge> : null}
      />
      {err && <ErrorNote msg={err} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Global feature importance · active model</CardTitle></CardHeader>
          <CardContent>{importance ? <FeatureImportanceChart items={importanceItems} /> : <CardSkeleton rows={8} />}</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Inspect a prediction</CardTitle>
            <NativeSelect value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">recent fraud alerts…</option>
              {recent.map((r) => (
                <option key={r.prediction_id} value={r.prediction_id}>
                  #{r.prediction_id} · {r.user_id} · ${fmt.num(r.amount, 0)} · {r.merchant_type} · p={fmt.prob(r.fraud_probability)}
                </option>
              ))}
            </NativeSelect>
          </CardHeader>
          <CardContent>
            {selectedId == null ? (
              <p className="text-sm text-muted-foreground">Pick a prediction (or follow a “why” link from the dashboard).</p>
            ) : loadingExplain && !explain ? (
              <Spinner label="computing SHAP values…" />
            ) : explain ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted-foreground">prediction #{selectedId}</span>
                  {predMeta && <span className="font-mono text-xs text-muted-foreground">{predMeta.user_id}</span>}
                  <span className="tabular">
                    fraud probability <span className="text-foreground">{fmt.prob(explain.prediction)}</span>
                  </span>
                  {predMeta && (predMeta.predicted_fraud ? <Badge variant="destructive">FLAGGED</Badge> : <Badge variant="success">cleared</Badge>)}
                  {predMeta?.actual_fraud != null && (
                    <Badge variant={predMeta.actual_fraud ? "warning" : "outline"}>label: {predMeta.actual_fraud ? "fraud" : "legit"}</Badge>
                  )}
                </div>
                <div>
                  <ProbBar p={explain.prediction} threshold={predMeta?.threshold} />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    base value (avg model output) {explain.base_value.toFixed(4)} → pushed to {explain.prediction.toFixed(4)}
                  </div>
                </div>
                <ShapBars contributions={explain.contributions} />
              </div>
            ) : (
              <Spinner />
            )}
          </CardContent>
        </Card>
      </div>

      {explain && (
        <Card>
          <CardHeader><CardTitle>Feature values &amp; SHAP contributions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">SHAP</TableHead>
                  <TableHead className="w-56">Direction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContribs.map((c) => {
                  const mag = Math.min(1, Math.abs(c.shap) / (Math.abs(sortedContribs[0]?.shap || 1) || 1));
                  return (
                    <TableRow key={c.feature}>
                      <TableCell className="capitalize">{fmt.feature(c.feature)}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">{c.value.toFixed(4)}</TableCell>
                      <TableCell className={`text-right tabular ${c.shap >= 0 ? "text-destructive" : "text-primary"}`}>
                        {c.shap >= 0 ? "+" : ""}
                        {c.shap.toFixed(4)}
                      </TableCell>
                      <TableCell>
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="flex w-1/2 justify-end">
                            {c.shap < 0 && <div className="h-full rounded-l-full bg-primary" style={{ width: `${mag * 100}%` }} />}
                          </div>
                          <div className="flex w-1/2">
                            {c.shap >= 0 && <div className="h-full rounded-r-full bg-destructive" style={{ width: `${mag * 100}%` }} />}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Positive SHAP (red) pushes the prediction toward <span className="text-destructive">fraud</span>; negative (teal) toward legit.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
