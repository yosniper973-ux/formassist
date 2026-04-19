import { useEffect, useState } from "react";
import { X, Mail, Download, Loader2, Check } from "lucide-react";
import { db } from "@/lib/db";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import type { Correction, CriteriaGrid } from "@/types/correction";
import type { Learner } from "@/types/learner";

interface Props {
  correctionId: string;
  onClose: () => void;
}

interface FullCorrection extends Correction {
  learner?: Learner;
  content_title?: string;
}

export function CorrectionDetailDialog({ correctionId, onClose }: Props) {
  const [data, setData] = useState<FullCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadCorrection();
  }, [correctionId]);

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

      setData({
        ...raw,
        criteria_grid: grid,
        validated: Boolean(raw.validated),
        ocr_used: Boolean(raw.ocr_used),
        learner: learners[0],
        content_title: raw.content_title ?? undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  function buildMarkdown(): string {
    if (!data) return "";
    const learnerName = data.learner
      ? `${data.learner.first_name} ${data.learner.last_name}`
      : "Apprenant";
    const lines: string[] = [];
    lines.push(`# Correction — ${learnerName}`);
    lines.push("");
    lines.push("| Rubrique | Détail |");
    lines.push("|----------|--------|");
    lines.push(`| Apprenant | ${learnerName} |`);
    if (data.content_title) lines.push(`| Exercice | ${data.content_title} |`);
    if (data.grade != null) lines.push(`| Note | **${data.grade} / ${data.max_grade}** |`);
    lines.push(`| Date | ${new Date(data.created_at).toLocaleDateString("fr-FR")} |`);
    lines.push("");

    if (data.criteria_grid && data.criteria_grid.criteria.length > 0) {
      lines.push("## Grille d'évaluation");
      lines.push("");
      lines.push("| Critère | Points | Commentaire |");
      lines.push("|---------|:------:|-------------|");
      for (const c of data.criteria_grid.criteria) {
        lines.push(`| ${c.criterion} | ${c.awarded_points} / ${c.max_points} | ${c.comment} |`);
      }
      lines.push("");
      if (data.criteria_grid.general_comment) {
        lines.push("> [!info] Commentaire général");
        lines.push(`> ${data.criteria_grid.general_comment}`);
        lines.push("");
      }
    }

    if (data.feedback_markdown) {
      lines.push("## Feedback détaillé");
      lines.push("");
      lines.push(data.feedback_markdown);
      lines.push("");
    }

    return lines.join("\n");
  }

  async function handleExportWord() {
    if (!data) return;
    try {
      const md = buildMarkdown();
      const blob = await markdownToDocx(md);
      const learnerName = data.learner
        ? `${data.learner.first_name}_${data.learner.last_name}`
        : "apprenant";
      const savedPath = await downloadDocx(blob, `Correction_${learnerName}`);
      if (savedPath) {
        setToast(`Enregistré : ${savedPath.split(/[\\/]/).pop()}`);
        setTimeout(() => setToast(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setToast("Erreur lors de l'export Word");
      setTimeout(() => setToast(null), 5000);
    }
  }

  async function handleSendEmail() {
    if (!data || !data.learner?.email) return;
    setSending(true);
    try {
      const learnerName = `${data.learner.first_name} ${data.learner.last_name}`;
      const subject = `Correction : ${data.content_title ?? "ton exercice"}`;
      const noteLine = data.grade != null ? `Note : ${data.grade}/${data.max_grade}\n\n` : "";
      const gridLines = data.criteria_grid?.criteria
        .map((c) => `- ${c.criterion} : ${c.awarded_points}/${c.max_points} — ${c.comment}`)
        .join("\n") ?? "";
      const generalComment = data.criteria_grid?.general_comment
        ? `\n\nCommentaire général :\n${data.criteria_grid.general_comment}`
        : "";
      const feedback = data.feedback_markdown
        ? `\n\n${stripMarkdown(data.feedback_markdown)}`
        : "";

      const body = `Bonjour ${data.learner.first_name},

Voici le retour sur ${data.content_title ?? "ton exercice"}.

${noteLine}${gridLines}${generalComment}${feedback}

Bon courage pour la suite.`;

      const trimmedBody = body.length > 1800 ? body.slice(0, 1800) + "…" : body;
      const mailto = `mailto:${encodeURIComponent(data.learner.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(trimmedBody)}`;
      window.location.href = mailto;

      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      await db.execute(
        `UPDATE corrections SET sent_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, data.id],
      );
      setData({ ...data, sent_at: now });
      setToast(`Email ouvert pour ${learnerName}`);
      setTimeout(() => setToast(null), 4000);
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

  return (
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
                <h2 className="text-lg font-semibold">
                  {data.learner?.first_name} {data.learner?.last_name}
                </h2>
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
                  {data.sent_at && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      <Check className="h-3 w-3" /> Envoyée le {new Date(data.sent_at).toLocaleDateString("fr-FR")}
                    </Badge>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
              <p className="text-xs text-muted-foreground">
                {data.learner?.email
                  ? `Email : ${data.learner.email}`
                  : "Aucun email enregistré pour cet apprenant"}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportWord}>
                  <Download className="h-3.5 w-3.5" /> Word
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={!data.learner?.email || sending}
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Envoyer par email
                </Button>
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
    </div>
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
