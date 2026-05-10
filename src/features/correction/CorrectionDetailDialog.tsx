import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail, Download, Loader2, Check, Users } from "lucide-react";
import { db } from "@/lib/db";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { markdownToPdf, downloadPdf } from "@/lib/pdf-export";
import { openCompose } from "@/lib/email-compose";
import { useAppStore } from "@/stores/appStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { DownloadToast } from "@/components/ui/download-toast";
import type { Correction, CriteriaGrid } from "@/types/correction";
import type { Learner } from "@/types/learner";

interface Props {
  correctionId: string;
  onClose: () => void;
}

interface GroupMember {
  correctionId: string;
  learner: Learner;
  sent_at: string | null;
}

interface FullCorrection extends Correction {
  learner?: Learner;
  content_title?: string;
  groupMembers?: GroupMember[]; // tous les membres si correction de groupe (incluant celui affiché)
}

export function CorrectionDetailDialog({ correctionId, onClose }: Props) {
  const { activeCentreId } = useAppStore();
  const [data, setData] = useState<FullCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ path: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");

  useEffect(() => {
    loadCorrection();
  }, [correctionId]);

  useEffect(() => {
    if (!activeCentreId) return;
    db.query<{ smtp_from_email: string | null; email: string | null }>(
      "SELECT smtp_from_email, email FROM centres WHERE id = ?",
      [activeCentreId],
    ).then((rows) => {
      const r = rows[0];
      setSenderEmail(r?.smtp_from_email ?? "");
    }).catch(() => {});
  }, [activeCentreId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function loadCorrection() {
    setLoading(true);
    try {
      const rows = await db.query<Correction & { content_title: string | null }>(
        `SELECT c.*, gc.title as content_title
         FROM corrections c
         LEFT JOIN generated_contents gc ON c.content_id = gc.id
         WHERE c.id = ?`,
        [correctionId],
      );
      const raw = rows[0];
      if (!raw) return;

      const learners = await db.query<Learner>(
        `SELECT * FROM learners WHERE id = ?`,
        [raw.learner_id],
      );

      const grid = typeof raw.criteria_grid === "string"
        ? (JSON.parse(raw.criteria_grid) as CriteriaGrid)
        : raw.criteria_grid;

      let groupMembers: GroupMember[] | undefined;
      if (raw.group_correction_id) {
        const memberRows = await db.query<{
          id: string;
          sent_at: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
        } & Learner>(
          `SELECT c.id, c.sent_at, l.*
           FROM corrections c
           JOIN learners l ON c.learner_id = l.id
           WHERE c.group_correction_id = ?
           ORDER BY l.last_name, l.first_name`,
          [raw.group_correction_id],
        );
        groupMembers = memberRows.map((r) => ({
          correctionId: r.id,
          sent_at: r.sent_at,
          learner: r as unknown as Learner,
        }));
      }

      setData({
        ...raw,
        criteria_grid: grid,
        validated: Boolean(raw.validated),
        ocr_used: Boolean(raw.ocr_used),
        learner: learners[0],
        content_title: raw.content_title ?? undefined,
        groupMembers,
      });
    } finally {
      setLoading(false);
    }
  }

  function buildMarkdown(): string {
    if (!data) return "";
    const isGroup = (data.groupMembers?.length ?? 0) > 1;
    const learnerName = isGroup
      ? `Groupe : ${data.groupMembers!.map((m) => `${m.learner.first_name} ${m.learner.last_name}`).join(", ")}`
      : data.learner
        ? `${data.learner.first_name} ${data.learner.last_name}`
        : "Apprenant";
    const lines: string[] = [];
    const titleBase = data.content_title ?? "Exercice";
    lines.push(`# CORRECTION — ${titleBase.toUpperCase()}`);
    lines.push("");
    lines.push("| Rubrique | Détail |");
    lines.push("|----------|--------|");
    lines.push(`| ${isGroup ? "Apprenants" : "Apprenant"} | ${learnerName} |`);
    if (data.content_title) lines.push(`| Exercice | ${data.content_title} |`);
    if (data.grade != null) lines.push(`| Note globale | **${data.grade} / ${data.max_grade}**${isGroup ? " (note de groupe)" : ""} |`);
    lines.push(`| Date de correction | ${new Date(data.created_at).toLocaleDateString("fr-FR")} |`);
    if (data.validated) lines.push(`| Statut | Validée |`);
    lines.push("");

    let section = 1;

    if (data.grade != null) {
      lines.push(`## ${section}. NOTE GLOBALE`);
      lines.push("");
      const ratio = data.grade / data.max_grade;
      const kind = ratio >= 0.8 ? "success" : ratio >= 0.6 ? "info" : ratio >= 0.4 ? "warning" : "danger";
      const label = ratio >= 0.8 ? "Très bon travail" : ratio >= 0.6 ? "Travail satisfaisant" : ratio >= 0.4 ? "Travail à consolider" : "Travail à reprendre";
      lines.push(`> [!${kind}] ${label}`);
      lines.push(`> **${data.grade} / ${data.max_grade}**`);
      lines.push("");
      section++;
    }

    if (data.criteria_grid && data.criteria_grid.criteria.length > 0) {
      lines.push(`## ${section}. GRILLE D'ÉVALUATION`);
      lines.push("");
      lines.push("| Critère | Points | Commentaire |");
      lines.push("|---------|:------:|-------------|");
      for (const c of data.criteria_grid.criteria) {
        lines.push(`| ${c.criterion} | ${c.awarded_points} / ${c.max_points} | ${c.comment} |`);
      }
      lines.push("");
      section++;

      if (data.criteria_grid.general_comment) {
        lines.push(`## ${section}. COMMENTAIRE GÉNÉRAL`);
        lines.push("");
        lines.push(`> [!info] Synthèse`);
        lines.push(`> ${data.criteria_grid.general_comment}`);
        lines.push("");
        section++;
      }
    }

    if (data.feedback_markdown) {
      lines.push(`## ${section}. FEEDBACK DÉTAILLÉ`);
      lines.push("");
      lines.push(data.feedback_markdown);
      lines.push("");
    }

    return lines.join("\n");
  }

  function exportFilename(): string {
    if (!data) return "correction";
    const isGroup = (data.groupMembers?.length ?? 0) > 1;
    if (isGroup) {
      return `Correction_groupe_${data.groupMembers!.length}_apprenants`;
    }
    return data.learner
      ? `Correction_${data.learner.first_name}_${data.learner.last_name}`
      : "Correction_apprenant";
  }

  async function handleExportWord() {
    if (!data) return;
    try {
      const md = buildMarkdown();
      const blob = await markdownToDocx(md);
      const savedPath = await downloadDocx(blob, exportFilename());
      if (savedPath) {
        setDownloadToast({
          path: savedPath,
          name: savedPath.split(/[\\/]/).pop() ?? savedPath,
        });
      }
    } catch (err) {
      console.error(err);
      setToast("Erreur lors de l'export Word");
      setTimeout(() => setToast(null), 5000);
    }
  }

  async function handleExportPdf() {
    if (!data) return;
    try {
      const md = buildMarkdown();
      const blob = await markdownToPdf(md);
      const savedPath = await downloadPdf(blob, exportFilename());
      if (savedPath) {
        setDownloadToast({
          path: savedPath,
          name: savedPath.split(/[\\/]/).pop() ?? savedPath,
        });
      }
    } catch (err) {
      console.error(err);
      setToast("Erreur lors de l'export PDF");
      setTimeout(() => setToast(null), 5000);
    }
  }

  async function sendEmailTo(learner: Learner, correctionRowId: string, isGroup: boolean) {
    if (!data || !learner.email) return;
    const learnerName = `${learner.first_name} ${learner.last_name}`;
    const subject = `Correction : ${data.content_title ?? "ton exercice"}`;
    const noteLine = data.grade != null ? `Note : ${data.grade}/${data.max_grade}\n\n` : "";
    const groupLine = isGroup
      ? "(Travail réalisé en groupe — note commune attribuée à chaque membre.)\n\n"
      : "";
    const gridLines = data.criteria_grid?.criteria
      .map((c) => `- ${c.criterion} : ${c.awarded_points}/${c.max_points} — ${c.comment}`)
      .join("\n") ?? "";
    const generalComment = data.criteria_grid?.general_comment
      ? `\n\nCommentaire général :\n${data.criteria_grid.general_comment}`
      : "";
    const feedback = data.feedback_markdown
      ? `\n\n${stripMarkdown(data.feedback_markdown)}`
      : "";

    const body = `Bonjour ${learner.first_name},

Voici le retour sur ${data.content_title ?? "ton exercice"}.

${groupLine}${noteLine}${gridLines}${generalComment}${feedback}

Bon courage pour la suite.`;

    const trimmedBody = body.length > 1800 ? body.slice(0, 1800) + "…" : body;
    await openCompose(senderEmail, learner.email, subject, trimmedBody);

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    await db.execute(
      `UPDATE corrections SET sent_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, correctionRowId],
    );
    if (correctionRowId === data.id) {
      setData({
        ...data,
        sent_at: now,
        groupMembers: data.groupMembers?.map((m) =>
          m.correctionId === correctionRowId ? { ...m, sent_at: now } : m,
        ),
      });
    } else if (data.groupMembers) {
      setData({
        ...data,
        groupMembers: data.groupMembers.map((m) =>
          m.correctionId === correctionRowId ? { ...m, sent_at: now } : m,
        ),
      });
    }
    setToast(`Email ouvert pour ${learnerName}`);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSendEmail() {
    if (!data || !data.learner?.email) return;
    setSending(true);
    try {
      const isGroup = (data.groupMembers?.length ?? 0) > 1;
      await sendEmailTo(data.learner, data.id, isGroup);
    } catch (err) {
      console.error(err);
      setToast("Impossible d'ouvrir le client mail");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSending(false);
    }
  }

  async function handleSendEmailTo(member: GroupMember) {
    setSending(true);
    try {
      await sendEmailTo(member.learner, member.correctionId, true);
    } catch (err) {
      console.error(err);
      setToast("Impossible d'ouvrir le client mail");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSending(false);
    }
  }

  const gradeColor = (grade: number, max: number) => {
    const r = grade / max;
    if (r >= 0.8) return "text-green-600";
    if (r >= 0.6) return "text-yellow-600";
    if (r >= 0.4) return "text-orange-500";
    return "text-red-600";
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl bg-card shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between border-b p-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {data.groupMembers && data.groupMembers.length > 1
                      ? `Correction de groupe — ${data.groupMembers.length} apprenants`
                      : `${data.learner?.first_name ?? ""} ${data.learner?.last_name ?? ""}`}
                  </h2>
                  {data.groupMembers && data.groupMembers.length > 1 && (
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                      <Users className="h-3 w-3" /> Groupe
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {data.content_title ?? "Sans exercice"} — {new Date(data.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {data.grade != null && (
                    <span className={`text-2xl font-bold ${gradeColor(data.grade, data.max_grade)}`}>
                      {data.grade}<span className="text-base text-muted-foreground">/{data.max_grade}</span>
                    </span>
                  )}
                  {data.validated ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Validée</Badge>
                  ) : (
                    <Badge variant="outline">Brouillon</Badge>
                  )}
                  {data.sent_at && (!data.groupMembers || data.groupMembers.length <= 1) && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      <Check className="h-3 w-3" /> Envoyée le {new Date(data.sent_at).toLocaleDateString("fr-FR")}
                    </Badge>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-3 flex shrink-0 items-center gap-1.5 rounded-md border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
                Fermer
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
              {data.groupMembers && data.groupMembers.length > 1 && (
                <div className="rounded-lg border bg-purple-50/30 p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    Apprenants du groupe ({data.groupMembers.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Même note pour tous, comptée dans la progression individuelle de chacun.
                  </p>
                  <div className="space-y-1.5">
                    {data.groupMembers.map((m) => {
                      const hasEmail = Boolean(m.learner.email);
                      return (
                        <div
                          key={m.correctionId}
                          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                            {(m.learner.first_name?.[0] ?? "?")}{(m.learner.last_name?.[0] ?? "?")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {m.learner.first_name} {m.learner.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.learner.email ?? "Aucun email enregistré"}
                            </p>
                          </div>
                          {m.sent_at && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 shrink-0">
                              <Check className="h-3 w-3" /> Envoyé
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasEmail || sending}
                            onClick={() => handleSendEmailTo(m)}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Email
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.criteria_grid && data.criteria_grid.criteria.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Grille d'évaluation</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Critère</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground text-center w-24">Points</th>
                        <th className="pb-2 font-medium text-muted-foreground">Commentaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.criteria_grid.criteria.map((c, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{c.criterion}</td>
                          <td className="py-2 pr-4 text-center">
                            <span className={gradeColor(c.awarded_points, c.max_points)}>{c.awarded_points}</span>
                            <span className="text-muted-foreground">/{c.max_points}</span>
                          </td>
                          <td className="py-2 text-muted-foreground">{c.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.criteria_grid.general_comment && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Commentaire général</p>
                      <p className="mt-1 text-sm">{data.criteria_grid.general_comment}</p>
                    </div>
                  )}
                </div>
              )}

              {data.feedback_markdown && (
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Feedback détaillé</h3>
                  <div className="text-sm">
                    <RichMarkdown content={data.feedback_markdown} />
                  </div>
                </div>
              )}

              {data.submission_text && (
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-semibold">Copie de l'apprenant</summary>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {data.submission_text}
                  </div>
                </details>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between border-t p-4 bg-muted/30">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                  Fermer
                </button>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {data.groupMembers && data.groupMembers.length > 1
                    ? "Utilise les boutons « Email » au-dessus pour envoyer le retour à chaque apprenant."
                    : data.learner?.email
                      ? `Email : ${data.learner.email}`
                      : "Aucun email enregistré pour cet apprenant"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportWord}>
                  <Download className="h-3.5 w-3.5" /> Word
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPdf}>
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
                {(!data.groupMembers || data.groupMembers.length <= 1) && (
                  <Button
                    size="sm"
                    onClick={handleSendEmail}
                    disabled={!data.learner?.email || sending}
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    Envoyer par email
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      {downloadToast && (
        <DownloadToast
          path={downloadToast.path}
          name={downloadToast.name}
          onClose={() => setDownloadToast(null)}
        />
      )}
    </div>,
    document.body
  );
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, " ");
}
