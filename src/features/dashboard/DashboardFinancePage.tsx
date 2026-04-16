import { useState, useEffect, useCallback } from "react";
import {
  Euro,
  Clock,
  Cpu,
  TrendingUp,
  FileText,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceStatusBreakdown {
  draft: number;
  sent: number;
  paid: number;
}

interface ModelUsage {
  model: string;
  cost: number;
  calls: number;
}

interface DashboardData {
  monthlyRevenue: number;
  pendingAmount: number;
  apiCostThisMonth: number;
  invoiceBreakdown: InvoiceStatusBreakdown;
  modelUsage: ModelUsage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatEuros(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " \u20AC";
}

function getMonthStart(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01 00:00:00`;
}

function getCurrentMonthLabel(): string {
  return new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardFinancePage() {
  const activeCentreId = useAppStore((s) => s.activeCentreId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    monthlyRevenue: 0,
    pendingAmount: 0,
    apiCostThisMonth: 0,
    invoiceBreakdown: { draft: 0, sent: 0, paid: 0 },
    modelUsage: [],
  });

  const monthStart = getMonthStart();
  const monthLabel = getCurrentMonthLabel();

  const loadData = useCallback(async () => {
    if (!activeCentreId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Revenus du mois (factures payées ce mois-ci)
      const revenueRows = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(total_ttc), 0) as total
         FROM invoices
         WHERE centre_id = ? AND status = 'paid' AND paid_date >= ?
           AND archived_at IS NULL`,
        [activeCentreId, monthStart.split(" ")[0]],
      );
      const monthlyRevenue = revenueRows[0]?.total ?? 0;

      // Montant en attente (factures draft + sent)
      const pendingRows = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(total_ttc), 0) as total
         FROM invoices
         WHERE centre_id = ? AND status IN ('draft', 'sent', 'overdue')
           AND archived_at IS NULL`,
        [activeCentreId],
      );
      const pendingAmount = pendingRows[0]?.total ?? 0;

      // Cout API ce mois
      const apiCostThisMonth = await db.getMonthlyApiCost(monthStart);

      // Breakdown statuts factures
      const breakdownRows = await db.query<{ status: string; cnt: number }>(
        `SELECT status, COUNT(*) as cnt
         FROM invoices
         WHERE centre_id = ? AND archived_at IS NULL
         GROUP BY status`,
        [activeCentreId],
      );
      const invoiceBreakdown: InvoiceStatusBreakdown = { draft: 0, sent: 0, paid: 0 };
      for (const row of breakdownRows) {
        if (row.status === "draft") invoiceBreakdown.draft = row.cnt;
        else if (row.status === "sent" || row.status === "overdue") invoiceBreakdown.sent += row.cnt;
        else if (row.status === "paid") invoiceBreakdown.paid = row.cnt;
      }

      // Usage API par modele ce mois
      const modelRows = await db.query<{ model: string; total_cost: number; call_count: number }>(
        `SELECT model, SUM(cost_euros) as total_cost, COUNT(*) as call_count
         FROM api_usage_log
         WHERE created_at >= ?
         GROUP BY model
         ORDER BY total_cost DESC`,
        [monthStart],
      );
      const modelUsage: ModelUsage[] = modelRows.map((r) => ({
        model: r.model,
        cost: r.total_cost,
        calls: r.call_count,
      }));

      setData({
        monthlyRevenue,
        pendingAmount,
        apiCostThisMonth,
        invoiceBreakdown,
        modelUsage,
      });
    } catch (err) {
      console.error("Erreur chargement dashboard finance :", err);
      setError("Impossible de charger les donnees financieres.");
    } finally {
      setLoading(false);
    }
  }, [activeCentreId, monthStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Pas de centre sélectionné ───
  if (!activeCentreId) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Euro className="h-10 w-10 opacity-30" />
        <p>Selectionne un centre pour voir le tableau de bord financier.</p>
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

  const netMargin = data.monthlyRevenue - data.apiCostThisMonth;

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tableau de bord financier</h1>
          <p className="text-sm text-muted-foreground">
            Suivi des revenus et couts API — {monthLabel}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Cartes statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Euro className="h-5 w-5" />}
          label="Revenus du mois"
          value={formatEuros(data.monthlyRevenue)}
          color="#22c55e"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="En attente"
          value={formatEuros(data.pendingAmount)}
          color="#f97316"
        />
        <StatCard
          icon={<Cpu className="h-5 w-5" />}
          label="Cout API du mois"
          value={formatEuros(data.apiCostThisMonth)}
          color="#ef4444"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Marge nette"
          value={formatEuros(netMargin)}
          color={netMargin >= 0 ? "#22c55e" : "#ef4444"}
        />
      </div>

      {/* Revenus vs Cout API */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Revenus vs Cout API
        </h2>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <ComparisonBars
            revenue={data.monthlyRevenue}
            apiCost={data.apiCostThisMonth}
          />
        </div>
      </section>

      {/* Breakdown factures */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Statuts des factures
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <InvoiceStatusCard
            label="Brouillons"
            count={data.invoiceBreakdown.draft}
            color="#94a3b8"
          />
          <InvoiceStatusCard
            label="Envoyees / En attente"
            count={data.invoiceBreakdown.sent}
            color="#f97316"
          />
          <InvoiceStatusCard
            label="Payees"
            count={data.invoiceBreakdown.paid}
            color="#22c55e"
          />
        </div>
      </section>

      {/* Usage API par modele */}
      {data.modelUsage.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Usage API par modele — {monthLabel}
          </h2>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <ModelUsageChart models={data.modelUsage} />
          </div>
        </section>
      )}

      {/* Alerte si cout API > revenus */}
      {data.monthlyRevenue > 0 && data.apiCostThisMonth > data.monthlyRevenue * 0.3 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Le cout API represente {Math.round((data.apiCostThisMonth / data.monthlyRevenue) * 100)}%
            de tes revenus ce mois-ci. Pense a ajuster tes modeles dans les parametres.
          </AlertDescription>
        </Alert>
      )}

      {/* Aucune facture */}
      {data.invoiceBreakdown.draft === 0 &&
        data.invoiceBreakdown.sent === 0 &&
        data.invoiceBreakdown.paid === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p>Aucune facture pour ce centre. Les donnees apparaitront ici.</p>
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
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Barres comparaison revenus vs API
// ─────────────────────────────────────────────────────────────────────────────

function ComparisonBars({
  revenue,
  apiCost,
}: {
  revenue: number;
  apiCost: number;
}) {
  const max = Math.max(revenue, apiCost, 1);

  return (
    <div className="space-y-3">
      {/* Revenus */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Revenus</span>
          <span className="text-muted-foreground">{formatEuros(revenue)}</span>
        </div>
        <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
          <div
            className="h-full rounded-md transition-all duration-500"
            style={{
              width: `${(revenue / max) * 100}%`,
              backgroundColor: "#22c55e",
              minWidth: revenue > 0 ? 8 : 0,
            }}
          />
        </div>
      </div>

      {/* Cout API */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Cout API</span>
          <span className="text-muted-foreground">{formatEuros(apiCost)}</span>
        </div>
        <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
          <div
            className="h-full rounded-md transition-all duration-500"
            style={{
              width: `${(apiCost / max) * 100}%`,
              backgroundColor: "#ef4444",
              minWidth: apiCost > 0 ? 8 : 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte statut facture
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceStatusCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{count}</p>
        </div>
        <Badge
          variant="secondary"
          className="text-xs"
        >
          {count === 0 ? "—" : count === 1 ? "1 facture" : `${count} factures`}
        </Badge>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Graphique usage par modele
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-20250514": "#8b5cf6",
  "claude-sonnet-4-20250514": "#6366f1",
  "claude-haiku-3-5-20241022": "#06b6d4",
};

const MODEL_SHORT_NAMES: Record<string, string> = {
  "claude-opus-4-20250514": "Opus 4",
  "claude-sonnet-4-20250514": "Sonnet 4",
  "claude-haiku-3-5-20241022": "Haiku 3.5",
};

function ModelUsageChart({ models }: { models: ModelUsage[] }) {
  const maxCost = Math.max(...models.map((m) => m.cost), 0.01);

  return (
    <div className="space-y-3">
      {models.map((m) => {
        const color = MODEL_COLORS[m.model] ?? "#94a3b8";
        const shortName = MODEL_SHORT_NAMES[m.model] ?? m.model;
        const widthPct = (m.cost / maxCost) * 100;

        return (
          <div key={m.model} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{shortName}</span>
              <span className="text-muted-foreground">
                {formatEuros(m.cost)} — {m.calls} appel{m.calls > 1 ? "s" : ""}
              </span>
            </div>
            <div className="h-5 w-full overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md transition-all duration-500"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: color,
                  minWidth: m.cost > 0 ? 8 : 0,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
