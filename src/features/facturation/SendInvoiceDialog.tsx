import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Mail, X, Send, Loader2, AlertTriangle, FileText, ExternalLink, FolderOpen, CheckCircle2, ClipboardList } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { db } from "@/lib/db";
import { getProfessionalInfo, isProfessionalInfoComplete } from "@/lib/professional-info";
import { downloadInvoicePdf } from "./invoice-pdf";
import { openCompose } from "@/lib/email-compose";
import { docxToPdf, isLibreOfficeAvailable } from "@/lib/docx-to-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Invoice, InvoiceLine, Centre } from "@/types";
import type { DeroulementSheetRow } from "./deroulement/types";

interface Props {
  invoice: Invoice & { centre_name?: string };
  centre: Centre;
  lines: InvoiceLine[];
  deroulementSheets: DeroulementSheetRow[];
  onClose: () => void;
  onSent: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "missing_pro_info" }
  | { kind: "ready"; libreOfficeOk: boolean }
  | { kind: "preparing"; step: string }
  | { kind: "compose_opened"; pdfPaths: string[] }
  | { kind: "error"; message: string };

export function SendInvoiceDialog({
  invoice,
  centre,
  lines,
  deroulementSheets,
  onClose,
  onSent,
}: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [recipient, setRecipient] = useState(centre.referent_email ?? "");
  const [subject, setSubject] = useState(
    `Facture ${invoice.invoice_number} – ${centre.name}`,
  );
  const [body, setBody] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(
    new Set(deroulementSheets.map((s) => s.id)),
  );

  useEffect(() => {
    (async () => {
      try {
        const pro = await getProfessionalInfo();
        if (!isProfessionalInfoComplete(pro)) {
          setState({ kind: "missing_pro_info" });
          return;
        }

        const userEmail =
          centre.smtp_from_email ?? (await db.getConfig("user_email")) ?? "";
        setSenderEmail(userEmail);

        const firstName = (await db.getConfig("user_first_name")) ?? "";
        const greeting = centre.referent_name
          ? `Bonjour ${centre.referent_name.split(/\s+/)[0]},`
          : "Bonjour,";
        const signature = firstName
          ? `\n\nCordialement,\n${firstName}\n${pro.full_name}`
          : `\n\nCordialement,\n${pro.full_name}`;

        const sheetsMention = deroulementSheets.length > 0
          ? `\n\nVous trouverez également ${
              deroulementSheets.length === 1
                ? "la fiche de déroulement de séance correspondante"
                : `les ${deroulementSheets.length} fiches de déroulement de séance correspondantes`
            }.`
          : "";

        setBody(
          `${greeting}\n\n` +
            `Veuillez trouver ci-joint la facture ${invoice.invoice_number} ` +
            `correspondant à mes prestations pour la période du ${formatPeriod(
              invoice.period_start,
              invoice.period_end,
            )}.${sheetsMention}\n\n` +
            `Montant total à régler : ${formatEuros(invoice.total_ttc)}.\n\n` +
            `Merci par avance pour votre traitement.${signature}`,
        );

        // Vérifie LibreOffice si on doit convertir des déroulements DOCX → PDF
        const needsLibreOffice = deroulementSheets.some((s) => s.file_path_docx);
        const libreOfficeOk = needsLibreOffice ? await isLibreOfficeAvailable() : true;

        setState({ kind: "ready", libreOfficeOk });
      } catch (err) {
        console.error(err);
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Erreur de chargement.",
        });
      }
    })();
  }, [invoice, centre, deroulementSheets]);

  function toggleSheet(id: string) {
    setSelectedSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!recipient.trim()) {
      setState({ kind: "error", message: "Renseigne l'adresse du destinataire." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      setState({ kind: "error", message: "Adresse email invalide." });
      return;
    }

    setState({ kind: "preparing", step: "Génération de la facture PDF…" });
    const pdfPaths: string[] = [];
    try {
      // 1. Génère le PDF de la facture
      const pro = await getProfessionalInfo();
      const invoicePdfPath = await downloadInvoicePdf(invoice, lines, centre, pro);
      if (invoicePdfPath) pdfPaths.push(invoicePdfPath);

      // 2. Convertit chaque déroulement sélectionné en PDF
      const selectedSheets = deroulementSheets.filter((s) => selectedSheetIds.has(s.id));
      for (let i = 0; i < selectedSheets.length; i++) {
        const sheet = selectedSheets[i]!;
        if (!sheet.file_path_docx) continue;
        setState({
          kind: "preparing",
          step: `Conversion de la fiche ${i + 1}/${selectedSheets.length} en PDF…`,
        });
        try {
          const pdfPath = await docxToPdf(sheet.file_path_docx);
          // Sauvegarde le chemin dans la BDD pour réutilisation future
          await db.execute(
            "UPDATE pedagogical_sheets SET file_path_pdf = ? WHERE id = ?",
            [pdfPath, sheet.id],
          );
          pdfPaths.push(pdfPath);
        } catch (err) {
          console.error(`Échec conversion fiche ${sheet.title}:`, err);
          // On continue quand même : la facture sera quand même envoyée
        }
      }

      // 3. Met à jour la facture (statut + chemin PDF)
      setState({ kind: "preparing", step: "Mise à jour de la facture…" });
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      if (invoicePdfPath) {
        await db.execute(
          "UPDATE invoices SET file_path = ?, status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?",
          [invoicePdfPath, now, now, invoice.id],
        );
      } else {
        await db.execute(
          "UPDATE invoices SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?",
          [now, now, invoice.id],
        );
      }

      // 4. Ouvre Gmail / Outlook / mailto:
      setState({ kind: "preparing", step: "Ouverture du client mail…" });
      await openCompose(senderEmail, recipient.trim(), subject.trim(), body);

      setState({ kind: "compose_opened", pdfPaths });
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setState({ kind: "error", message });
    }
  }

  async function handleOpenDownloadsFolder() {
    try {
      const { downloadDir } = await import("@tauri-apps/api/path");
      const dir = await downloadDir();
      await openExternal(dir);
    } catch (err) {
      console.error(err);
    }
  }

  const selectedCount = selectedSheetIds.size;
  const totalAttachments = 1 + selectedCount; // facture + déroulements
  const buttonLabel = senderEmail.toLowerCase().includes("gmail")
    ? "Ouvrir dans Gmail"
    : /outlook|hotmail|live/.test(senderEmail.toLowerCase())
      ? "Ouvrir dans Outlook"
      : "Ouvrir mon client mail";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-card shadow-xl max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Envoyer la facture par email</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={state.kind === "preparing"}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-6">
          {state.kind === "loading" && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {state.kind === "missing_pro_info" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Infos pro émetteur incomplètes.</p>
                <p className="mt-1">
                  Va dans <strong>Paramètres → Infos pro</strong> et renseigne au minimum ton nom,
                  ton adresse et ton SIRET.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {state.kind === "compose_opened" && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <p className="font-medium text-green-700">
                    Brouillon ouvert dans ton client mail.
                  </p>
                  <p className="mt-1 text-sm">
                    {state.pdfPaths.length > 0 ? (
                      <>
                        {state.pdfPaths.length === 1
                          ? "Le PDF a été téléchargé. Glisse-le dans la fenêtre de ton mail."
                          : `Les ${state.pdfPaths.length} PDF ont été téléchargés. Glisse-les dans la fenêtre de ton mail.`}
                      </>
                    ) : (
                      "Pense à attacher manuellement les PDF générés."
                    )}
                  </p>
                </AlertDescription>
              </Alert>

              {state.pdfPaths.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fichiers à joindre
                  </p>
                  <ul className="space-y-1.5 text-xs">
                    {state.pdfPaths.map((p, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <code className="break-all rounded bg-background px-1.5 py-0.5">{p}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button variant="outline" onClick={handleOpenDownloadsFolder}>
                <FolderOpen className="h-4 w-4" />
                Ouvrir le dossier Téléchargements
              </Button>

              <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                💡 La facture a été marquée comme <strong>envoyée</strong>. Tu pourras la marquer
                comme <strong>payée</strong> dès réception du règlement.
              </p>
            </div>
          )}

          {state.kind === "preparing" && (
            <div className="space-y-3 py-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="font-medium text-foreground">{state.step}</p>
              <p className="text-xs text-muted-foreground">
                La conversion DOCX → PDF peut prendre quelques secondes.
              </p>
            </div>
          )}

          {(state.kind === "ready" || state.kind === "error") && (
            <div className="space-y-4">
              {state.kind === "error" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{state.message}</AlertDescription>
                </Alert>
              )}

              {state.kind === "ready" && !state.libreOfficeOk && deroulementSheets.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">LibreOffice n'est pas installé.</p>
                    <p className="mt-1">
                      Sans LibreOffice, les fiches de déroulement ne peuvent pas être converties
                      en PDF. Télécharge-le gratuitement sur{" "}
                      <a
                        href="https://www.libreoffice.org/"
                        className="underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        libreoffice.org
                      </a>{" "}
                      puis relance FormAssist. Tu peux quand même envoyer la facture seule.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="recipient">Destinataire *</Label>
                <Input
                  id="recipient"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="coordinateur@centre.fr"
                />
                {!centre.referent_email && (
                  <p className="text-xs text-muted-foreground">
                    Astuce : enregistre cette adresse dans le centre pour qu'elle soit pré-remplie la prochaine fois.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subject">Sujet</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                />
              </div>

              {/* Pièces jointes */}
              <div className="space-y-2 rounded-lg border bg-muted/40 px-3 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pièces jointes ({totalAttachments})
                </p>
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">Facture_{invoice.invoice_number}.pdf</p>
                    <p className="text-xs text-muted-foreground">Toujours incluse</p>
                  </div>
                </div>
                {deroulementSheets.length > 0 && (
                  <>
                    <div className="my-2 h-px bg-border" />
                    <div className="space-y-1.5">
                      {deroulementSheets.map((sheet) => {
                        const checked = selectedSheetIds.has(sheet.id);
                        const hasFile = !!sheet.file_path_docx;
                        return (
                          <label
                            key={sheet.id}
                            className={`flex items-start gap-2 rounded p-2 transition-colors ${
                              hasFile ? "cursor-pointer hover:bg-background" : "opacity-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!hasFile}
                              onChange={() => hasFile && toggleSheet(sheet.id)}
                              className="mt-1"
                            />
                            <ClipboardList className="mt-0.5 h-4 w-4 text-primary" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{sheet.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {hasFile
                                  ? `Fiche de déroulement → conversion PDF automatique`
                                  : `Pas de fichier DOCX généré pour cette fiche`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Les PDF seront téléchargés dans <em>Téléchargements</em>, tu auras juste à les
                  glisser dans ton mail.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={state.kind === "preparing"}
          >
            {state.kind === "compose_opened" ? "Terminer" : "Annuler"}
          </Button>
          {state.kind === "compose_opened" ? (
            <Button onClick={onSent}>
              <CheckCircle2 className="h-4 w-4" />
              Fermer
            </Button>
          ) : state.kind === "preparing" ? (
            <Button disabled>
              <Loader2 className="h-4 w-4 animate-spin" />
              Préparation…
            </Button>
          ) : state.kind === "ready" || state.kind === "error" ? (
            <Button onClick={handleSend} disabled={!recipient.trim()}>
              <Send className="h-4 w-4" />
              {buttonLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatEuros(n: number): string {
  return (
    n
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €"
  );
}

function formatPeriod(start: string, end: string): string {
  const fmt = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    const d = new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10), 12, 0, 0);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  };
  return `${fmt(start)} au ${fmt(end)}`;
}
