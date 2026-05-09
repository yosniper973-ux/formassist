import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Mail, X, Send, Loader2, AlertTriangle, FileText, ExternalLink, FolderOpen, CheckCircle2 } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { db } from "@/lib/db";
import { getProfessionalInfo, isProfessionalInfoComplete } from "@/lib/professional-info";
import { downloadInvoicePdf } from "./invoice-pdf";
import { openCompose } from "@/lib/email-compose";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Invoice, InvoiceLine, Centre } from "@/types";

interface Props {
  invoice: Invoice & { centre_name?: string };
  centre: Centre;
  lines: InvoiceLine[];
  onClose: () => void;
  onSent: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "missing_pro_info" }
  | { kind: "ready" }
  | { kind: "preparing" }
  | { kind: "compose_opened"; pdfPath: string | null }
  | { kind: "error"; message: string };

export function SendInvoiceDialog({ invoice, centre, lines, onClose, onSent }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [recipient, setRecipient] = useState(centre.referent_email ?? "");
  const [subject, setSubject] = useState(
    `Facture ${invoice.invoice_number} – ${centre.name}`,
  );
  const [body, setBody] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const pro = await getProfessionalInfo();
        if (!isProfessionalInfoComplete(pro)) {
          setState({ kind: "missing_pro_info" });
          return;
        }

        // Email de l'expéditeur — depuis le centre (smtp_from_email) ou app_config
        const userEmail =
          centre.smtp_from_email ?? (await db.getConfig("user_email")) ?? "";
        setSenderEmail(userEmail);

        // Pré-remplit le corps avec le prénom de l'utilisateur
        const firstName = (await db.getConfig("user_first_name")) ?? "";
        const greeting = centre.referent_name
          ? `Bonjour ${centre.referent_name.split(/\s+/)[0]},`
          : "Bonjour,";
        const signature = firstName
          ? `\n\nCordialement,\n${firstName}\n${pro.full_name}`
          : `\n\nCordialement,\n${pro.full_name}`;

        setBody(
          `${greeting}\n\n` +
            `Veuillez trouver ci-joint la facture ${invoice.invoice_number} ` +
            `correspondant à mes prestations pour la période du ${formatPeriod(
              invoice.period_start,
              invoice.period_end,
            )}.\n\n` +
            `Montant total à régler : ${formatEuros(invoice.total_ttc)}.\n\n` +
            `Merci par avance pour votre traitement.${signature}`,
        );
        setState({ kind: "ready" });
      } catch (err) {
        console.error(err);
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Erreur de chargement.",
        });
      }
    })();
  }, [invoice, centre]);

  async function handleSend() {
    if (!recipient.trim()) {
      setState({ kind: "error", message: "Renseigne l'adresse du destinataire." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      setState({ kind: "error", message: "Adresse email invalide." });
      return;
    }

    setState({ kind: "preparing" });
    try {
      // 1. Génère et télécharge le PDF de la facture
      const pro = await getProfessionalInfo();
      const pdfPath = await downloadInvoicePdf(invoice, lines, centre, pro);

      // 2. Met à jour la facture (chemin du PDF + statut)
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      if (pdfPath) {
        await db.execute(
          "UPDATE invoices SET file_path = ?, status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?",
          [pdfPath, now, now, invoice.id],
        );
      } else {
        await db.execute(
          "UPDATE invoices SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?",
          [now, now, invoice.id],
        );
      }

      // 3. Ouvre Gmail / Outlook / client mail avec le brouillon pré-rempli
      await openCompose(senderEmail, recipient.trim(), subject.trim(), body);

      setState({ kind: "compose_opened", pdfPath });
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-card shadow-xl max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              Envoyer la facture par email
            </h2>
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
                    {state.pdfPath ? (
                      <>
                        Le PDF a été téléchargé : <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{state.pdfPath}</code>
                        <br />
                        Glisse-le simplement dans la fenêtre de ton mail comme pièce jointe.
                      </>
                    ) : (
                      "Pense à attacher manuellement le PDF généré."
                    )}
                  </p>
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={handleOpenDownloadsFolder}>
                  <FolderOpen className="h-4 w-4" />
                  Ouvrir le dossier Téléchargements
                </Button>
              </div>

              <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                💡 La facture a été marquée comme <strong>envoyée</strong> dans FormAssist.
                Tu pourras la marquer comme <strong>payée</strong> dès réception du règlement.
              </p>
            </div>
          )}

          {(state.kind === "ready" ||
            state.kind === "preparing" ||
            state.kind === "error") && (
            <div className="space-y-4">
              {state.kind === "error" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{state.message}</AlertDescription>
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
                  disabled={state.kind === "preparing"}
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
                  disabled={state.kind === "preparing"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  disabled={state.kind === "preparing"}
                />
              </div>

              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <p>
                      Pièce jointe : <strong>Facture_{invoice.invoice_number}.pdf</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Le PDF sera téléchargé dans ton dossier <em>Téléchargements</em>.
                      Tu auras juste à le glisser dans ton mail.
                    </p>
                  </div>
                </div>
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
              {senderEmail.toLowerCase().includes("gmail")
                ? "Ouvrir dans Gmail"
                : senderEmail.toLowerCase().match(/(outlook|hotmail|live)/)
                  ? "Ouvrir dans Outlook"
                  : "Ouvrir mon client mail"}
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
