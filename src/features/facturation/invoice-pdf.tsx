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
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#1A3C5E";
const ACCENT = "#2471A3";
const SOFT_BG = "#F4F6F8";
const BORDER = "#CFD8DC";
const TEXT = "#1F2937";
const TEXT_LIGHT = "#6B7280";

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

  // Header (émetteur + bandeau facture)
  emitterBlock: {
    marginBottom: 18,
  },
  emitterName: {
    fontSize: 14,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 2,
  },
  emitterLine: { fontSize: 10, color: TEXT },
  emitterLineSmall: { fontSize: 9, color: TEXT_LIGHT },

  invoiceBanner: {
    marginVertical: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: NAVY,
    color: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  invoiceNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  // Méta + destinataire
  metaRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 16,
  },
  recipientBox: {
    flex: 1.2,
    padding: 10,
    backgroundColor: SOFT_BG,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
  },
  recipientLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: TEXT_LIGHT,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  recipientName: {
    fontSize: 11,
    fontWeight: "bold",
    color: TEXT,
    marginBottom: 2,
  },
  metaBox: {
    flex: 1,
    paddingTop: 2,
  },
  metaLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    borderBottomWidth: 0.3,
    borderBottomColor: BORDER,
  },
  metaLabel: { fontSize: 9, color: TEXT_LIGHT },
  metaValue: { fontSize: 10, color: TEXT, fontWeight: "bold" },

  // Tableau lignes
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
  thDescription: { flex: 4 },
  thQty: { flex: 1, textAlign: "right" },
  thRate: { flex: 1.2, textAlign: "right" },
  thAmount: { flex: 1.4, textAlign: "right", borderRightWidth: 0 },

  tr: {
    flexDirection: "row",
    borderTopWidth: 0.3,
    borderTopColor: BORDER,
  },
  trAlt: { backgroundColor: "#FAFBFC" },
  td: {
    fontSize: 10,
    padding: 6,
    borderRightWidth: 0.3,
    borderRightColor: BORDER,
  },
  tdDescription: { flex: 4 },
  tdQty: { flex: 1, textAlign: "right" },
  tdRate: { flex: 1.2, textAlign: "right" },
  tdAmount: { flex: 1.4, textAlign: "right", borderRightWidth: 0, fontWeight: "bold" },

  // Totaux
  totalsRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalsBox: {
    width: "55%",
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
    color: "#FFFFFF",
    marginTop: 4,
  },
  totFinalLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  totFinalValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  // Mentions / RIB / pied
  mentions: {
    marginTop: 18,
    padding: 8,
    fontSize: 9,
    color: TEXT_LIGHT,
    fontStyle: "italic",
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
  },
  paySection: {
    marginTop: 12,
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
    marginBottom: 4,
  },
  payRow: {
    flexDirection: "row",
    fontSize: 9,
    paddingVertical: 1,
  },
  payLabel: { width: 60, color: TEXT_LIGHT, fontWeight: "bold" },
  payValue: { flex: 1 },
  notes: {
    marginTop: 14,
    padding: 8,
    fontSize: 9,
    color: TEXT,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    backgroundColor: "#F8FAFC",
  },

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
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────────

