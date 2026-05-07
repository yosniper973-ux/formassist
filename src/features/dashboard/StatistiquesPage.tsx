import { useState, useEffect, useCallback } from "react";
import { BarChart2, GraduationCap, FileText, Zap, RefreshCw, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MonthData {
  month: string;
  label: string;
  total: number;
}

interface NoteByFormation {
  formation: string;
  total: number;
  avgPct: number;
}

interface ContentTypeStat {
  type: string;
  label: string;
  total: number;
}

interface ApiMonthStat {
  month: string;
  label: string;
  cost: number;
}

interface StatsData {
  correctionsPerMonth: MonthData[];
  contentsPerMonth: MonthData[];
  notesByFormation: NoteByFormation[];
  totalCorrections: number;
  avgGradePct: number | null;
  mentionCounts: { label: string; count: number; color: string }[];
  contentTypes: ContentTypeStat[];
  apiCostPerMonth: ApiMonthStat[];
  totalApiCost: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, string> = {
  course: "Cours",
  exercise_individual: "Exercice individuel",
  exercise_small_group: "Exercice petit groupe",
  exercise_collective: "Exercice collectif",
  pedagogical_game: "Jeu pédagogique",
  role_play: "Mise en situation",
  trainer_sheet: "Fiche formateur",
};

function getLast6Months(): { label: string; key: string }[] {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    result.push({
      label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return result;
}

function since6Months(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  d.setDate(1);
  return d.toISOString().split("T")[0]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export function StatistiquesPage() {
  const activeCentreId = useAppStore((s) => s.activeCentreId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatsData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const months = getLast6Months();
      const since = since6Months();

      // ── Corrections par mois ──────────────────────────────────────────────
      const corrFilter = activeCentreId
        ? `JOIN learners l ON c.learner_id = l.id
           JOIN groups g ON l.group_id = g.id
           JOIN formations f ON g.formation_id = f.id
           WHERE f.centre_id = ? AND c.created_at >= ?`
        : `JOIN learners l ON c.learner_id = l.id
           JOIN groups g ON l.group_id = g.id
           JOIN formations f ON g.formation_id = f.id
           WHERE c.created_at >= ?`;
      const corrParams = activeCentreId ? [activeCentreId, since] : [since];

      const corrRows = await db.query<{ month: string; total: number }>(
        `SELECT strftime('%Y-%m', c.created_at) as month, COUNT(*) as total
         FROM corrections c ${corrFilter}
         GROUP BY month ORDER BY month`,
        corrParams,
      );

      const correctionsPerMonth: MonthData[] = months.map((m) => ({
        month: m.key,
        label: m.label,
        total: corrRows.find((r) => r.month === m.key)?.total ?? 0,
      }));

      // ── Contenus générés par mois ─────────────────────────────────────────
      const contFilter = activeCentreId
        ? `JOIN formations f ON gc.formation_id = f.id
           WHERE f.centre_id = ? AND gc.archived_at IS NULL AND gc.created_at >= ?`
        : `JOIN formations f ON gc.formation_id = f.id
           WHERE gc.archived_at IS NULL AND gc.created_at >= ?`;
      const contParams = activeCentreId ? [activeCentreId, since] : [since];

      const contRows = await db.query<{ month: string; total: number }>(
        `SELECT strftime('%Y-%m', gc.created_at) as month, COUNT(*) as total
         FROM generated_contents gc ${contFilter}
         GROUP BY month ORDER BY month`,
        contParams,
      );

      const contentsPerMonth: MonthData[] = months.map((m) => ({
        month: m.key,
        label: m.label,
        total: contRows.find((r) => r.month === m.key)?.total ?? 0,
      }));

      // ── Notes par formation ───────────────────────────────────────────────
      const notesFilter = activeCentreId
        ? `WHERE f.centre_id = ? AND c.grade IS NOT NULL AND c.max_grade > 0`
        : `WHERE c.grade IS NOT NULL AND c.max_grade > 0`;
      const notesParams = activeCentreId ? [activeCentreId] : [];

      const notesRows = await db.query<{
        formation: string;
        total: number;
        avg_pct: number;
      }>(
        `SELECT f.title as formation, COUNT(c.id) as total,
                AVG(c.grade * 100.0 / c.max_grade) as avg_pct
         FROM corrections c
         JOIN learners l ON c.learner_id = l.id
         JOIN groups g ON l.group_id = g.id
         JOIN formations f ON g.formation_id = f.id
         ${notesFilter}
         GROUP BY f.id, f.title
         ORDER BY total DESC`,
        notesParams,
      );

      const notesByFormation: NoteByFormation[] = notesRows.map((r) => ({
        formation: r.formation,
        total: r.total,
        avgPct: Math.round(r.avg_pct),
      }));

      // Total corrections & moyenne globale
      const totalCorrections = notesByFormation.reduce((s, r) => s + r.total, 0);
      const avgGradePct =
        notesByFormation.length > 0
          ? Math.round(
              notesByFormation.reduce((s, r) => s + r.avgPct * r.total, 0) /
                totalCorrections,
            )
          : null;

      // Distribution par mention
      const mentionFilter = activeCentreId
        ? `JOIN learners l ON c.learner_id = l.id JOIN groups g ON l.group_id = g.id JOIN formations f ON g.formation_id = f.id WHERE f.centre_id = ? AND c.grade IS NOT NULL AND c.max_grade > 0`
        : `JOIN learners l ON c.learner_id = l.id JOIN groups g ON l.group_id = g.id JOIN formations f ON g.formation_id = f.id WHERE c.grade IS NOT NULL AND c.max_grade > 0`;
      const mentionParams = activeCentreId ? [activeCentreId] : [];

      const mentionRows = await db.query<{ pct: number }>(
        `SELECT c.grade * 100.0 / c.max_grade as pct FROM corrections c ${mentionFilter}`,
        mentionParams,
      );

      const mentions = [
        { label: "Très bien (≥ 80%)", count: 0, color: "#22c55e" },
        { label: "Bien (60–79%)", count: 0, color: "#84cc16" },
        { label: "Passable (50–59%)", count: 0, color: "#eab308" },
        { label: "Insuffisant (< 50%)", count: 0, color: "#ef4444" },
      ];
      for (const r of mentionRows) {
        if (r.pct >= 80) mentions[0]!.count++;
        else if (r.pct >= 60) mentions[1]!.count++;
        else if (r.pct >= 50) mentions[2]!.count++;
        else mentions[3]!.count++;
      }

      // ── Répartition types de contenus ────────────────────────────────────
      const typeFilter = activeCentreId
        ? `JOIN formations f ON gc.formation_id = f.id WHERE f.centre_id = ? AND gc.archived_at IS NULL`
        : `JOIN formations f ON gc.formation_id = f.id WHERE gc.archived_at IS NULL`;
      const typeParams = activeCentreId ? [activeCentreId] : [];

      const typeRows = await db.query<{ content_type: string; total: number }>(
        `SELECT gc.content_type, COUNT(*) as total
         FROM generated_contents gc ${typeFilter}
         GROUP BY gc.content_type ORDER BY total DESC`,
        typeParams,
      );

      const contentTypes: ContentTypeStat[] = typeRows.map((r) => ({
        type: r.content_type,
        label: CONTENT_TYPE_LABELS[r.content_type] ?? r.content_type,
        total: r.total,
      }));

      // ── Coût API par mois ─────────────────────────────────────────────────
      const apiRows = await db.query<{ month: string; cost: number }>(
        `SELECT strftime('%Y-%m', created_at) as month, SUM(cost_euros) as cost
         FROM api_usage_log WHERE created_at >= ?
         GROUP BY month ORDER BY month`,
        [since],
      );

      const apiCostPerMonth: ApiMonthStat[] = months.map((m) => ({
        month: m.key,
        label: m.label,
        cost: apiRows.find((r) => r.month === m.key)?.cost ?? 0,
      }));

      const totalApiCost = apiRows.reduce((s, r) => s + r.cost, 0);

      setData({
        correctionsPerMonth,
        contentsPerMonth,
        notesByFormation,
        totalCorrections,
        avgGradePct,
        mentionCounts: mentions,
        contentTypes,
        apiCostPerMonth,
        totalApiCost,
      });
    } catch (err) {
      console.error("Erreur chargement statistiques :", err);
      setError("Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
    }
  }, [activeCentreId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const scope = activeCentreId ? "ce centre" : "tous les centres";

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Historique sur 6 mois — {scope}
        </p>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </Button>
      </div>

      {/* ─── Section 1 : Activité mensuelle ─────────────────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <TrendingUp className="h-5 w-5 text-indigo-500" />
          Activité mensuelle
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard
            title="Corrections réalisées"
            data={data.correctionsPerMonth}
            color="#6366f1"
          />
          <ChartCard
            title="Contenus générés"
            data={data.contentsPerMonth}
            color="#10b981"
          />
        </div>
      </section>

      {/* ─── Section 2 : Analyse des notes ──────────────────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <GraduationCap className="h-5 w-5 text-amber-500" />
          Analyse des notes
        </h2>

        {data.totalCorrections === 0 ? (
          <EmptyState message="Aucune correction avec note pour le moment." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* KPIs notes */}
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="text-sm text-muted-foreground">Total corrections</p>
                <p className="text-3xl font-bold text-foreground">{data.totalCorrections}</p>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="text-sm text-muted-foreground">Moyenne globale</p>
                <p
                  className="text-3xl font-bold"
                  style={{
                    color:
                      data.avgGradePct == null ? "#6b7280"
                      : data.avgGradePct >= 80 ? "#22c55e"
                      : data.avgGradePct >= 60 ? "#84cc16"
                      : data.avgGradePct >= 50 ? "#eab308"
                      : "#ef4444",
                  }}
                >
                  {data.avgGradePct != null ? `${data.avgGradePct}%` : "—"}
                </p>
              </div>

              {/* Distribution par mention */}
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="mb-3 text-sm font-medium text-foreground">Répartition</p>
                <div className="space-y-2">
                  {data.mentionCounts.map((m) => {
                    const total = data.mentionCounts.reduce((s, x) => s + x.count, 0);
                    const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
                    return (
                      <div key={m.label}>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-0.5">
                          <span>{m.label}</span>
                          <span className="font-medium text-foreground">{m.count}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: m.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Table notes par formation */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-span-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="px-4 py-3">Formation</th>
                    <th className="px-4 py-3 text-center">Corrections</th>
                    <th className="px-4 py-3">Moyenne</th>
                  </tr>
                </thead>
                <tbody>
                  {data.notesByFormation.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                        {r.formation}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{r.total}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${r.avgPct}%`,
                                backgroundColor:
                                  r.avgPct >= 80 ? "#22c55e"
                                  : r.avgPct >= 60 ? "#84cc16"
                                  : r.avgPct >= 50 ? "#eab308"
                                  : "#ef4444",
                              }}
                            />
                          </div>
                          <span
                            className="text-xs font-semibold"
                            style={{
                              color:
                                r.avgPct >= 80 ? "#22c55e"
                                : r.avgPct >= 60 ? "#84cc16"
                                : r.avgPct >= 50 ? "#eab308"
                                : "#ef4444",
                            }}
                          >
                            {r.avgPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ─── Section 3 : Types de contenus ──────────────────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <FileText className="h-5 w-5 text-emerald-500" />
          Répartition des contenus générés
        </h2>

        {data.contentTypes.length === 0 ? (
          <EmptyState message="Aucun contenu généré pour le moment." />
        ) : (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <HorizontalBarChart
              items={data.contentTypes.map((c) => ({ label: c.label, value: c.total }))}
              color="#10b981"
            />
          </div>
        )}
      </section>

      {/* ─── Section 4 : Coût API ────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Zap className="h-5 w-5 text-yellow-500" />
          Dépenses IA (API Claude)
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">Total 6 mois</p>
            <p className="text-3xl font-bold text-foreground">
              {data.totalApiCost.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm sm:col-span-2">
            <ChartCard
              title="Coût par mois (€)"
              data={data.apiCostPerMonth.map((m) => ({
                ...m,
                total: parseFloat(m.cost.toFixed(4)),
              }))}
              color="#f59e0b"
              formatValue={(v) =>
                v.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                })
              }
            />
          </div>
        </div>
      </section>

      {/* Aucune activité globale */}
      {data.totalCorrections === 0 &&
        data.contentTypes.length === 0 &&
        data.totalApiCost === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <BarChart2 className="h-10 w-10 opacity-30" />
            <p>Aucune activité enregistrée sur les 6 derniers mois.</p>
          </div>
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Histogramme vertical (CSS)
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({
  title,
  data,
  color,
  formatValue,
}: {
  title: string;
  data: { label: string; total: number }[];
  color: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const fmt = formatValue ?? ((v: number) => String(v));

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="mb-4 text-sm font-medium text-foreground">{title}</p>
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {data.map((d) => {
          const heightPct = (d.total / max) * 100;
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              {d.total > 0 && (
                <span className="text-[10px] font-medium text-foreground leading-none">
                  {fmt(d.total)}
                </span>
              )}
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{
                  height: `${Math.max(heightPct, d.total > 0 ? 4 : 0)}%`,
                  backgroundColor: d.total > 0 ? color : "transparent",
                  minHeight: d.total > 0 ? 4 : 0,
                }}
              />
              <span className="text-[10px] text-muted-foreground leading-none">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Barres horizontales (types de contenu)
// ─────────────────────────────────────────────────────────────────────────────

function HorizontalBarChart({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-sm text-foreground truncate">{item.label}</span>
          <div className="flex-1 h-5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-medium text-foreground">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// État vide
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border bg-muted/30 py-8 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
