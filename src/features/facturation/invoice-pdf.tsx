import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";
import { downloadPdf } from "@/lib/pdf-export";
import type { Invoice, InvoiceLine, InvoiceAdjustment, ProfessionalInfo } from "@/types/invoice";
import type { Centre } from "@/types/centre";

// ─────────────────────────────────────────────────────────────────────────────
// Police
// ─────────────────────────────────────────────────────────────────────────────

Font.register({
  family: "NotoSans",
  fonts: [
    { src: "/fonts/NotoSans-Regular.ttf" },
    { src: "/fonts/NotoSans-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/NotoSans-Italic.ttf", fontStyle: "italic" },
    { src: "/fonts/NotoSans-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Couleurs
// ─────────────────────────────────────────────────────────────────────────────

const NAVY      = "#1A3C5E";
const ACCENT    = "#2471A3";
const SOFT_BG   = "#F4F6F8";
const BORDER    = "#CFD8DC";
const TEXT      = "#1F2937";
const TEXT_LIGHT = "#6B7280";

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 70,
    paddingHorizontal: 40,
    fontFamily: "NotoSans",
    fontSize: 10,
    color: TEXT,
    lineHeight: 1.4,
  },

  // ── En-tête 2 colonnes (émetteur gauche / centre droit) ──────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  headerCol: {
    flex: 1,
    paddingRight: 12,
  },
  headerColRight: {
    flex: 1,
    paddingLeft: 12,
    alignItems: "flex-end",
  },
  headerName: {
    fontSize: 13,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 3,
  },
  headerNameRight: {
    fontSize: 13,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 3,
    textAlign: "right",
  },
  headerLine: {
    fontSize: 10,
    color: TEXT,
  },
  headerLineRight: {
    fontSize: 10,
    color: TEXT,
    textAlign: "right",
  },
  headerLineSmall: {
    fontSize: 9,
    color: TEXT_LIGHT,
  },
  headerLineSmallRight: {
    fontSize: 9,
    color: TEXT_LIGHT,
    textAlign: "right",
  },

  // ── Titre facture ─────────────────────────────────────────────
  invoiceTitleBlock: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: NAVY,
  },
  invoiceTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: NAVY,
    letterSpacing: 0.5,
  },
  invoiceDate: {
    fontSize: 10,
    color: TEXT_LIGHT,
    marginTop: 10,
  },

  // ── Tableau ───────────────────────────────────────────────────
  table: {
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: BORDER,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: NAVY,
  },
  th: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
    padding: 6,
    borderRightWidth: 0.5,
    borderRightColor: "#FFFFFF",
  },
  thRef:         { flex: 1.2 },
  thDescription: { flex: 3.8 },
  thQty:         { flex: 1,   textAlign: "right" },
  thRate:        { flex: 1.2, textAlign: "right" },
  thTva:         { flex: 0.8, textAlign: "right" },
  thAmount:      { flex: 1.4, textAlign: "right", borderRightWidth: 0 },

  tr:      { flexDirection: "row", borderTopWidth: 0.3, borderTopColor: BORDER },
  trAlt:   { backgroundColor: "#FAFBFC" },
  trSummary: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderTopColor: NAVY,
    backgroundColor: "#E8F0F7",
    paddingVertical: 2,
  },
  td: {
    fontSize: 10,
    padding: 6,
    borderRightWidth: 0.3,
    borderRightColor: BORDER,
  },
  tdRef:         { flex: 1.2, fontSize: 9, color: TEXT_LIGHT },
  tdDescription: { flex: 3.8, flexDirection: "column" },
  tdDescText:    { fontSize: 9 },
  tdDescDate:    { fontSize: 7.5, color: ACCENT, fontStyle: "italic", marginTop: 2 },
  tdSummaryRef:  { flex: 1.2, fontSize: 9, color: NAVY, fontWeight: "bold" },
  tdSummaryDesc: { flex: 3.8, flexDirection: "column" },
  tdSummaryDescTitle: { fontSize: 9, color: NAVY, fontWeight: "bold" },
  tdSummaryDescDates: { fontSize: 7.5, color: ACCENT, fontStyle: "italic", marginTop: 2 },
  tdSummaryNum:  { fontSize: 9, color: NAVY, fontWeight: "bold" },
  tdQty:         { flex: 1,   textAlign: "right" },
  tdRate:        { flex: 1.2, textAlign: "right" },
  tdTva:         { flex: 0.8, textAlign: "right" },
  tdAmount:      { flex: 1.4, textAlign: "right", borderRightWidth: 0, fontWeight: "bold" },

  // ── Totaux ────────────────────────────────────────────────────
  totalsRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalsBox: {
    width: "48%",
  },
  totLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  totLineBordered: {
    borderTopWidth: 0.3,
    borderTopColor: BORDER,
  },
  totLabel: { fontSize: 10, color: TEXT },
  totValue: { fontSize: 10, color: TEXT, fontWeight: "bold" },
  totFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: NAVY,
    marginTop: 4,
  },
  totFinalLabel: { fontSize: 12, fontWeight: "bold", color: "#FFFFFF" },
  totFinalValue: { fontSize: 14, fontWeight: "bold", color: "#FFFFFF" },

  // ── Conditions de paiement ────────────────────────────────────
  conditionsSection: {
    marginTop: 16,
  },
  conditionsTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: TEXT_LIGHT,
    marginBottom: 3,
  },
  conditionsLine: {
    fontSize: 9,
    color: TEXT,
  },

  // ── RIB / Coordonnées bancaires ───────────────────────────────
  paySection: {
    marginTop: 14,
    padding: 10,
    backgroundColor: SOFT_BG,
    borderRadius: 2,
  },
  paySectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: NAVY,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  payRow: {
    flexDirection: "row",
    fontSize: 9,
    paddingVertical: 1.5,
  },
  payLabel: { width: 70, color: TEXT_LIGHT, fontWeight: "bold" },
  payValue:  { flex: 1 },

  // ── Notes ─────────────────────────────────────────────────────
  notes: {
    marginTop: 14,
    padding: 8,
    fontSize: 9,
    color: TEXT,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    backgroundColor: "#F8FAFC",
  },

  // ── Mentions légales ──────────────────────────────────────────
  mentions: {
    marginTop: 18,
    padding: 8,
    fontSize: 7.5,
    color: TEXT_LIGHT,
    fontStyle: "italic",
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
  },

  // ── Pied de page ──────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: TEXT_LIGHT,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function eur(n: number): string {
  return (
    n
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €"
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0)
    : new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatFullDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0)
    : new Date(iso);
  const label = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Le ${label}`;
}

function formatIban(iban: string): string {
  const stripped = iban.replace(/\s+/g, "").toUpperCase();
  return stripped.replace(/(.{4})/g, "$1 ").trim();
}

function formatSiret(s: string): string {
  const stripped = s.replace(/\s+/g, "");
  if (stripped.length !== 14) return s;
  return `${stripped.slice(0, 3)} ${stripped.slice(3, 6)} ${stripped.slice(6, 9)} ${stripped.slice(9)}`;
}

function computeDueDate(invoice: Invoice, fallbackDays = 30): string {
  if (invoice.due_date) return invoice.due_date;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(invoice.created_at ?? "");
  const issued = m
    ? new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10))
    : new Date();
  const due = new Date(issued);
  due.setDate(due.getDate() + fallbackDays);
  const yy = due.getFullYear();
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const dd = String(due.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────────────────────────────────────

function formatWorkedDates(dates: string[]): string {
  if (dates.length === 0) return "";
  const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const parsed = dates
    .map(d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? { y: +m[1]!, mo: +m[2]!, d: +m[3]! } : null; })
    .filter(Boolean)
    .sort((a, b) => a!.y !== b!.y ? a!.y - b!.y : a!.mo !== b!.mo ? a!.mo - b!.mo : a!.d - b!.d) as { y: number; mo: number; d: number }[];
  const groups = new Map<string, number[]>();
  for (const p of parsed) {
    const key = `${p.y}-${p.mo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p.d);
  }
  return Array.from(groups.entries())
    .map(([key, days]) => {
      const [y, mo] = key.split("-").map(Number);
      return `${days.map(d => String(d).padStart(2, "0")).join("-")} ${MONTHS[mo! - 1]} ${y}`;
    })
    .join(", ");
}