function eur(n: number): string {
  return (
    n
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €"
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0)
    : new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} → ${formatDate(end)}`;
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
  // Issue date = created_at, fallback to today
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

interface InvoiceDocProps {
  invoice: Invoice;
  lines: InvoiceLine[];
  centre: Centre;
  pro: ProfessionalInfo;
}

function InvoiceDoc({ invoice, lines, centre, pro }: InvoiceDocProps) {
  const adjustments: InvoiceAdjustment[] =
    typeof invoice.adjustments === "string"
      ? (() => {
          try {
            return JSON.parse(invoice.adjustments) as InvoiceAdjustment[];
          } catch {
            return [];
          }
        })()
      : invoice.adjustments ?? [];

  const adjustmentsTotal = adjustments.reduce((s, a) => s + a.amount, 0);
  const linesTotal = lines.reduce((s, l) => s + l.amount_ht, 0);
  const totalHT = linesTotal + adjustmentsTotal;
  const tvaAmount = pro.tva_exempt ? 0 : (totalHT * (invoice.tva_rate ?? 20)) / 100;
  const totalTTC = totalHT + tvaAmount;

  const dueDate = computeDueDate(invoice, centre.payment_delay_days || 30);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ÉMETTEUR (haut, gauche) */}
        <View style={styles.emitterBlock}>
          <Text style={styles.emitterName}>{pro.full_name || "Nom de l'émetteur"}</Text>
          {pro.address.split(/\r?\n/).map((line, i) => (
            <Text key={`a${i}`} style={styles.emitterLine}>
              {line}
            </Text>
          ))}
          {pro.siret && (
            <Text style={styles.emitterLineSmall}>
              SIRET : {formatSiret(pro.siret)}
              {pro.nda ? `   ·   NDA : ${pro.nda}` : ""}
              {pro.naf_code ? `   ·   NAF : ${pro.naf_code}` : ""}
            </Text>
          )}
          {!pro.siret && pro.naf_code && (
            <Text style={styles.emitterLineSmall}>NAF : {pro.naf_code}</Text>
          )}
          {!pro.tva_exempt && pro.tva_number && (
            <Text style={styles.emitterLineSmall}>N° TVA : {pro.tva_number}</Text>
          )}
        </View>

        {/* BANDEAU FACTURE */}
        <View style={styles.invoiceBanner}>
          <Text style={styles.invoiceTitle}>FACTURE</Text>
          <Text style={styles.invoiceNumber}>N° {invoice.invoice_number}</Text>
        </View>

        {/* DESTINATAIRE (gauche) + MÉTA (droite) */}
        <View style={styles.metaRow}>
          <View style={styles.recipientBox}>
            <Text style={styles.recipientLabel}>Facturé à</Text>
            <Text style={styles.recipientName}>{centre.name}</Text>
            {centre.address &&
              centre.address.split(/\r?\n/).map((line, i) => (
                <Text key={`r${i}`} style={styles.emitterLine}>
                  {line}
                </Text>
              ))}
            {centre.siret && (
              <Text style={styles.emitterLineSmall}>
                SIRET : {formatSiret(centre.siret)}
              </Text>
            )}
            {centre.referent_name && (
              <Text style={[styles.emitterLineSmall, { marginTop: 4 }]}>
                À l'attention de : {centre.referent_name}
              </Text>
            )}
          </View>

          <View style={styles.metaBox}>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Date d'émission</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.created_at)}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Date d'échéance</Text>
              <Text style={styles.metaValue}>{formatDate(dueDate)}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Période</Text>
              <Text style={[styles.metaValue, { fontSize: 9 }]}>
                {formatPeriod(invoice.period_start, invoice.period_end)}
              </Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Volume horaire</Text>
              <Text style={styles.metaValue}>
                {invoice.total_hours.toFixed(2).replace(".", ",")} h
              </Text>
            </View>
          </View>
        </View>

        {/* LIGNES DE FACTURATION */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thDescription]}>Désignation</Text>
            <Text style={[styles.th, styles.thQty]}>Quantité</Text>
            <Text style={[styles.th, styles.thRate]}>Taux</Text>
            <Text style={[styles.th, styles.thAmount]}>Montant HT</Text>
          </View>
          {lines.map((l, idx) => (
            <View
              key={l.id}
              style={[styles.tr, idx % 2 === 1 ? styles.trAlt : {}]}
              wrap={false}
            >
              <Text style={[styles.td, styles.tdDescription]}>{l.description}</Text>
              <Text style={[styles.td, styles.tdQty]}>
                {l.hours.toFixed(2).replace(".", ",")} h
              </Text>
              <Text style={[styles.td, styles.tdRate]}>{eur(l.rate)}</Text>
              <Text style={[styles.td, styles.tdAmount]}>{eur(l.amount_ht)}</Text>
            </View>
          ))}
          {adjustments.map((a, idx) => (
            <View
              key={`adj-${idx}`}
              style={[styles.tr, (lines.length + idx) % 2 === 1 ? styles.trAlt : {}]}
              wrap={false}
            >
              <Text
                style={[
                  styles.td,
                  styles.tdDescription,
                  { fontStyle: "italic" },
                ]}
              >
                {a.description || (a.type === "discount"
                  ? "Remise"
                  : a.type === "fee"
                    ? "Frais"
                    : "Annulation")}
              </Text>
              <Text style={[styles.td, styles.tdQty]}>—</Text>
              <Text style={[styles.td, styles.tdRate]}>—</Text>
              <Text style={[styles.td, styles.tdAmount]}>{eur(a.amount)}</Text>
            </View>
          ))}
        </View>

        {/* TOTAUX */}
        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totLine}>
              <Text style={styles.totLabel}>Sous-total HT</Text>
              <Text style={styles.totValue}>{eur(totalHT)}</Text>
            </View>
            <View style={[styles.totLine, styles.totLineBordered]}>
              <Text style={styles.totLabel}>
                {pro.tva_exempt
                  ? "TVA"
                  : `TVA (${(invoice.tva_rate ?? 20).toString().replace(".", ",")} %)`}
              </Text>
              <Text style={styles.totValue}>
                {pro.tva_exempt ? "—" : eur(tvaAmount)}
              </Text>
            </View>
            <View style={styles.totFinal}>
              <Text style={styles.totFinalLabel}>NET À PAYER</Text>
              <Text style={styles.totFinalValue}>{eur(totalTTC)}</Text>
            </View>
          </View>
        </View>

        {/* RIB / PAIEMENT */}
        {(pro.iban || pro.bank_name) && (
          <View style={styles.paySection}>
            <Text style={styles.paySectionTitle}>Coordonnées de paiement</Text>
            {pro.bank_name && (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Banque</Text>
                <Text style={styles.payValue}>{pro.bank_name}</Text>
              </View>
            )}
            {pro.iban && (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>IBAN</Text>
                <Text style={[styles.payValue, { fontFamily: "Courier" }]}>
                  {formatIban(pro.iban)}
                </Text>
              </View>
            )}
            {pro.bic && (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>BIC</Text>
                <Text style={[styles.payValue, { fontFamily: "Courier" }]}>
                  {pro.bic.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.payRow}>
              <Text style={styles.payLabel}>Référence</Text>
              <Text style={styles.payValue}>{invoice.invoice_number}</Text>
            </View>
          </View>
        )}

        {/* NOTES éventuelles */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        {/* MENTIONS LÉGALES */}
        <View style={styles.mentions}>
          {pro.tva_exempt && (
            <Text>TVA non applicable, art. 293 B du Code Général des Impôts.</Text>
          )}
          {centre.legal_mentions ? (
            <Text>{centre.legal_mentions}</Text>
          ) : (
            <Text>
              En cas de retard de paiement, application d'une indemnité forfaitaire pour frais de
              recouvrement de 40 € (art. L441-10 du Code de commerce) et d'intérêts de retard au
              taux légal en vigueur.
            </Text>
          )}
        </View>

        {/* PIED DE PAGE */}
        <Text style={styles.footer} fixed>
          {pro.full_name}
          {pro.siret ? `   ·   SIRET ${formatSiret(pro.siret)}` : ""}
          {"   ·   "}Facture {invoice.invoice_number}
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
): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (<InvoiceDoc invoice={invoice} lines={lines} centre={centre} pro={pro} />) as any;
  return await pdf(doc).toBlob();
}

export async function downloadInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  centre: Centre,
  pro: ProfessionalInfo,
): Promise<string | null> {
  const blob = await invoiceToPdf(invoice, lines, centre, pro);
  const safeNumber = invoice.invoice_number.replace(/[\\/:*?"<>|]/g, "_");
  return downloadPdf(blob, `Facture_${safeNumber}.pdf`);
}
