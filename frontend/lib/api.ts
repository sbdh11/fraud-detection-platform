// Typed API client. Base URL inlined at build from NEXT_PUBLIC_API_BASE.
export const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "")) ||
  "http://localhost:8008/api";

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return get<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- types ----------
export interface DashboardSummary {
  active_model: string | null;
  threshold: number;
  total_transactions: number;
  total_predictions: number;
  fraud_alerts: number;
  fraud_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  precision: number | null;
  recall: number | null;
  roc_auc: number | null;
  simulation_running: boolean;
  last_drift_psi: number | null;
  last_drift_flag: boolean | null;
}

export interface TopFactor { feature: string; value: number; shap: number }

export interface Prediction {
  id: number;
  ts: string;
  transaction_id: number | null;
  user_id: string;
  model_name: string;
  fraud_probability: number;
  threshold: number;
  predicted_fraud: boolean;
  actual_fraud: boolean | null;
  latency_ms: number;
  features: Record<string, number>;
  top_factors: TopFactor[];
}

export interface ModelRun {
  id: number;
  ts: string;
  model_name: string;
  mlflow_run_id: string | null;
  is_active: boolean;
  threshold: number;
  params: Record<string, unknown>;
  metrics: Record<string, number>;
  feature_names: string[];
  feature_importance: Record<string, number>;
  n_train: number;
  n_test: number;
}

export interface DriftSnapshot {
  id: number;
  ts: string;
  n_reference: number;
  n_current: number;
  fraud_rate_reference: number;
  fraud_rate_current: number;
  pred_rate_reference: number;
  pred_rate_current: number;
  mean_score_reference: number;
  mean_score_current: number;
  feature_psi: Record<string, number>;
  overall_psi: number;
  drift_flag: boolean;
}

export interface TimeseriesPoint {
  t: string;
  count: number;
  fraud_count: number;
  fraud_rate: number;
  avg_latency_ms: number;
  mean_score: number;
}

export interface FeedRow {
  prediction_id: number;
  transaction_id: number;
  ts: string;
  user_id: string;
  amount: number;
  merchant_type: string;
  location: string;
  device_type: string;
  model_name: string;
  fraud_probability: number;
  threshold: number;
  predicted_fraud: boolean;
  actual_fraud: boolean | null;
  latency_ms: number;
  top_factors: TopFactor[];
}

export interface SimState {
  running: boolean;
  interval_seconds: number;
  burst: number;
  fraud_rate: number;
  ticks: number;
}

export interface ExplainResponse {
  model_name: string;
  base_value: number;
  prediction: number;
  features: Record<string, number>;
  contributions: TopFactor[];
}

// ---------- endpoints ----------
export const api = {
  summary: () => get<DashboardSummary>("/summary"),
  health: () => get<any>("/health"),
  predictions: (limit = 50, fraudOnly = false) =>
    get<Prediction[]>(`/predictions?limit=${limit}${fraudOnly ? "&fraud_only=true" : ""}`),
  alerts: (limit = 20) => get<Prediction[]>(`/predictions/alerts?limit=${limit}`),
  feed: (limit = 40, fraudOnly = false) =>
    get<FeedRow[]>(`/feed?limit=${limit}${fraudOnly ? "&fraud_only=true" : ""}`),
  prediction: (id: number) => get<Prediction>(`/predictions/${id}`),
  timeseries: (minutes = 30, buckets = 30) =>
    get<{ minutes: number; buckets: number; series: TimeseriesPoint[] }>(
      `/metrics/timeseries?minutes=${minutes}&buckets=${buckets}`,
    ),
  models: () => get<ModelRun[]>("/models?limit=50"),
  modelsLatest: () => get<ModelRun[]>("/models/latest"),
  activeModel: () => get<any>("/models/active"),
  train: (rows?: number, setActive?: string) =>
    post<any>("/models/train", { rows: rows ?? null, set_active: setActive ?? null }),
  activate: (name: string) => post<any>(`/models/${name}/activate`),
  drift: (limit = 100) => get<DriftSnapshot[]>(`/drift?limit=${limit}`),
  driftLatest: () => get<DriftSnapshot>("/drift/latest"),
  runDrift: () => post<DriftSnapshot>("/drift/run"),
  importance: () => get<{ model_name: string; feature_importance: Record<string, number>; feature_names: string[] }>(
    "/explain/importance"),
  explainPrediction: (id: number) => get<ExplainResponse>(`/explain/prediction/${id}`),
  sim: () => get<SimState>("/simulation"),
  setSim: (cfg: Partial<{ running: boolean; interval_seconds: number; burst: number; fraud_rate: number }>) =>
    post<SimState>("/simulation", cfg),
};
