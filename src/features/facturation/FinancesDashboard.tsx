import { useMemo } from "react";
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  Calendar,
  Wallet,
  Hourglass,
  FileEdit,
  PieChart,
} from "lucide-react";
import type { Centre, Invoice } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatEuros(amount: number): string {
  return (
    amount
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €"
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  const d = m
    ? new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0)
    : new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function parseLocalDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return new Date(dateStr);
  return new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, 15);
  return d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  invoices: (Invoice & { centre_name?: string })[];
  centres: Centre[];
  onOpenInvoice: (inv: Invoice & { centre_name?: string }) => void;
}

export function FinancesDashboard({ invoices, centres, onOpenInvoice }: Props) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const stats = useMemo(() => {
    const currentMonth = monthKey(today);

    // KPIs du mois en cours
    let paidThisMonth = 0;
    let pendingTotal = 0; // sent non payées (toutes périodes)
    let draftTotal = 0;
    let hoursThisMonth = 0;

    for (const inv of invoices) {
      const created = inv.created_at ? parseLocalDate(inv.created_at) : null;
      const isCurrentMonth = created && monthKey(created) === currentMonth;

      if (inv.status === "paid" && isCurrentMonth) {
        paidThisMonth += inv.total_ttc;
        hoursThisMonth += inv.total_hours;
      }
      if (inv.status === "sent") {
        pendingTotal += inv.total_ttc;
      }
      if (inv.status === "draft") {
        draftTotal += inv.total_ttc;
      }
    }

    // Factures en retard (sent + due_date dépassée)
    const overdue = invoices
      .filter((inv) => {
        if (inv.status !== "sent" || !inv.due_date) return false;
        return parseLocalDate(inv.due_date) < today;
      })
      .sort(
        (a, b) =>
          parseLocalDate(a.due_date!).getTime() - parseLocalDate(b.due_date!).getTime(),
      );

    // Prochaines échéances (7 jours, sent non échues)
    const sevenDaysAhead = new Date(today);
    sevenDaysAhead.setDate(today.getDate() + 7);
    const upcoming = invoices
      .filter((inv) => {
        if (inv.status !== "sent" || !inv.due_date) return false;
        const due = parseLocalDate(inv.due_date);
        return due >= today && due <= sevenDaysAhead;
      })
      .sort(
        (a, b) =>
          parseLocalDate(a.due_date!).getTime() - parseLocalDate(b.due_date!).getTime(),
      );

    // Répartition par centre (CA encaissé sur 12 derniers mois)
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(today.getMonth() - 12);
    const perCentre = new Map<
      string,
      { paid: number; pending: number; count: number; centre_name: string }
    >();
    for (const c of centres) {
      perCentre.set(c.id, { paid: 0, pending: 0, count: 0, centre_name: c.name });
    }
    for (const inv of invoices) {
      const entry = perCentre.get(inv.centre_id) ?? {
        paid: 0,
        pending: 0,
        count: 0,
        centre_name: inv.centre_name ?? "Centre inconnu",
      };
      const created = inv.created_at ? parseLocalDate(inv.created_at) : null;
      if (inv.status === "paid" && created && created >= twelveMonthsAgo) {
        entry.paid += inv.total_ttc;
      }
      if (inv.status === "sent") {
        entry.pending += inv.total_ttc;
      }
      entry.count += 1;
      perCentre.set(inv.centre_id, entry);
    }
    const centreRows = Array.from(perCentre.values())
      .filter((r) => r.count > 0)
      .sort((a, b) => b.paid + b.pending - (a.paid + a.pending));

    // Évolution 6 derniers mois (CA TTC payé par mois de paiement)
    const monthsBack: { key: string; label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 15);
      const key = monthKey(d);
      monthsBack.push({ key, label: monthLabel(key), amount: 0 });
    }
    const monthMap = new Map(monthsBack.map((m) => [m.key, m]));
    for (const inv of invoices) {
      if (inv.status !== "paid" || !inv.paid_date) continue;
      const key = monthKey(parseLocalDate(inv.paid_date));
      const slot = monthMap.get(key);
      if (slot) slot.amount += inv.total_ttc;
    }
    const maxMonth = Math.max(1, ...monthsBack.map((m) => m.amount));

    return {
      paidThisMonth,
      pendingTotal,
      draftTotal,
      hoursThisMonth,
      overdue,
      upcoming,
      centreRows,
      monthsBack,
      maxMonth,
    };
  }, [invoices, centres, today]);

  const monthLabelLong = today.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Bandeau d'alerte si retards */}
      {stats.overdue.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">
              {stats.overdue.length} facture(s) en retard
            </p>
            <p className="text-sm text-red-700">
              Total impayé : {formatEuros(stats.overdue.reduce((s, i) => s + i.total_ttc, 0))} ·
              à relancer rapidement.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {stats.overdue.slice(0, 5).map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => onOpenInvoice(inv)}
                    className="text-red-800 underline-offset-2 hover:underline"
                  >
                    {inv.invoice_number}
                  </button>{" "}
                  — {inv.centre_name} — échéance{" "}
                  {formatDate(inv.due_date)} ({formatEuros(inv.total_ttc)})
                </li>
              ))}
              {stats.overdue.length > 5 && (
                <li className="text-xs text-red-700">
                  + {stats.overdue.length - 5} autre(s)…
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* 4 cartes synthèse */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label={`Encaissé en ${monthLabelLong}`}
          value={formatEuros(stats.paidThisMonth)}
          tone="emerald"
        />
        <KpiCard
          icon={<Hourglass className="h-4 w-4" />}
          label="En attente de paiement"
          value={formatEuros(stats.pendingTotal)}
          tone="blue"
        />
        <KpiCard
          icon={<FileEdit className="h-4 w-4" />}
          label="Brouillons à finaliser"
          value={formatEuros(stats.draftTotal)}
          tone="gray"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label={`Heures facturées en ${monthLabelLong}`}
          value={`${stats.hoursThisMonth.toFixed(1)} h`}
          tone="violet"
        />
      </div>

      {/* Répartition par centre + Évolution */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Répartition par centre */}
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Répartition par centre</h3>
            <span className="text-xs text-muted-foreground">(12 derniers mois)</span>
          </div>
          {stats.centreRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune facture pour le moment.</p>
          ) : (
            <ul className="space-y-3">
              {stats.centreRows.map((row) => {
                const total =
                  stats.centreRows.reduce((s, r) => s + r.paid, 0) || 1;
                const pct = (row.paid / total) * 100;
                return (
                  <li key={row.centre_name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium text-foreground">
                        {row.centre_name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatEuros(row.paid)}
                        {row.pending > 0 && (
                          <span className="ml-2 text-blue-600">
                            +{formatEuros(row.pending)} en attente
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Évolution 6 mois */}
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Évolution 6 mois</h3>
            <span className="text-xs text-muted-foreground">(CA encaissé TTC)</span>
          </div>
          <div className="flex h-40 items-end gap-2">
            {stats.monthsBack.map((m) => {
              const h = (m.amount / stats.maxMonth) * 100;
              return (
                <div
                  key={m.key}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${m.label} : ${formatEuros(m.amount)}`}
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {m.amount > 0 ? formatEuros(m.amount) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-primary/80 transition-all"
                    style={{ height: `${Math.max(2, h)}%`, minHeight: "4px" }}
                  />
                  <span className="text-xs capitalize text-muted-foreground">
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Prochaines échéances */}
      {stats.upcoming.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              Prochaines échéances (7 jours)
            </h3>
            <span className="text-xs text-muted-foreground">
              ({stats.upcoming.length})
            </span>
          </div>
          <ul className="space-y-1.5">
            {stats.upcoming.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => onOpenInvoice(inv)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="text-muted-foreground">— {inv.centre_name}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      Échéance {formatDate(inv.due_date)}
                    </span>
                    <span className="font-medium">{formatEuros(inv.total_ttc)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────

const TONE_STYLES = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-600" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" },
  gray: { bg: "bg-muted", text: "text-foreground", icon: "text-muted-foreground" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", icon: "text-violet-600" },
} as const;

type Tone = keyof typeof TONE_STYLES;

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className={`rounded-xl border p-4 ${t.bg}`}>
      <div className={`mb-2 flex items-center gap-1.5 text-xs ${t.icon}`}>
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${t.text}`}>{value}</p>
    </div>
  );
}
