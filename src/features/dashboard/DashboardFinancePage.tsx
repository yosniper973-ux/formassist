import { useState, useEffect, useCallback } from "react";
import {
  Euro,
  Clock,
  Cpu,
  TrendingUp,
  TrendingDown,
  FileText,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BarChart3,
  Download,
  Minus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { markdownToPdf, downloadPdf } from "@/lib/pdf-export";
import { DownloadToast } from "@/components/ui/download-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceBreakdown { draft: number; sent: number; paid: number; }
interface ModelUsage { model: string; cost: number; calls: number; }

interface MonthData {
  revenue: number;
  prevRevenue: number;
  pending: number;
  apiCost: number;
  prevApiCost: number;
  breakdown: InvoiceBreakdown;
  modelUsage: ModelUsage[];
}

interface MonthSummary { month: number; revenue: number; apiCost: number; }
interface YearSummary { year: number; revenue: number; apiCost: number; }

interface YearData {
  months: MonthSummary[];
  prevYearRevenue: number;
  prevYearApiCost: number;
  allYears: YearSummary[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS_FR = [
  "Jan","Fév","Mar","Avr","Mai","Juin",
  "Juil","Août","Sep","Oct","Nov","Déc",
];
const MONTHS_FULL = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-20250514": "#8b5cf6",
  "claude-sonnet-4-20250514": "#6366f1",
  "claude-haiku-3-5-20241022": "#06b6d4",
};
const MODEL_NAMES: Record<string, string> = {
  "claude-opus-4-20250514": "Opus 4",
  "claude-sonnet-4-20250514": "Sonnet 4",
  "claude-haiku-3-5-20241022": "Haiku 3.5",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function euros(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

function ymStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  let m = month + delta;
  let y = year;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  return { year: y, month: m };
}

function trendPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function DashboardFinancePage() {
  const activeCentreId = useAppStore((s) => s.activeCentreId);
  const now = new Date();

  const [view, setView] = useState<"month" | "year">("month");
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [yearData, setYearData] = useState<YearData | null>(null);
  const [dlToast, setDlToast] = useState<{ path: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const isCurrentOrFutureMonth =
    selYear > now.getFullYear() ||
    (selYear === now.getFullYear() && selMonth >= now.getMonth() + 1);
  const isCurrentOrFutureYear = selYear >= now.getFullYear();

  // ─── Chargement mois ────────────────────────────────────────────────────────

  const loadMonth = useCallback(async () => {
    if (!activeCentreId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const cur = ymStr(selYear, selMonth);
      const p = shiftMonth(selYear, selMonth, -1);
      const prv = ymStr(p.year, p.month);

      const [revR, prevRevR, pendR, apiR, prevApiR, bkR, modR] = await Promise.all([
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(total_ttc),0) as total FROM invoices
           WHERE centre_id=? AND status='paid' AND strftime('%Y-%m',paid_date)=? AND archived_at IS NULL`,
          [activeCentreId, cur]),
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(total_ttc),0) as total FROM invoices
           WHERE centre_id=? AND status='paid' AND strftime('%Y-%m',paid_date)=? AND archived_at IS NULL`,
          [activeCentreId, prv]),
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(total_ttc),0) as total FROM invoices
           WHERE centre_id=? AND status IN ('draft','sent','overdue') AND archived_at IS NULL`,
          [activeCentreId]),
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(cost_euros),0) as total FROM api_usage_log
           WHERE strftime('%Y-%m',created_at)=?`, [cur]),
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(cost_euros),0) as total FROM api_usage_log
           WHERE strftime('%Y-%m',created_at)=?`, [prv]),
        db.query<{ status: string; cnt: number }>(
          `SELECT status, COUNT(*) as cnt FROM invoices
           WHERE centre_id=? AND archived_at IS NULL GROUP BY status`,
          [activeCentreId]),
        db.query<{ model: string; total_cost: number; call_count: number }>(
          `SELECT model, SUM(cost_euros) as total_cost, COUNT(*) as call_count
           FROM api_usage_log WHERE strftime('%Y-%m',created_at)=?
           GROUP BY model ORDER BY total_cost DESC`, [cur]),
      ]);

      const breakdown: InvoiceBreakdown = { draft: 0, sent: 0, paid: 0 };
      for (const r of bkR) {
        if (r.status === "draft") breakdown.draft = r.cnt;
        else if (r.status === "sent" || r.status === "overdue") breakdown.sent += r.cnt;
        else if (r.status === "paid") breakdown.paid = r.cnt;
      }

      setMonthData({
        revenue: revR[0]?.total ?? 0,
        prevRevenue: prevRevR[0]?.total ?? 0,
        pending: pendR[0]?.total ?? 0,
        apiCost: apiR[0]?.total ?? 0,
        prevApiCost: prevApiR[0]?.total ?? 0,
        breakdown,
        modelUsage: modR.map(r => ({ model: r.model, cost: r.total_cost, calls: r.call_count })),
      });
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les données financières.");
    } finally {
      setLoading(false);
    }
  }, [activeCentreId, selYear, selMonth]);

  // ─── Chargement année ───────────────────────────────────────────────────────

  const loadYear = useCallback(async () => {
    if (!activeCentreId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const yr = String(selYear);
      const prevYr = String(selYear - 1);

      const [revM, apiM, prevRev, prevApi, allRev, allApi] = await Promise.all([
        db.query<{ month: string; total: number }>(
          `SELECT strftime('%m',paid_date) as month, COALESCE(SUM(total_ttc),0) as total
           FROM invoices WHERE centre_id=? AND status='paid'
           AND strftime('%Y',paid_date)=? AND archived_at IS NULL
           GROUP BY strftime('%m',paid_date)`,
          [activeCentreId, yr]),
        db.query<{ month: string; total: number }>(
          `SELECT strftime('%m',created_at) as month, COALESCE(SUM(cost_euros),0) as total
           FROM api_usage_log WHERE strftime('%Y',created_at)=?
           GROUP BY strftime('%m',created_at)`, [yr]),
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(total_ttc),0) as total FROM invoices
           WHERE centre_id=? AND status='paid' AND strftime('%Y',paid_date)=? AND archived_at IS NULL`,
          [activeCentreId, prevYr]),
        db.query<{ total: number }>(
          `SELECT COALESCE(SUM(cost_euros),0) as total FROM api_usage_log
           WHERE strftime('%Y',created_at)=?`, [prevYr]),
        db.query<{ year: string; total: number }>(
          `SELECT strftime('%Y',paid_date) as year, COALESCE(SUM(total_ttc),0) as total
           FROM invoices WHERE centre_id=? AND status='paid' AND archived_at IS NULL
           GROUP BY strftime('%Y',paid_date) ORDER BY year DESC`,
          [activeCentreId]),
        db.query<{ year: string; total: number }>(
          `SELECT strftime('%Y',created_at) as year, COALESCE(SUM(cost_euros),0) as total
           FROM api_usage_log GROUP BY strftime('%Y',created_at) ORDER BY year DESC`, []),
      ]);

      const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, "0");
        return {
          month: i + 1,
          revenue: revM.find(r => r.month === m)?.total ?? 0,
          apiCost: apiM.find(r => r.month === m)?.total ?? 0,
        };
      });

      const yearsSet = new Set<number>([
        ...allRev.map(r => parseInt(r.year)),
        ...allApi.map(r => parseInt(r.year)),
      ]);
      const allYears: YearSummary[] = Array.from(yearsSet)
        .sort((a, b) => b - a)
        .map(year => ({
          year,
          revenue: allRev.find(r => r.year === String(year))?.total ?? 0,
          apiCost: allApi.find(r => r.year === String(year))?.total ?? 0,
        }));

      setYearData({
        months,
        prevYearRevenue: prevRev[0]?.total ?? 0,
        prevYearApiCost: prevApi[0]?.total ?? 0,
        allYears,
      });
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les données annuelles.");
    } finally {
      setLoading(false);
    }
  }, [activeCentreId, selYear]);

  useEffect(() => {
    if (view === "month") loadMonth(); else loadYear();
  }, [view, loadMonth, loadYear]);

  // ─── Export PDF annuel ───────────────────────────────────────────────────────

  async function handleExportPdf() {
    if (!yearData) return;
    setExporting(true);
    try {
      const totalRev = yearData.months.reduce((s, m) => s + m.revenue, 0);
      const totalApi = yearData.months.reduce((s, m) => s + m.apiCost, 0);

      let md = `# Bilan financier ${selYear}\n\n`;
      md += `## Récapitulatif mensuel\n\n`;
      md += `| Mois | Recettes | Coût API | Marge nette |\n`;
      md += `|------|:--------:|:--------:|:-----------:|\n`;
      yearData.months.forEach(m => {
        md += `| ${MONTHS_FULL[m.month - 1]} | ${euros(m.revenue)} | ${euros(m.apiCost)} | ${euros(m.revenue - m.apiCost)} |\n`;
      });
      md += `| **TOTAL** | **${euros(totalRev)}** | **${euros(totalApi)}** | **${euros(totalRev - totalApi)}** |\n\n`;

      if (yearData.allYears.length > 1) {
        md += `## Historique multi-années\n\n`;
        md += `| Année | Recettes | Coût API | Marge nette |\n`;
        md += `|:-----:|:--------:|:--------:|:-----------:|\n`;
        yearData.allYears.forEach(y => {
          md += `| ${y.year} | ${euros(y.revenue)} | ${euros(y.apiCost)} | ${euros(y.revenue - y.apiCost)} |\n`;
        });
      }

      const blob = await markdownToPdf(md);
      const savedPath = await downloadPdf(blob, `Bilan_financier_${selYear}`);
      if (savedPath) {
        setDlToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  // ─── Pas de centre ───────────────────────────────────────────────────────────

  if (!activeCentreId) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Euro className="h-10 w-10 opacity-30" />
        <p>Sélectionne un centre pour voir le tableau de bord financier.</p>
      </div>
    );
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tableau de bord financier</h1>
          <p className="text-sm text-muted-foreground">
            Suivi des recettes et coûts sur le long terme
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle mois/année */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${view === "month" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
              onClick={() => setView("month")}
            >
              <Calendar className="h-3.5 w-3.5" /> Mois
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${view === "year" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
              onClick={() => setView("year")}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Année
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={view === "month" ? loadMonth : loadYear}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : view === "month" ? (
        <MonthView
          year={selYear} month={selMonth} data={monthData}
          onPrev={() => { const p = shiftMonth(selYear, selMonth, -1); setSelYear(p.year); setSelMonth(p.month); }}
          onNext={() => { if (!isCurrentOrFutureMonth) { const n = shiftMonth(selYear, selMonth, 1); setSelYear(n.year); setSelMonth(n.month); } }}
          canNext={!isCurrentOrFutureMonth}
        />
      ) : (
        <YearView
          year={selYear} data={yearData}
          onPrev={() => setSelYear(y => y - 1)}
          onNext={() => { if (!isCurrentOrFutureYear) setSelYear(y => y + 1); }}
          canNext={!isCurrentOrFutureYear}
          onExport={handleExportPdf}
          exporting={exporting}
        />
      )}

      {dlToast && (
        <DownloadToast path={dlToast.path} name={dlToast.name} onClose={() => setDlToast(null)} />
      )}
    </div>
  );
}

// ─── Vue mensuelle ────────────────────────────────────────────────────────────

function MonthView({
  year, month, data, onPrev, onNext, canNext,
}: {
  year: number; month: number; data: MonthData | null;
  onPrev: () => void; onNext: () => void; canNext: boolean;
}) {
  if (!data) return null;
  const net = data.revenue - data.apiCost;
  const prevNet = data.prevRevenue - data.prevApiCost;

  return (
    <div className="space-y-6">
      {/* Navigateur mois */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={onPrev} className="rounded-lg border border-border p-1.5 hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-lg font-semibold text-foreground min-w-[160px] text-center capitalize">
          {MONTHS_FULL[month - 1]} {year}
        </span>
        <button
          onClick={onNext}
          disabled={!canNext}
          className="rounded-lg border border-border p-1.5 hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 4 cartes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Euro className="h-5 w-5" />}
          label="Recettes"
          value={euros(data.revenue)}
          color="#22c55e"
          trend={trendPct(data.revenue, data.prevRevenue)}
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="En attente"
          value={euros(data.pending)}
          color="#f97316"
          trend={null}
        />
        <StatCard
          icon={<Cpu className="h-5 w-5" />}
          label="Coût API"
          value={euros(data.apiCost)}
          color="#ef4444"
          trend={trendPct(data.apiCost, data.prevApiCost)}
          invertTrend
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Marge nette"
          value={euros(net)}
          color={net >= 0 ? "#22c55e" : "#ef4444"}
          trend={trendPct(net, prevNet)}
        />
      </div>

      {/* Barres recettes vs API */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">Recettes vs Coût API</h2>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <CompBar label="Recettes" value={data.revenue} max={Math.max(data.revenue, data.apiCost, 1)} color="#22c55e" />
          <div className="mt-3">
            <CompBar label="Coût API" value={data.apiCost} max={Math.max(data.revenue, data.apiCost, 1)} color="#ef4444" />
          </div>
        </div>
      </section>

      {/* Statuts factures */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">Statuts des factures</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <InvoiceCard label="Brouillons" count={data.breakdown.draft} color="#94a3b8" />
          <InvoiceCard label="Envoyées / En attente" count={data.breakdown.sent} color="#f97316" />
          <InvoiceCard label="Payées" count={data.breakdown.paid} color="#22c55e" />
        </div>
      </section>

      {/* Usage API par modèle */}
      {data.modelUsage.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Usage API par modèle</h2>
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            {data.modelUsage.map(m => {
              const color = MODEL_COLORS[m.model] ?? "#94a3b8";
              const name = MODEL_NAMES[m.model] ?? m.model;
              const max = Math.max(...data.modelUsage.map(x => x.cost), 0.01);
              return (
                <div key={m.model} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">{euros(m.cost)} — {m.calls} appel{m.calls > 1 ? "s" : ""}</span>
                  </div>
                  <div className="h-5 w-full overflow-hidden rounded-md bg-muted">
                    <div className="h-full rounded-md transition-all duration-500"
                      style={{ width: `${(m.cost / max) * 100}%`, backgroundColor: color, minWidth: m.cost > 0 ? 8 : 0 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Alerte coût API élevé */}
      {data.revenue > 0 && data.apiCost > data.revenue * 0.3 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Le coût API représente {Math.round((data.apiCost / data.revenue) * 100)}% des recettes ce mois-ci.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ─── Vue annuelle ─────────────────────────────────────────────────────────────

function YearView({
  year, data, onPrev, onNext, canNext, onExport, exporting,
}: {
  year: number; data: YearData | null;
  onPrev: () => void; onNext: () => void; canNext: boolean;
  onExport: () => void; exporting: boolean;
}) {
  if (!data) return null;
  const totalRev = data.months.reduce((s, m) => s + m.revenue, 0);
  const totalApi = data.months.reduce((s, m) => s + m.apiCost, 0);
  const totalNet = totalRev - totalApi;
  const prevNet = data.prevYearRevenue - data.prevYearApiCost;

  const chartData = data.months.map(m => ({
    name: MONTHS_FR[m.month - 1],
    Recettes: parseFloat(m.revenue.toFixed(2)),
    "Coût API": parseFloat(m.apiCost.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      {/* Navigateur année */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onPrev} className="rounded-lg border border-border p-1.5 hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-lg font-semibold text-foreground min-w-[80px] text-center">{year}</span>
          <button
            onClick={onNext} disabled={!canNext}
            className="rounded-lg border border-border p-1.5 hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
          <Download className="h-3.5 w-3.5 mr-1" />
          {exporting ? "Export..." : "Export PDF"}
        </Button>
      </div>

      {/* 3 cartes totaux annuels */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Euro className="h-5 w-5" />}
          label={`Recettes ${year}`}
          value={euros(totalRev)}
          color="#22c55e"
          trend={trendPct(totalRev, data.prevYearRevenue)}
          trendLabel={`vs ${year - 1}`}
        />
        <StatCard
          icon={<Cpu className="h-5 w-5" />}
          label={`Coût API ${year}`}
          value={euros(totalApi)}
          color="#ef4444"
          trend={trendPct(totalApi, data.prevYearApiCost)}
          trendLabel={`vs ${year - 1}`}
          invertTrend
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={`Marge nette ${year}`}
          value={euros(totalNet)}
          color={totalNet >= 0 ? "#22c55e" : "#ef4444"}
          trend={trendPct(totalNet, prevNet)}
          trendLabel={`vs ${year - 1}`}
        />
      </div>

      {/* Graphique 12 mois */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">Recettes vs Coût API — mois par mois</h2>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} €`} width={60} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} €`]} />
              <Legend />
              <Bar dataKey="Recettes" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Coût API" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Historique multi-années */}
      {data.allYears.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Historique multi-années</h2>
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Année</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-green-700">Recettes</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-red-600">Coût API</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Marge nette</th>
                </tr>
              </thead>
              <tbody>
                {data.allYears.map((y, i) => {
                  const net = y.revenue - y.apiCost;
                  return (
                    <tr key={y.year} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/30"} ${y.year === year ? "ring-1 ring-inset ring-primary/30 bg-primary/5" : ""}`}>
                      <td className="px-4 py-2.5 font-semibold text-foreground">
                        {y.year}
                        {y.year === year && (
                          <span className="ml-2 text-xs text-primary font-normal">en cours</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-700">{euros(y.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{euros(y.apiCost)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${net >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {euros(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {data.allYears.length > 1 && (
                <tfoot className="bg-muted border-t-2 border-border">
                  <tr>
                    <td className="px-4 py-2.5 font-bold">TOTAL</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-700">
                      {euros(data.allYears.reduce((s, y) => s + y.revenue, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">
                      {euros(data.allYears.reduce((s, y) => s + y.apiCost, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground">
                      {euros(data.allYears.reduce((s, y) => s + y.revenue - y.apiCost, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {data.allYears.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-30" />
          <p>Aucune donnée financière pour le moment.</p>
        </div>
      )}
    </div>
  );
}

// ─── Carte statistique avec tendance ─────────────────────────────────────────

function StatCard({
  icon, label, value, color, trend: trendVal, trendLabel, invertTrend,
}: {
  icon: React.ReactNode; label: string; value: string; color: string;
  trend?: number | null; trendLabel?: string; invertTrend?: boolean;
}) {
  const showTrend = trendVal !== null && trendVal !== undefined;
  const isPositive = invertTrend ? (trendVal ?? 0) <= 0 : (trendVal ?? 0) >= 0;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: color + "20", color }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {showTrend && (
            <div className={`flex items-center gap-1 mt-0.5 text-xs font-medium ${isPositive ? "text-green-600" : "text-red-500"}`}>
              {trendVal === 0 ? (
                <Minus className="h-3 w-3" />
              ) : isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{trendVal! > 0 ? "+" : ""}{trendVal}%</span>
              {trendLabel && <span className="text-muted-foreground font-normal">{trendLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Barre de comparaison ─────────────────────────────────────────────────────

function CompBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{euros(value)}</span>
      </div>
      <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
        <div className="h-full rounded-md transition-all duration-500"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color, minWidth: value > 0 ? 8 : 0 }} />
      </div>
    </div>
  );
}

// ─── Carte statut facture ─────────────────────────────────────────────────────

function InvoiceCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3">
      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{count}</p>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0">
        {count === 0 ? "—" : count === 1 ? "1 facture" : `${count} factures`}
      </Badge>
    </div>
  );
}
