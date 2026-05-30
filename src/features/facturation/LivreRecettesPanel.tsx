import { useState, useEffect } from "react";
import { BookOpen, Download, Loader2, ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import type { LivreRecetteRow } from "@/lib/db";
import { exportLivreRecettesXlsx } from "@/lib/livre-recettes-xlsx";
import { getProfessionalInfo } from "@/lib/professional-info";
import { Button } from "@/components/ui/button";
import { DownloadToast } from "@/components/ui/download-toast";

function formatEuros(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function LivreRecettesPanel() {
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [entries, setEntries] = useState<LivreRecetteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ path: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    db.getLivreRecettesYears().then((ys) => {
      const allYears = ys.includes(currentYear) ? ys : [currentYear, ...ys];
      setYears(allYears);
    });
  }, [currentYear]);

  useEffect(() => {
    setLoading(true);
    db.getLivreRecettes(selectedYear).then((rows) => {
      setEntries(rows);
      setLoading(false);
    });
  }, [selectedYear]);

  const total = entries.reduce((s, e) => s + e.montant_ttc, 0);

  async function handleExport() {
    setExporting(true);
    try {
      const proInfo = await getProfessionalInfo();
      const path = await exportLivreRecettesXlsx(selectedYear, entries, proInfo);
      const name = `Livre_des_recettes_${selectedYear}.xlsx`;
      setToast({ path, name });
    } catch (err) {
      console.error("Erreur export livre des recettes :", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      {/* ─── En-tête cliquable ─── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Livre des recettes</span>
          {!open && entries.length > 0 && (
            <span className="ml-2 text-sm text-muted-foreground">
              {entries.length} encaissement(s) — {formatEuros(total)}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t px-5 pb-5 pt-4 space-y-4">
          {/* Sélecteur d'année + bouton export */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Année :</span>
            <div className="flex gap-1">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    y === selectedYear
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || entries.length === 0}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Exporter XLSX
              </Button>
            </div>
          </div>

          {/* Tableau */}
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun encaissement enregistré pour {selectedYear}.<br />
              Les encaissements apparaissent ici lors du marquage "Payée" d'une facture.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="pb-2 pr-4 text-center font-medium">N°</th>
                    <th className="pb-2 pr-4 text-left font-medium">Date</th>
                    <th className="pb-2 pr-4 text-left font-medium">Facture</th>
                    <th className="pb-2 pr-4 text-left font-medium">Client</th>
                    <th className="pb-2 pr-4 text-left font-medium">Désignation</th>
                    <th className="pb-2 pr-4 text-right font-medium">Montant TTC</th>
                    <th className="pb-2 text-left font-medium">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr
                      key={e.id}
                      className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/30" : ""}`}
                    >
                      <td className="py-2 pr-4 text-center tabular-nums text-muted-foreground">{e.numero}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatDate(e.date_encaissement)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{e.numero_facture}</td>
                      <td className="py-2 pr-4 max-w-[160px] truncate" title={e.client}>{e.client}</td>
                      <td className="py-2 pr-4 max-w-[200px] truncate text-muted-foreground" title={e.designation}>{e.designation}</td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums">{formatEuros(e.montant_ttc)}</td>
                      <td className="py-2 text-muted-foreground">{e.mode_reglement}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={5} className="py-3 pr-4 text-right text-sm font-semibold">
                      Total encaissé {selectedYear}
                    </td>
                    <td className="py-3 pr-4 text-right font-bold tabular-nums text-primary">
                      {formatEuros(total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {toast && (
        <DownloadToast
          path={toast.path}
          name={toast.name}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
