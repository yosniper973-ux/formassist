import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap,
  Users,
  Target,
  BookOpen,
  FileText,
  RefreshCw,
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

  const loadData = useCallback(async () => {
    if (!activeCentreId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formations = (await db.getFormations(activeCentreId)) as unknown as Formation[];

      // Nombre de formations actives
      const activeFormations = formations.length;

      // Total apprenants (via groups)
      const learnerRows = await db.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM learners l
         JOIN groups g ON l.group_id = g.id
         JOIN formations f ON g.formation_id = f.id
         WHERE f.centre_id = ? AND f.archived_at IS NULL
           AND g.archived_at IS NULL AND l.archived_at IS NULL`,
        [activeCentreId],
      );
      const totalLearners = learnerRows[0]?.total ?? 0;

      // Couverture compétences (% de compétences ayant au moins un slot lié)
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

      // Progression par formation (slots passés vs total)
      const today = new Date().toISOString().split("T")[0]!;
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

      // Contenus récents (les 8 derniers)
      const recentContents = await db.query<RecentContent>(
        `SELECT gc.id, gc.title, gc.content_type, f.title as formation_title, gc.created_at
         FROM generated_contents gc
         JOIN formations f ON gc.formation_id = f.id
         WHERE f.centre_id = ? AND gc.archived_at IS NULL AND f.archived_at IS NULL
         ORDER BY gc.created_at DESC
         LIMIT 8`,
        [activeCentreId],
      );

      // Distribution de la progression des apprenants (par tranches)
      // On calcule le % de slots passés par formation, puis on groupe les apprenants
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
    loadData();
  }, [loadData]);

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

  // ─── Pas de centre sélectionné ───
  if (!activeCentreId) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <GraduationCap className="h-10 w-10 opacity-30" />
        <p>Sélectionne un centre pour voir le tableau de bord pédagogique.</p>
      </div>
    );
  }

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
                <div
                  key={fp.id}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                >
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
                  {/* Barre de progression */}
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
            <span className="text-xs font-medium text-foreground">
              {b.count}
            </span>
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
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}
