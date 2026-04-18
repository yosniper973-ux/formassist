import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FileText,
  Send,
  CheckCircle2,
  ArrowLeft,
  Trash2,
  Clock,
  Building2,
  Search,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Centre, Formation, Slot, Invoice, InvoiceLine, InvoiceAdjustment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatEuros(amount: number): string {
  return amount
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " \u20AC";
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "sent":
      return "Envoy\u00E9e";
    case "paid":
      return "Pay\u00E9e";
    default:
      return status;
  }
}

function statusVariant(status: string): "secondary" | "default" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "sent":
      return "outline";
    default:
      return "secondary";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "sent":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types locaux
// ─────────────────────────────────────────────────────────────────────────────

type View = "list" | "create" | "detail";

interface InvoiceWithCentre extends Invoice {
  centre_name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export function FacturationPage() {
  const activeCentreId = useAppStore((s) => s.activeCentreId);

  const [view, setView] = useState<View>("list");
  const [invoices, setInvoices] = useState<InvoiceWithCentre[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithCentre | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const centreFilter = activeCentreId || undefined;
      const statusFilter = filterStatus || undefined;
      const rows = await db.getInvoices(centreFilter, statusFilter);
      const allCentres = await db.getCentres(false);
      const centreMap = new Map(
        (allCentres as unknown as Centre[]).map((c) => [c.id, c.name]),
      );
      const enriched = (rows as unknown as Invoice[]).map((inv) => ({
        ...inv,
        centre_name: centreMap.get(inv.centre_id) ?? "Centre inconnu",
      }));
      setInvoices(enriched);
      setCentres(allCentres as unknown as Centre[]);
    } finally {
      setLoading(false);
    }
  }, [activeCentreId, filterStatus]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  function openDetail(inv: InvoiceWithCentre) {
    setSelectedInvoice(inv);
    setView("detail");
  }

  function backToList() {
    setSelectedInvoice(null);
    setView("list");
    loadInvoices();
  }

  if (view === "create") {
    return (
      <CreateInvoiceView
        centres={centres}
        defaultCentreId={activeCentreId}
        onBack={backToList}
        onCreated={backToList}
      />
    );
  }

  if (view === "detail" && selectedInvoice) {
    return (
      <InvoiceDetailView
        invoice={selectedInvoice}
        onBack={backToList}
        onUpdated={backToList}
      />
    );
  }

