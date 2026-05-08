import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap,
  Users,
  Target,
  BookOpen,
  FileText,
  RefreshCw,
  Building2,
  Calendar,
  Clock,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Formation } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────────────────────────────────────

interface FormationProgress {
  id: string;
  title: string;
  slotsDone: number;
  slotsPlanned: number;
}

interface RecentContent {
  id: string;
  title: string;
  content_type: string;
  formation_title: string;
  created_at: string;
}

interface LearnerProgressBucket {
  label: string;
  count: number;
  color: string;
}

interface DashboardData {
  activeFormations: number;
  totalLearners: number;
  competenceCoverage: number;
  formationProgress: FormationProgress[];
  recentContents: RecentContent[];
  progressDistribution: LearnerProgressBucket[];
}

interface CentreSummary {
  id: string;
  name: string;
  formationsCount: number;
  learnersCount: number;
  progressPct: number;
}

interface UpcomingSlot {
  date: string;
  start_time: string | null;
  end_time: string | null;
  formation_title: string;
  centre_name: string;
}

interface GlobalData {
  centresCount: number;
  totalFormations: number;
  totalLearners: number;
  contentsThisMonth: number;
  centres: CentreSummary[];
  upcomingSlots: UpcomingSlot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels contenus
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

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

function getGreetingPrefix(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 22) return "Bonne nuit";
  if (h >= 18) return "Bonsoir";
  return "Bonjour";
}

