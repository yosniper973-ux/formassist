import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Send,
  Printer,
  FileText,
  Mail,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Centre } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

// ============================================================
// Types
// ============================================================

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  template_type: string;
}

interface EmailLogEntry {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  created_at: string;
  error_message: string | null;
}

type Tab = "envoyer" | "historique" | "modeles";

// ============================================================
// Composant principal
// ============================================================

export function DocumentsPage() {
  const { activeCentreId } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("envoyer");
  const [centres, setCentres] = useState<Centre[]>([]);
  const [selectedCentreId, setSelectedCentreId] = useState(activeCentreId ?? "");

  // Email form
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // History
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    loadCentres();
  }, []);

  useEffect(() => {
    if (selectedCentreId) {
      loadTemplates();
    }
    if (activeTab === "historique") loadHistory();
  }, [selectedCentreId, activeTab]);

  async function loadCentres() {
    const rows = (await db.getCentres(false)) as unknown as Centre[];
    setCentres(rows);
    if (!selectedCentreId && rows.length > 0) {
      setSelectedCentreId(rows[0]!.id);
    }
  }

  async function loadHistory() {
    const rows = await db.query<EmailLogEntry>(
      "SELECT * FROM email_log ORDER BY created_at DESC LIMIT 50",
    );
    setEmailLog(rows);
  }

  async function loadTemplates() {
    const rows = await db.query<EmailTemplate>(
      "SELECT * FROM email_templates WHERE centre_id = ? OR centre_id IS NULL ORDER BY name",
      [selectedCentreId],
    );
    setTemplates(rows);
  }

  function applyTemplate(t: EmailTemplate) {
    setSubject(t.subject);
    setBodyText(t.body);
    setActiveTab("envoyer");
  }

  async function handleAddAttachment() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: true,
        filters: [
          { name: "Documents", extensions: ["pdf", "docx", "xlsx", "png", "jpg"] },
        ],
      });
      if (result) {
        const paths = Array.isArray(result) ? result : [result];
        setAttachments((prev) => [...prev, ...paths.map((p) => String(typeof p === "object" && p !== null && "path" in p ? (p as { path: string }).path : p))]);
      }
    } catch (err) {
      console.error("Erreur sélection fichier:", err);
    }
  }

  async function handleSendEmail() {
    if (!recipient || !subject || !bodyText || !selectedCentreId) return;

    const centre = centres.find((c) => c.id === selectedCentreId);
    if (!centre) return;

    if (!centre.smtp_host || !centre.smtp_user || !centre.smtp_password) {
      setSendResult({
        ok: false,
        msg: "Configure les paramètres SMTP du centre dans la page Centres > onglet Facturation.",
      });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      await invoke("send_email", {
        args: {
          smtp_host: centre.smtp_host,
          smtp_port: centre.smtp_port || 587,
          smtp_user: centre.smtp_user,
          smtp_password: centre.smtp_password,
          from_email: centre.smtp_from_email || centre.email || centre.smtp_user,
          from_name: centre.smtp_from_name || centre.name,
          to: recipient,
          subject,
          body_html: `<div style="font-family: sans-serif; line-height: 1.6;">${bodyText.replace(/\n/g, "<br/>")}</div>`,
          body_text: bodyText,
          attachments,
        },
      });

      // Log the email
      await db.execute(
        `INSERT INTO email_log (id, centre_id, recipient, subject, body_preview, attachments, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'sent', datetime('now'))`,
        [
          db.generateId(),
          selectedCentreId,
          recipient,
          subject,
          bodyText.substring(0, 200),
          JSON.stringify(attachments),
        ],
      );

      setSendResult({ ok: true, msg: "Email envoyé avec succès !" });
      setRecipient("");
      setSubject("");
      setBodyText("");
      setAttachments([]);
    } catch (err) {
      const errorMsg = String(err);
      // Log failed attempt
      await db.execute(
        `INSERT INTO email_log (id, centre_id, recipient, subject, body_preview, status, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, 'failed', ?, datetime('now'))`,
        [db.generateId(), selectedCentreId, recipient, subject, bodyText.substring(0, 200), errorMsg],
      );
      setSendResult({ ok: false, msg: `Erreur : ${errorMsg}` });
    } finally {
      setSending(false);
    }
  }

  // ============================================================
  // Rendu
  // ============================================================

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "envoyer", label: "Envoyer", icon: <Send className="h-4 w-4" /> },
    { id: "historique", label: "Historique", icon: <Mail className="h-4 w-4" /> },
    { id: "modeles", label: "Modèles", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Mail className="h-6 w-6" /> Documents & Envoi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envoie des emails, imprime des documents, exporte en PDF
        </p>
      </div>

      {/* Centre selector */}
      <div className="flex items-center gap-3">
        <Label>Centre :</Label>
        <select
          className="rounded-md border border-border px-3 py-1.5 text-sm bg-background text-foreground"
          value={selectedCentreId}
          onChange={(e) => setSelectedCentreId(e.target.value)}
        >
          {centres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab : Envoyer ─── */}
      {activeTab === "envoyer" && (
        <div className="max-w-2xl space-y-4">
          <div>
            <Label>Destinataire *</Label>
            <Input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="coordinateur@centre.fr"
            />
          </div>

          <div>
            <Label>Objet *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Fiches pédagogiques — Formation DWWM"
            />
          </div>

          <div>
            <Label>Message *</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Bonjour,&#10;&#10;Veuillez trouver ci-joint les documents demandés.&#10;&#10;Cordialement,"
              className="min-h-[150px]"
            />
          </div>

          {/* Pièces jointes */}
          <div>
            <Label>Pièces jointes</Label>
            <div className="mt-2 space-y-2">
              {attachments.map((path, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <span className="truncate flex-1">{path.split("/").pop()}</span>
                  <button
                    className="text-muted-foreground hover:text-destructive ml-2"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={handleAddAttachment}>
                <Download className="h-4 w-4 mr-1" /> Ajouter un fichier
              </Button>
            </div>
          </div>

          {/* Résultat */}
          {sendResult && (
            <Alert variant={sendResult.ok ? "default" : "destructive"}>
              {sendResult.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertDescription>{sendResult.msg}</AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSendEmail}
              disabled={!recipient || !subject || !bodyText || sending}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sending ? "Envoi en cours..." : "Envoyer"}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 mr-2" /> Imprimer
            </Button>
          </div>
        </div>
      )}

      {/* ─── Tab : Historique ─── */}
      {activeTab === "historique" && (
        <div className="space-y-3">
          {emailLog.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucun email envoyé pour l'instant.
            </div>
          ) : (
            emailLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{entry.subject}</span>
                    <Badge
                      variant={entry.status === "sent" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {entry.status === "sent" ? "Envoyé" : "Échec"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    À : {entry.recipient} — {new Date(entry.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {entry.error_message && (
                    <p className="text-xs text-destructive mt-1">{entry.error_message}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Tab : Modèles ─── */}
      {activeTab === "modeles" && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Aucun modèle d'email enregistré.</p>
              <p className="text-xs mt-2">
                Les modèles seront créés automatiquement lors de tes premiers envois.
              </p>
            </div>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50"
                onClick={() => applyTemplate(t)}
              >
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.subject}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