interface InvoiceDocProps {
  invoice: Invoice;
  lines: InvoiceLine[];
  centre: Centre;
  pro: ProfessionalInfo;
  formationTitle?: string;
}

function InvoiceDoc({ invoice, lines, centre, pro, formationTitle }: InvoiceDocProps) {
  const adjustments: InvoiceAdjustment[] =
    typeof invoice.adjustments === "string"
      ? (() => { try { return JSON.parse(invoice.adjustments) as InvoiceAdjustment[]; } catch { return []; } })()
      : invoice.adjustments ?? [];

  const adjustmentsTotal = adjustments.reduce((s, a) => s + a.amount, 0);
  const linesTotal = lines.reduce((s, l) => s + l.amount_ht, 0);
  const totalHT = linesTotal + adjustmentsTotal;
  const tvaRate = invoice.tva_rate ?? 20;
  const tvaAmount = pro.tva_exempt ? 0 : (totalHT * tvaRate) / 100;
  const totalTTC = totalHT + tvaAmount;

  const dueDate = computeDueDate(invoice, centre.payment_delay_days || 30);

  // Ligne récap : dates uniques triées + totaux
  const slotDates = [...new Set(lines.map(l => l.slot_date).filter(Boolean) as string[])];
  const workedDatesStr = formatWorkedDates(slotDates);
  const summaryHours = lines.reduce((s, l) => s + l.hours, 0);
  const summaryRate = lines[0]?.rate ?? 0;

  const paymentLabel = centre.payment_delay_days === 0
    ? "paiement comptant"
    : `délai de ${centre.payment_delay_days} jours`;

  // Référence = extrait des notes ("REFERENCE : W26007A"), sinon bon de commande, sinon n° facture
  const noteRefMatch = invoice.notes?.match(/REFERENCE\s*:\s*(\S+)/i);
  const lineRef = noteRefMatch?.[1] ?? centre.purchase_order ?? invoice.invoice_number;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── EN-TÊTE : émetteur (gauche) / centre (droite) ─── */}
        <View style={styles.headerRow}>

          {/* Émetteur */}
          <View style={styles.headerCol}>
            <Text style={styles.headerName}>{pro.full_name || "Nom de l'émetteur"}</Text>
            {pro.address.split(/\r?\n/).map((line, i) => (
              <Text key={`a${i}`} style={styles.headerLine}>{line}</Text>
            ))}
            {pro.siret && (
              <Text style={styles.headerLineSmall}>SIRET : {formatSiret(pro.siret)}</Text>
            )}
            {pro.nda && (
              <Text style={styles.headerLineSmall}>Code NDA : {pro.nda}</Text>
            )}
            {pro.naf_code && (
              <Text style={styles.headerLineSmall}>Code NAF : {pro.naf_code}</Text>
            )}
            {!pro.tva_exempt && pro.tva_number && (
              <Text style={styles.headerLineSmall}>N° TVA : {pro.tva_number}</Text>
            )}
          </View>

          {/* Destinataire (centre) */}
          <View style={styles.headerColRight}>
            <Text style={styles.headerNameRight}>{centre.name}</Text>
            {centre.address &&
              centre.address.split(/\r?\n/).map((line, i) => (
                <Text key={`r${i}`} style={styles.headerLineRight}>{line}</Text>
              ))}
            {centre.tva_intracom && (
              <Text style={styles.headerLineSmallRight}>
                N° TVA Intracommunautaire : {centre.tva_intracom}
              </Text>
            )}
            {centre.siret && (
              <Text style={styles.headerLineSmallRight}>
                SIRET : {formatSiret(centre.siret)}
              </Text>
            )}
          </View>
        </View>

        {/* ── TITRE FACTURE ─────────────────────────────────── */}
        <View style={styles.invoiceTitleBlock}>
          <Text style={styles.invoiceTitle}>FACTURE N° {invoice.invoice_number}</Text>
          <Text style={styles.invoiceDate}>{formatFullDate(invoice.created_at)}</Text>
        </View>

        {/* ── TABLEAU DES PRESTATIONS ───────────────────────── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thRef]}>Référence</Text>
            <Text style={[styles.th, styles.thDescription]}>Désignation</Text>
            <Text style={[styles.th, styles.thQty]}>Quantité</Text>
            <Text style={[styles.th, styles.thRate]}>PU Vente</Text>
            <Text style={[styles.th, styles.thTva]}>TVA</Text>
            <Text style={[styles.th, styles.thAmount]}>Montant HT</Text>
          </View>

          {lines.map((l, idx) => (
            <View
              key={l.id}
              style={[styles.tr, idx % 2 === 1 ? styles.trAlt : {}]}
              wrap={false}
            >
              <Text style={[styles.td, styles.tdRef]}>{lineRef}</Text>
              <View style={[styles.td, styles.tdDescription]}>
                <Text style={styles.tdDescText}>{l.description}</Text>
                {l.slot_date && (
                  <Text style={styles.tdDescDate}>{formatDate(l.slot_date)}</Text>
                )}
              </View>
              <Text style={[styles.td, styles.tdQty]}>
                {l.hours.toFixed(2).replace(".", ",")} h
              </Text>
              <Text style={[styles.td, styles.tdRate]}>{eur(l.rate)}</Text>
              <Text style={[styles.td, styles.tdTva]}>
                {pro.tva_exempt ? "—" : `${tvaRate.toString().replace(".", ",")} %`}
              </Text>
              <Text style={[styles.td, styles.tdAmount]}>{eur(l.amount_ht)}</Text>
            </View>
          ))}

          {/* Ligne récap : total heures + tous les jours travaillés */}
          {workedDatesStr && (
            <View style={styles.trSummary} wrap={false}>
              <Text style={[styles.td, styles.tdSummaryRef]}>{lineRef}</Text>
              <View style={[styles.td, styles.tdSummaryDesc]}>
                {formationTitle && (
                  <Text style={styles.tdSummaryDescTitle}>
                    {"Formation : "}{formationTitle}
                  </Text>
                )}
                <Text style={styles.tdSummaryDescDates}>{"dates : "}{workedDatesStr}</Text>
              </View>
              <Text style={[styles.td, styles.tdQty, styles.tdSummaryNum]}>
                {summaryHours.toFixed(2).replace(".", ",")} h
              </Text>
              <Text style={[styles.td, styles.tdRate, styles.tdSummaryNum]}>{eur(summaryRate)}</Text>
              <Text style={[styles.td, styles.tdTva, styles.tdSummaryNum]}>
                {pro.tva_exempt ? "—" : `${tvaRate.toString().replace(".", ",")} %`}
              </Text>
              <Text style={[styles.td, styles.tdAmount, styles.tdSummaryNum]}>{eur(totalHT)}</Text>
            </View>
          )}

          {adjustments.map((a, idx) => (
            <View
              key={`adj-${idx}`}
              style={[styles.tr, (lines.length + idx) % 2 === 1 ? styles.trAlt : {}]}
              wrap={false}
            >
              <Text style={[styles.td, styles.tdRef]}>—</Text>
              <Text style={[styles.td, styles.tdDescription, { fontStyle: "italic" }]}>
                {a.description || (
                  a.type === "discount" ? "Remise"
                  : a.type === "fee" ? "Frais"
                  : "Annulation"
                )}
              </Text>
              <Text style={[styles.td, styles.tdQty]}>—</Text>
              <Text style={[styles.td, styles.tdRate]}>—</Text>
              <Text style={[styles.td, styles.tdTva]}>—</Text>
              <Text style={[styles.td, styles.tdAmount]}>{eur(a.amount)}</Text>
            </View>
          ))}
        </View>

        {/* ── TOTAUX ────────────────────────────────────────── */}
        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totLine}>
              <Text style={styles.totLabel}>Total HT</Text>
              <Text style={styles.totValue}>{eur(totalHT)}</Text>
            </View>
            <View style={[styles.totLine, styles.totLineBordered]}>
              <Text style={styles.totLabel}>
                {pro.tva_exempt ? "TVA" : `TVA (${tvaRate.toString().replace(".", ",")} %)`}
              </Text>
              <Text style={styles.totValue}>
                {pro.tva_exempt ? "—" : eur(tvaAmount)}
              </Text>
            </View>
            <View style={styles.totFinal}>
              <Text style={styles.totFinalLabel}>Total TTC</Text>
              <Text style={styles.totFinalValue}>{eur(totalTTC)}</Text>
            </View>
          </View>
        </View>

        {/* ── CONDITIONS DE PAIEMENT ────────────────────────── */}
        <View style={styles.conditionsSection}>
          <Text style={styles.conditionsTitle}>Conditions de paiement :</Text>
          <Text style={styles.conditionsLine}>
            {"• 100,00 % soit "}
            {eur(totalTTC)}
            {" à payer le : "}
            {formatDate(dueDate)}
            {` (${paymentLabel}).`}
          </Text>
        </View>

        {/* ── COORDONNÉES BANCAIRES ─────────────────────────── */}
        {(pro.iban || pro.bank_name) && (
          <View style={styles.paySection}>
            <Text style={styles.paySectionTitle}>Coordonnées bancaires</Text>
            {pro.bank_name && (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Banque</Text>
                <Text style={styles.payValue}>{pro.bank_name}</Text>
              </View>
            )}
            {pro.iban && (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>IBAN</Text>
                <Text style={styles.payValue}>{formatIban(pro.iban)}</Text>
              </View>
            )}
            {pro.bic && (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>BIC/SWIFT</Text>
                <Text style={styles.payValue}>{pro.bic.toUpperCase()}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── NOTES ─────────────────────────────────────────── */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        {/* ── MENTIONS LÉGALES ──────────────────────────────── */}
        <View style={styles.mentions}>
          {pro.tva_exempt && (
            <Text>TVA non applicable, art. 293 B du Code Général des Impôts.{"\n"}</Text>
          )}
          {centre.legal_mentions ? (
            <Text>{centre.legal_mentions}</Text>
          ) : (
            <Text>
              Pénalité de retard : 3 fois le taux d'intérêt légal après date d'échéance. Escompte
              pour règlement anticipé : 0 % (sauf condition particulière). Le montant de
              l'indemnité forfaitaire pour frais de recouvrement prévue à l'article L441-10 du
              Code de commerce est fixé à 40 €.
            </Text>
          )}
        </View>

        {/* ── PIED DE PAGE ──────────────────────────────────── */}
        <Text style={styles.footer} fixed>
          {pro.full_name}
          {pro.siret ? `   ·   SIRET ${formatSiret(pro.siret)}` : ""}
          {"   ·   Facture "}
          {invoice.invoice_number}
        </Text>

      </Page>
    </Document>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

export async function invoiceToPdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  centre: Centre,
  pro: ProfessionalInfo,
  formationTitle?: string,
): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (<InvoiceDoc invoice={invoice} lines={lines} centre={centre} pro={pro} formationTitle={formationTitle} />) as any;
  return await pdf(doc).toBlob();
}

export async function downloadInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  centre: Centre,
  pro: ProfessionalInfo,
  formationTitle?: string,
): Promise<string | null> {
  const blob = await invoiceToPdf(invoice, lines, centre, pro, formationTitle);
  const safeNumber = invoice.invoice_number.replace(/[\\/:*?"<>|]/g, "_");
  return downloadPdf(blob, `Facture_${safeNumber}.pdf`);
}