export function DashboardPedagoPage() {
  const activeCentreId = useAppStore((s) => s.activeCentreId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [data, setData] = useState<DashboardData>({
    activeFormations: 0,
    totalLearners: 0,
    competenceCoverage: 0,
    formationProgress: [],
    recentContents: [],
    progressDistribution: [],
  });
  const [globalData, setGlobalData] = useState<GlobalData | null>(null);

  // ─── Chargement données globales (tous les centres) ───
  const loadGlobalData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = toLocalDateString(new Date());
      const in7days = toLocalDateString(new Date(Date.now() + 7 * 86400000));
      const now = new Date();
      const monthStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));

      const [centresRows, formationsRows, learnersRows, contentsRows] = await Promise.all([
        db.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM centres WHERE archived_at IS NULL`,
          [],
        ),
        db.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM formations WHERE archived_at IS NULL`,
          [],
        ),
        db.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM learners l
           JOIN groups g ON l.group_id = g.id
           JOIN formations f ON g.formation_id = f.id
           WHERE f.archived_at IS NULL AND g.archived_at IS NULL AND l.archived_at IS NULL`,
          [],
        ),
        db.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM generated_contents gc
           JOIN formations f ON gc.formation_id = f.id
           WHERE gc.archived_at IS NULL AND f.archived_at IS NULL
             AND gc.created_at >= ?`,
          [monthStart],
        ),
      ]);

      // Résumé par centre
      const centreRows = await db.query<{
        id: string; name: string;
        formations_count: number; learners_count: number;
        slots_done: number; slots_total: number;
      }>(
        `SELECT
           c.id, c.name,
           COUNT(DISTINCT f.id) as formations_count,
           COUNT(DISTINCT l.id) as learners_count,
           COALESCE(SUM(CASE WHEN s.date < ? THEN 1 ELSE 0 END), 0) as slots_done,
           COALESCE(COUNT(s.id), 0) as slots_total
         FROM centres c
         LEFT JOIN formations f ON f.centre_id = c.id AND f.archived_at IS NULL
         LEFT JOIN groups g ON g.formation_id = f.id AND g.archived_at IS NULL
         LEFT JOIN learners l ON l.group_id = g.id AND l.archived_at IS NULL
         LEFT JOIN slots s ON s.formation_id = f.id
         WHERE c.archived_at IS NULL
         GROUP BY c.id, c.name
         ORDER BY c.name`,
        [today],
      );

      const centres: CentreSummary[] = centreRows.map((r) => ({
        id: r.id,
        name: r.name,
        formationsCount: r.formations_count,
        learnersCount: r.learners_count,
        progressPct: r.slots_total > 0 ? Math.round((r.slots_done / r.slots_total) * 100) : 0,
      }));

      // Prochaines sessions (7 jours)
      const upcomingSlots = await db.query<UpcomingSlot>(
        `SELECT s.date, s.start_time, s.end_time, f.title as formation_title, c.name as centre_name
         FROM slots s
         JOIN formations f ON s.formation_id = f.id
         JOIN centres c ON f.centre_id = c.id
         WHERE s.date >= ? AND s.date <= ? AND f.archived_at IS NULL
         ORDER BY s.date, s.start_time
         LIMIT 10`,
        [today, in7days],
      );

      setGlobalData({
        centresCount: centresRows[0]?.total ?? 0,
        totalFormations: formationsRows[0]?.total ?? 0,
        totalLearners: learnersRows[0]?.total ?? 0,
        contentsThisMonth: contentsRows[0]?.total ?? 0,
        centres,
        upcomingSlots,
      });
    } catch (err) {
      console.error("Erreur chargement dashboard global :", err);
      setError("Impossible de charger les données globales.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Chargement données par centre ───
  const loadData = useCallback(async () => {
    if (!activeCentreId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formations = (await db.getFormations(activeCentreId)) as unknown as Formation[];

      const activeFormations = formations.length;

      const learnerRows = await db.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM learners l
         JOIN groups g ON l.group_id = g.id
         JOIN formations f ON g.formation_id = f.id
         WHERE f.centre_id = ? AND f.archived_at IS NULL
           AND g.archived_at IS NULL AND l.archived_at IS NULL`,
        [activeCentreId],
      );
      const totalLearners = learnerRows[0]?.total ?? 0;

      const coverageRows = await db.query<{ total_comp: number; covered_comp: number }>(
        `SELECT
           COUNT(DISTINCT comp.id) as total_comp,
           COUNT(DISTINCT sc.competence_id) as covered_comp
         FROM competences comp
         JOIN ccps ccp ON comp.ccp_id = ccp.id
         JOIN formations f ON ccp.formation_id = f.id
         LEFT JOIN slot_competences sc ON sc.competence_id = comp.id
         WHERE f.centre_id = ? AND f.archived_at IS NULL AND comp.in_scope = 1`,
        [activeCentreId],
      );
      const totalComp = coverageRows[0]?.total_comp ?? 0;
      const coveredComp = coverageRows[0]?.covered_comp ?? 0;
      const competenceCoverage = totalComp > 0 ? Math.round((coveredComp / totalComp) * 100) : 0;

      const today = toLocalDateString(new Date());
      const formationProgress: FormationProgress[] = [];

      for (const f of formations) {
        const slotsAll = await db.query<{ total: number }>(
          "SELECT COUNT(*) as total FROM slots WHERE formation_id = ?",
          [f.id],
        );
        const slotsDone = await db.query<{ total: number }>(
          "SELECT COUNT(*) as total FROM slots WHERE formation_id = ? AND date < ?",
          [f.id, today],
        );
        formationProgress.push({
          id: f.id,
          title: f.title,
          slotsDone: slotsDone[0]?.total ?? 0,
          slotsPlanned: slotsAll[0]?.total ?? 0,
        });
      }

      const recentContents = await db.query<RecentContent>(
        `SELECT gc.id, gc.title, gc.content_type, f.title as formation_title, gc.created_at
         FROM generated_contents gc
         JOIN formations f ON gc.formation_id = f.id
         WHERE f.centre_id = ? AND gc.archived_at IS NULL AND f.archived_at IS NULL
         ORDER BY gc.created_at DESC
         LIMIT 8`,
        [activeCentreId],
      );

      const bucketRows = await db.query<{ formation_id: string; learner_count: number; slots_done: number; slots_total: number }>(
        `SELECT
           f.id as formation_id,
           COUNT(DISTINCT l.id) as learner_count,
           (SELECT COUNT(*) FROM slots s WHERE s.formation_id = f.id AND s.date < ?) as slots_done,
           (SELECT COUNT(*) FROM slots s WHERE s.formation_id = f.id) as slots_total
         FROM formations f
         JOIN groups g ON g.formation_id = f.id
         JOIN learners l ON l.group_id = g.id
         WHERE f.centre_id = ? AND f.archived_at IS NULL
           AND g.archived_at IS NULL AND l.archived_at IS NULL
         GROUP BY f.id`,
        [today, activeCentreId],
      );

      const buckets = [
        { label: "0-25%", count: 0, color: "#ef4444" },
        { label: "26-50%", count: 0, color: "#f97316" },
        { label: "51-75%", count: 0, color: "#eab308" },
        { label: "76-100%", count: 0, color: "#22c55e" },
      ];

      for (const row of bucketRows) {
        const pct = row.slots_total > 0 ? (row.slots_done / row.slots_total) * 100 : 0;
        const idx = pct <= 25 ? 0 : pct <= 50 ? 1 : pct <= 75 ? 2 : 3;
        buckets[idx]!.count += row.learner_count;
      }

      setData({
        activeFormations,
        totalLearners,
        competenceCoverage,
        formationProgress,
        recentContents,
        progressDistribution: buckets,
      });
    } catch (err) {
      console.error("Erreur chargement dashboard pédago :", err);
      setError("Impossible de charger les données du tableau de bord.");
    } finally {
      setLoading(false);
    }
  }, [activeCentreId]);

  useEffect(() => {
    if (!activeCentreId) {
      loadGlobalData();
    } else {
      loadData();
    }
  }, [activeCentreId, loadData, loadGlobalData]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      db.getConfig("user_first_name").then((v) => {
        if (!cancelled) setFirstName((v ?? "").trim());
      });
    };
    load();
    window.addEventListener("user-profile-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("user-profile-updated", load);
    };
  }, []);

  // ─── Chargement ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ─── Erreur ───
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // ─── Vue globale (tous les centres) ───
  if (!activeCentreId && globalData) {
    return (
      <div className="space-y-6">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground">
              <span className="emoji-bounce text-[34px] leading-none drop-shadow-sm" aria-hidden>👋</span>
              {getGreetingPrefix()}
              {firstName ? ` ${firstName}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              Vue d'ensemble — tous les centres
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadGlobalData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
        </div>

        {/* KPIs globaux */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Building2 className="h-5 w-5" />}
            label="Centres actifs"
            value={globalData.centresCount.toString()}
            color="#8b5cf6"
          />
          <StatCard
            icon={<GraduationCap className="h-5 w-5" />}
            label="Formations actives"
            value={globalData.totalFormations.toString()}
            color="#6366f1"
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Apprenants inscrits"
            value={globalData.totalLearners.toString()}
            color="#06b6d4"
          />
          <StatCard
            icon={<FileText className="h-5 w-5" />}
            label="Contenus ce mois"
            value={globalData.contentsThisMonth.toString()}
            color="#10b981"
          />
        </div>

        {/* Résumé par centre */}
        {globalData.centres.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Résumé par centre
            </h2>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="px-4 py-3">Centre</th>
                    <th className="px-4 py-3 text-center">Formations</th>
                    <th className="px-4 py-3 text-center">Apprenants</th>
                    <th className="px-4 py-3">Progression</th>
                  </tr>
                </thead>
                <tbody>
                  {globalData.centres.map((c, i) => (
                    <tr
                      key={c.id}
                      className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary">{c.formationsCount}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium">{c.learnersCount}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${c.progressPct}%`,
                                backgroundColor:
                                  c.progressPct < 30 ? "#ef4444"
                                  : c.progressPct < 70 ? "#eab308"
                                  : "#22c55e",
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {c.progressPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Prochaines sessions */}
        {globalData.upcomingSlots.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Prochaines sessions (7 jours)
            </h2>
            <div className="space-y-2">
              {globalData.upcomingSlots.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.formation_title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.centre_name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(s.date)}
                    </p>
                    {s.start_time && (
                      <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {s.start_time}{s.end_time ? ` – ${s.end_time}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Aucune donnée */}
        {globalData.centresCount === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Building2 className="h-10 w-10 opacity-30" />
            <p>Aucun centre configuré. Commence par en créer un !</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Vue par centre ───
  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground">
            <span className="emoji-bounce text-[34px] leading-none drop-shadow-sm" aria-hidden>👋</span>
            {getGreetingPrefix()}
            {firstName ? ` ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Voici un aperçu de tes formations et de la progression
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Cartes statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<GraduationCap className="h-5 w-5" />}
          label="Formations actives"
          value={data.activeFormations.toString()}
          color="#6366f1"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Apprenants"
          value={data.totalLearners.toString()}
          color="#06b6d4"
        />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          label="Couverture compétences"
          value={`${data.competenceCoverage}%`}
          color="#10b981"
        />
      </div>

      {/* Progression par formation */}
      {data.formationProgress.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Progression par formation
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.formationProgress.map((fp) => {
              const pct = fp.slotsPlanned > 0
                ? Math.round((fp.slotsDone / fp.slotsPlanned) * 100)
                : 0;
              return (
                <div key={fp.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {fp.title}
                    </h3>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {pct}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fp.slotsDone} / {fp.slotsPlanned} créneaux réalisés
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct < 30 ? "#ef4444" : pct < 70 ? "#eab308" : "#22c55e",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Graphique distribution apprenants */}
      {data.progressDistribution.some((b) => b.count > 0) && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Distribution de la progression (apprenants)
          </h2>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <BarChart buckets={data.progressDistribution} />
          </div>
        </section>
      )}

      {/* Contenus récents */}
      {data.recentContents.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Contenus générés récemment
          </h2>
          <div className="space-y-2">
            {data.recentContents.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {CONTENT_TYPE_LABELS[c.content_type] ?? c.content_type}
                    {" — "}
                    {c.formation_title}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(c.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Aucune donnée */}
      {data.activeFormations === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-30" />
          <p>Aucune formation pour ce centre. Commence par en créer une !</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte statistique
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: color + "20", color }}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Graphique barres (div)
// ─────────────────────────────────────────────────────────────────────────────

function BarChart({ buckets }: { buckets: LearnerProgressBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="flex items-end gap-3" style={{ height: 160 }}>
      {buckets.map((b) => {
        const heightPct = max > 0 ? (b.count / max) * 100 : 0;
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium text-foreground">{b.count}</span>
            <div
              className="w-full rounded-t-md transition-all duration-500"
              style={{
                height: `${Math.max(heightPct, 4)}%`,
                backgroundColor: b.color,
                minHeight: 4,
              }}
            />
            <span className="text-xs text-muted-foreground">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    // Parse YYYY-MM-DD comme date locale pour éviter le décalage UTC
    // (sinon, en fuseau ouest comme la Guyane UTC-3, le 8 devient le 7).
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    const d = m
      ? new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0)
      : new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

/** Renvoie la date du jour au format YYYY-MM-DD selon le fuseau LOCAL
 * (toISOString utilise UTC et décale d'un jour en Guyane / autres fuseaux ouest). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