  // Filtrage par recherche
  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.centre_name ?? "").toLowerCase().includes(q)
    );
  });

  // Groupement par centre
  const grouped = new Map<string, InvoiceWithCentre[]>();
  for (const inv of filtered) {
    const key = inv.centre_name ?? "Autre";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(inv);
  }

  return (
    <div className="space-y-6">
      {/* En-t\u00EAte */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturation</h1>
          <p className="text-sm text-muted-foreground">
            {invoices.length} facture(s)
            {invoices.filter((i) => i.status === "draft").length > 0 &&
              ` \u00B7 ${invoices.filter((i) => i.status === "draft").length} brouillon(s)`}
          </p>
        </div>
        <Button onClick={() => setView("create")}>
          <Plus className="h-4 w-4" />
          Nouvelle facture
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une facture\u2026"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {(["", "draft", "sent", "paid"] as const).map((s) => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s)}
          >
            {s === "" ? "Toutes" : statusLabel(s)}
          </Button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasSearch={!!search || !!filterStatus}
          onCreate={() => setView("create")}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([centreName, invs]) => (
            <section key={centreName}>
              <div className="mb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{centreName}</p>
                <span className="text-xs text-muted-foreground">({invs.length})</span>
              </div>
              <div className="space-y-2">
                {invs.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} onClick={() => openDetail(inv)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ligne facture
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice,
  onClick,
}: {
  invoice: InvoiceWithCentre;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{invoice.invoice_number}</span>
          <Badge variant={statusVariant(invoice.status)} className={statusColor(invoice.status)}>
            {statusLabel(invoice.status)}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatDate(invoice.period_start)} \u2014 {formatDate(invoice.period_end)}
          {" \u00B7 "}
          {invoice.total_hours}h
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-foreground">{formatEuros(invoice.total_ttc)}</p>
        <p className="text-xs text-muted-foreground">TTC</p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// \u00C9tat vide
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  hasSearch,
  onCreate,
}: {
  hasSearch: boolean;
  onCreate: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Search className="h-10 w-10 opacity-30" />
        <p>Aucune facture ne correspond \u00E0 ta recherche.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground">Aucune facture</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cr\u00E9e ta premi\u00E8re facture pour commencer \u00E0 suivre tes paiements.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" />
        Cr\u00E9er ma premi\u00E8re facture
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cr\u00E9ation de facture
// ─────────────────────────────────────────────────────────────────────────────

function CreateInvoiceView({
  centres,
  defaultCentreId,
  onBack,
  onCreated,
}: {
  centres: Centre[];
  defaultCentreId: string | null;
  onBack: () => void;
  onCreated: () => void;
}) {
  const [centreId, setCentreId] = useState(defaultCentreId ?? "");
  const [formations, setFormations] = useState<Formation[]>([]);
  const [formationId, setFormationId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [tvaRate, setTvaRate] = useState(20);
  const [notes, setNotes] = useState("");
  const [adjustments, setAdjustments] = useState<InvoiceAdjustment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Charger les formations quand le centre change
  useEffect(() => {
    if (!centreId) {
      setFormations([]);
      setFormationId("");
      return;
    }
    (async () => {
      const rows = await db.getFormations(centreId);
      setFormations(rows as unknown as Formation[]);
      setFormationId("");

      // R\u00E9cup\u00E9rer le taux horaire du centre
      const centre = await db.getCentre(centreId);
      if (centre) {
        const c = centre as unknown as Centre;
        setHourlyRate(c.hourly_rate ?? 0);
      }
    })();
  }, [centreId]);

  // Charger les cr\u00E9neaux quand la formation et la p\u00E9riode changent
  useEffect(() => {
    if (!formationId || !periodStart || !periodEnd) {
      setSlots([]);
      setTotalHours(0);
      return;
    }
    (async () => {
      const rows = await db.getSlots(formationId, periodStart, periodEnd);
      const s = rows as unknown as Slot[];
      setSlots(s);
      const hours = s.reduce((sum, slot) => sum + slot.duration_hours, 0);
      setTotalHours(Math.round(hours * 100) / 100);
    })();
  }, [formationId, periodStart, periodEnd]);

  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);
  const totalHt = totalHours * hourlyRate + adjustmentTotal;
  const totalTva = totalHt * (tvaRate / 100);
  const totalTtc = totalHt + totalTva;

  function addAdjustment() {
    setAdjustments([...adjustments, { description: "", amount: 0, type: "fee" }]);
  }

  function updateAdjustment(index: number, field: keyof InvoiceAdjustment, value: string | number) {
    setAdjustments((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    );
  }

  function removeAdjustment(index: number) {
    setAdjustments((prev) => prev.filter((_, i) => i !== index));
  }

  async function generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await db.query<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM invoices WHERE invoice_number LIKE ?",
      [`FA-${year}-%`],
    );
    const count = (rows[0]?.cnt ?? 0) + 1;
    return `FA-${year}-${String(count).padStart(4, "0")}`;
  }

  async function handleSubmit() {
    setError("");
    if (!centreId) {
      setError("S\u00E9lectionne un centre.");
      return;
    }
    if (!formationId) {
      setError("S\u00E9lectionne une formation.");
      return;
    }
    if (!periodStart || !periodEnd) {
      setError("Renseigne la p\u00E9riode de facturation.");
      return;
    }
    if (totalHours <= 0) {
      setError("Aucune heure trouv\u00E9e sur cette p\u00E9riode.");
      return;
    }

    setSaving(true);
    try {
      const invoiceNumber = await generateInvoiceNumber();
      const centre = await db.getCentre(centreId);
      const c = centre as unknown as Centre;
      const paymentDelay = c?.payment_delay_days ?? 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentDelay);

      const invoiceId = await db.createInvoice({
        centre_id: centreId,
        formation_id: formationId,
        invoice_number: invoiceNumber,
        period_start: periodStart,
        period_end: periodEnd,
        total_hours: totalHours,
        hourly_rate: hourlyRate,
        total_ht: Math.round(totalHt * 100) / 100,
        tva_rate: tvaRate,
        total_ttc: Math.round(totalTtc * 100) / 100,
        status: "draft",
        due_date: dueDate.toISOString().substring(0, 10),
        adjustments: adjustments.length > 0 ? JSON.stringify(adjustments) : null,
        notes: notes || null,
      });

      // Cr\u00E9er les lignes de facture
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        await db.execute(
          `INSERT INTO invoice_lines (id, invoice_id, slot_id, description, hours, rate, amount_ht, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            db.generateId(),
            invoiceId,
            slot.id,
            slot.title ?? `Cr\u00E9neau du ${formatDate(slot.date)}`,
            slot.duration_hours,
            hourlyRate,
            Math.round(slot.duration_hours * hourlyRate * 100) / 100,
            i,
          ],
        );
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la cr\u00E9ation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* En-t\u00EAte */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nouvelle facture</h1>
          <p className="text-sm text-muted-foreground">
            S\u00E9lectionne le centre, la formation et la p\u00E9riode \u00E0 facturer.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Colonne gauche : formulaire */}
        <div className="space-y-5 rounded-xl border bg-card p-5">
          {/* Centre */}
          <div className="space-y-2">
            <Label htmlFor="centre">Centre</Label>
            <select
              id="centre"
              value={centreId}
              onChange={(e) => setCentreId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">-- Choisis un centre --</option>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Formation */}
          <div className="space-y-2">
            <Label htmlFor="formation">Formation</Label>
            <select
              id="formation"
              value={formationId}
              onChange={(e) => setFormationId(e.target.value)}
              disabled={!centreId}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">-- Choisis une formation --</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>

          {/* P\u00E9riode */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-start">D\u00E9but de p\u00E9riode</Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-end">Fin de p\u00E9riode</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Taux */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourly-rate">Taux horaire (\u20AC/h)</Label>
              <Input
                id="hourly-rate"
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tva-rate">TVA (%)</Label>
              <Input
                id="tva-rate"
                type="number"
                step="0.1"
                min="0"
                value={tvaRate}
                onChange={(e) => setTvaRate(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Remarques, r\u00E9f\u00E9rences, bon de commande\u2026"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {/* Ajustements */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Ajustements</Label>
              <Button variant="ghost" size="sm" onClick={addAdjustment}>
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
            {adjustments.map((adj, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Description"
                    value={adj.description}
                    onChange={(e) => updateAdjustment(i, "description", e.target.value)}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <select
                    value={adj.type}
                    onChange={(e) => updateAdjustment(i, "type", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  >
                    <option value="fee">Frais</option>
                    <option value="discount">Remise</option>
                    <option value="cancellation">Annulation</option>
                  </select>
                </div>
                <div className="w-28 space-y-1">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Montant"
                    value={adj.amount}
                    onChange={(e) => updateAdjustment(i, "amount", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeAdjustment(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne droite : r\u00E9capitulatif */}
        <div className="space-y-5">
          {/* Cr\u00E9neaux trouv\u00E9s */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 font-semibold text-foreground">
              Cr\u00E9neaux trouv\u00E9s
            </h3>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {formationId && periodStart && periodEnd
                  ? "Aucun cr\u00E9neau sur cette p\u00E9riode."
                  : "S\u00E9lectionne une formation et une p\u00E9riode pour voir les cr\u00E9neaux."}
              </p>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formatDate(slot.date)}</span>
                      {slot.start_time && slot.end_time && (
                        <span className="text-muted-foreground">
                          {slot.start_time} - {slot.end_time}
                        </span>
                      )}
                    </div>
                    <span className="font-medium">{slot.duration_hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* R\u00E9capitulatif financier */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 font-semibold text-foreground">R\u00E9capitulatif</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heures</span>
                <span>{totalHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taux horaire</span>
                <span>{formatEuros(hourlyRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sous-total</span>
                <span>{formatEuros(totalHours * hourlyRate)}</span>
              </div>
              {adjustments.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ajustements</span>
                  <span>{formatEuros(adjustmentTotal)}</span>
                </div>
              )}
              <div className="my-2 h-px bg-border" />
              <div className="flex justify-between font-medium">
                <span>Total HT</span>
                <span>{formatEuros(totalHt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TVA ({tvaRate}%)</span>
                <span>{formatEuros(totalTva)}</span>
              </div>
              <div className="my-2 h-px bg-border" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total TTC</span>
                <span>{formatEuros(totalTtc)}</span>
              </div>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={saving} className="w-full">
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {saving ? "Cr\u00E9ation en cours\u2026" : "Cr\u00E9er le brouillon"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// D\u00E9tail facture
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceDetailView({
  invoice,
  onBack,
  onUpdated,
}: {
  invoice: InvoiceWithCentre;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [updating, setUpdating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await db.query<InvoiceLine>(
        "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order",
        [invoice.id],
      );
      setLines(rows);
    })();
  }, [invoice.id]);

  const parsedAdjustments: InvoiceAdjustment[] = (() => {
    if (!invoice.adjustments) return [];
    if (typeof invoice.adjustments === "string") {
      try {
        return JSON.parse(invoice.adjustments) as InvoiceAdjustment[];
      } catch {
        return [];
      }
    }
    return invoice.adjustments;
  })();

  async function updateStatus(newStatus: "sent" | "paid") {
    setUpdating(true);
    try {
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      if (newStatus === "sent") {
        await db.execute(
          "UPDATE invoices SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?",
          [newStatus, now, now, invoice.id],
        );
      } else {
        await db.execute(
          "UPDATE invoices SET status = ?, paid_date = ?, updated_at = ? WHERE id = ?",
          [newStatus, now.substring(0, 10), now, invoice.id],
        );
      }
      onUpdated();
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* En-t\u00EAte */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {invoice.invoice_number}
              </h1>
              <Badge
                variant={statusVariant(invoice.status)}
                className={statusColor(invoice.status)}
              >
                {statusLabel(invoice.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {invoice.centre_name}
            </p>
          </div>
        </div>

        {/* Actions de statut */}
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button onClick={() => updateStatus("sent")} disabled={updating}>
              <Send className="h-4 w-4" />
              Marquer envoy\u00E9e
            </Button>
          )}
          {invoice.status === "sent" && (
            <Button onClick={() => updateStatus("paid")} disabled={updating}>
              <CheckCircle2 className="h-4 w-4" />
              Marquer pay\u00E9e
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            disabled={updating}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Supprimer la facture ${invoice.invoice_number} ?`}
        message={"Cette action supprime d\u00E9finitivement la facture et toutes ses lignes.\n\nCette action est irr\u00E9versible."}
        confirmLabel="Supprimer d\u00E9finitivement"
        onConfirm={async () => {
          await db.deleteInvoice(invoice.id);
          setConfirmDelete(false);
          onUpdated();
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Infos g\u00E9n\u00E9rales */}
        <div className="rounded-xl border bg-card p-5 lg:col-span-1">
          <h3 className="mb-3 font-semibold text-foreground">Informations</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">P\u00E9riode</dt>
              <dd className="font-medium">
                {formatDate(invoice.period_start)} \u2014 {formatDate(invoice.period_end)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Heures factur\u00E9es</dt>
              <dd className="font-medium">{invoice.total_hours}h</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Taux horaire</dt>
              <dd className="font-medium">{formatEuros(invoice.hourly_rate)}</dd>
            </div>
            {invoice.due_date && (
              <div>
                <dt className="text-muted-foreground">\u00C9ch\u00E9ance</dt>
                <dd className="font-medium">{formatDate(invoice.due_date)}</dd>
              </div>
            )}
            {invoice.paid_date && (
              <div>
                <dt className="text-muted-foreground">Pay\u00E9e le</dt>
                <dd className="font-medium">{formatDate(invoice.paid_date)}</dd>
              </div>
            )}
            {invoice.sent_at && (
              <div>
                <dt className="text-muted-foreground">Envoy\u00E9e le</dt>
                <dd className="font-medium">{formatDate(invoice.sent_at)}</dd>
              </div>
            )}
            {invoice.notes && (
              <div>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">{invoice.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Lignes de facture */}
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h3 className="mb-3 font-semibold text-foreground">
            D\u00E9tail des lignes
          </h3>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune ligne.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Description</th>
                    <th className="pb-2 pr-4 text-right font-medium">Heures</th>
                    <th className="pb-2 pr-4 text-right font-medium">Taux</th>
                    <th className="pb-2 text-right font-medium">Montant HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-border/50">
                      <td className="py-2 pr-4">{line.description}</td>
                      <td className="py-2 pr-4 text-right">{line.hours}h</td>
                      <td className="py-2 pr-4 text-right">{formatEuros(line.rate)}</td>
                      <td className="py-2 text-right font-medium">
                        {formatEuros(line.amount_ht)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ajustements */}
          {parsedAdjustments.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ajustements
              </p>
              {parsedAdjustments.map((adj, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {adj.description || adj.type}
                  </span>
                  <span className={adj.amount < 0 ? "text-red-600" : ""}>
                    {formatEuros(adj.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Totaux */}
          <div className="mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total HT</span>
              <span className="font-medium">{formatEuros(invoice.total_ht)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA ({invoice.tva_rate}%)</span>
              <span>{formatEuros(invoice.total_ttc - invoice.total_ht)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total TTC</span>
              <span>{formatEuros(invoice.total_ttc)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
