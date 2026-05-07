import { useState, useEffect } from "react";
import {
  FileCheck,
  History,
  Sparkles,
  Check,
  Loader2,
  ChevronRight,
  AlertCircle,
  Trash2,
  Upload,
  X,
  Mail,
  FileText as FileTextIcon,
  Image as ImageIcon,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { db } from "@/lib/db";
import { openCompose } from "@/lib/email-compose";
import { request as claudeRequest } from "@/lib/claude";
import { useAppStore } from "@/stores/appStore";
import type { Formation, Group, Learner, Correction, CriteriaGrid, GeneratedContent } from "@/types";
import type { ClaudeContentBlock } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CorrectionDetailDialog } from "./CorrectionDetailDialog";

// ─── Types locaux ───────────────────────────────────────────────────────────

type Tab = "new" | "history";

interface CorrectionWithDetails extends Correction {
  learner_first_name?: string;
  learner_last_name?: string;
  content_title?: string;
}

interface HistoryItem {
  // Soit une correction individuelle, soit une correction de groupe
  kind: "single" | "group";
  // Pour single : la ligne. Pour group : la première ligne du groupe (représentative).
  rep: CorrectionWithDetails;
  // Tous les apprenants concernés (1 pour single, N pour group)
  members: CorrectionWithDetails[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

function labelForContentType(t: string): string {
  switch (t) {
    case "course": return "Cours";
    case "exercise_individual": return "Ex. individuel";
    case "exercise_small_group": return "Ex. petit groupe";
    case "exercise_collective": return "Ex. collectif";
    case "pedagogical_game": return "Jeu péda";
    case "role_play": return "Mise en situation";
    case "trainer_sheet": return "Fiche formateur";
    default: return t;
  }
}

// ─── Composant principal ────────────────────────────────────────────────────

export function CorrectionsPage() {
  const { activeCentreId, addApiCost } = useAppStore();
  const [senderEmail, setSenderEmail] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("new");

  // Cascading selectors
  const [formations, setFormations] = useState<Formation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [contents, setContents] = useState<GeneratedContent[]>([]);

  const [selectedFormationId, setSelectedFormationId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<string[]>([]);
  const [selectedContentId, setSelectedContentId] = useState("");

  // Submission
  const [submissionText, setSubmissionText] = useState("");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  // AI correction state
  const [correcting, setCorrecting] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<{
    grade: number;
    maxGrade: number;
    feedback: string;
    criteriaGrid: CriteriaGrid;
    model: string;
  } | null>(null);

  // Validation
  const [adjustedGrade, setAdjustedGrade] = useState("");
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCorrectionId, setSavedCorrectionId] = useState<string | null>(null);

  // History (groupé par group_correction_id si présent)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Errors
  const [error, setError] = useState("");

  // ─── Data loading ───────────────────────────────────────────────────────

  useEffect(() => {
    loadFormations();
    if (activeCentreId) {
      db.query<{ smtp_from_email: string | null; email: string | null }>(
        "SELECT smtp_from_email, email FROM centres WHERE id = ?",
        [activeCentreId],
      ).then((rows) => {
        const r = rows[0];
        setSenderEmail(r?.smtp_from_email ?? r?.email ?? "");
      }).catch(() => {});
    }
  }, [activeCentreId]);

  useEffect(() => {
    if (selectedFormationId) {
      loadGroups();
      loadContents();
    } else {
      setGroups([]);
      setContents([]);
      setSelectedGroupId("");
      setSelectedContentId("");
    }
  }, [selectedFormationId]);

  useEffect(() => {
    if (selectedGroupId) {
      loadLearners();
    } else {
      setLearners([]);
      setSelectedLearnerIds([]);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab]);

  async function loadFormations() {
    try {
      const centreIds: string[] = [];
      if (activeCentreId) {
        centreIds.push(activeCentreId);
      } else {
        const allCentres = await db.query<{ id: string }>(
          "SELECT id FROM centres WHERE archived_at IS NULL",
        );
        centreIds.push(...allCentres.map((c) => c.id));
      }

      const all: Formation[] = [];
      for (const cid of centreIds) {
        const rows = (await db.getFormations(cid)) as unknown as Formation[];
        all.push(...rows);
      }
      setFormations(all);

      if (all.length > 0 && !selectedFormationId) {
        setSelectedFormationId(all[0]!.id);
      }
    } catch {
      setError("Impossible de charger les formations.");
    }
  }

  async function loadGroups() {
    const rows = (await db.getGroups(selectedFormationId)) as unknown as Group[];
    setGroups(rows);
    setSelectedGroupId("");
    setLearners([]);
    setSelectedLearnerIds([]);
  }

  async function loadLearners() {
    const rows = (await db.getLearners(selectedGroupId)) as unknown as Learner[];
    setLearners(rows);
    setSelectedLearnerIds([]);
  }

  async function loadContents() {
    const rows = (await db.getContents(selectedFormationId)) as unknown as GeneratedContent[];
    // On garde les contenus susceptibles d'être corrigés : exercices, mises en situation,
    // jeux pédagogiques, fiches formateur, et cours (Claude inclut souvent des exercices dedans).
    const corrigeables = rows.filter((c) =>
      c.content_type.startsWith("exercise") ||
      c.content_type === "role_play" ||
      c.content_type === "pedagogical_game" ||
      c.content_type === "trainer_sheet" ||
      c.content_type === "course",
    );
    setContents(corrigeables);
    setSelectedContentId("");
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const rows = await db.query<CorrectionWithDetails>(
        `SELECT c.*, l.first_name as learner_first_name, l.last_name as learner_last_name,
                gc.title as content_title
         FROM corrections c
         LEFT JOIN learners l ON c.learner_id = l.id
         LEFT JOIN generated_contents gc ON c.content_id = gc.id
         ORDER BY c.created_at DESC
         LIMIT 200`,
      );
      // Regrouper par group_correction_id
      const groups = new Map<string, CorrectionWithDetails[]>();
      const items: HistoryItem[] = [];
      for (const r of rows) {
        if (r.group_correction_id) {
          const arr = groups.get(r.group_correction_id) ?? [];
          arr.push(r);
          groups.set(r.group_correction_id, arr);
        } else {
          items.push({ kind: "single", rep: r, members: [r] });
        }
      }
      for (const members of groups.values()) {
        members.sort((a, b) => `${a.learner_last_name ?? ""}${a.learner_first_name ?? ""}`
          .localeCompare(`${b.learner_last_name ?? ""}${b.learner_first_name ?? ""}`));
        items.push({ kind: "group", rep: members[0]!, members });
      }
      // Tri global par date desc (rep.created_at)
      items.sort((a, b) => (a.rep.created_at < b.rep.created_at ? 1 : -1));
      setHistory(items.slice(0, 100));
    } catch {
      setError("Impossible de charger l'historique.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // ─── AI Correction ─────────────────────────────────────────────────────

  async function handleCorrect() {
    if (selectedLearnerIds.length === 0) return;
    if (!submissionFile && !submissionText.trim()) return;

    setError("");
    setCorrecting(true);
    setCorrectionResult(null);
    setValidated(false);

    try {
      const selectedContent = contents.find((c) => c.id === selectedContentId);
      const selectedLearners = learners.filter((l) => selectedLearnerIds.includes(l.id));
      const isGroup = selectedLearners.length > 1;

      const exerciseContext = selectedContent
        ? `<exercice_reference titre="${selectedContent.title}">\n${selectedContent.content_markdown}\n</exercice_reference>`
        : "Aucun exercice de référence fourni.";

      const learnerContext = isGroup
        ? `Travail réalisé en groupe par les apprenants suivants :\n${selectedLearners
            .map((l) => `- ${l.first_name} ${l.last_name}${l.specific_needs ? ` (besoins spécifiques : ${l.specific_needs})` : ""}`)
            .join("\n")}\n\nNote unique de groupe — la même note s'appliquera à chacun.`
        : selectedLearners[0]
          ? `Apprenant : ${selectedLearners[0].first_name} ${selectedLearners[0].last_name}${
              selectedLearners[0].specific_needs ? ` (besoins specifiques : ${selectedLearners[0].specific_needs})` : ""
            }`
          : "";

      const instructions = `---

Corrige cette copie en respectant le format JSON défini dans tes instructions.`;

      let messageContent: string | ClaudeContentBlock[];

      if (submissionFile) {
        const base64 = await fileToBase64(submissionFile);
        const preamble = `${learnerContext}

${exerciseContext}

## Copie de l'apprenant

La copie de l'apprenant est fournie en pièce jointe ci-dessous.`;

        const blocks: ClaudeContentBlock[] = [{ type: "text", text: preamble }];

        if (submissionFile.type === "application/pdf") {
          blocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          });
        } else if (
          submissionFile.type === "image/jpeg" ||
          submissionFile.type === "image/png" ||
          submissionFile.type === "image/gif" ||
          submissionFile.type === "image/webp"
        ) {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: submissionFile.type, data: base64 },
          });
        } else {
          throw new Error("Format de fichier non supporté.");
        }

        blocks.push({ type: "text", text: instructions });
        messageContent = blocks;
      } else {
        messageContent = `${learnerContext}

${exerciseContext}

<copie_apprenant>
${submissionText.trim()}
</copie_apprenant>

${instructions}`;
      }

      const response = await claudeRequest({
        task: "correction",
        messages: [{ role: "user", content: messageContent }],
      });

      addApiCost(response.costEuros);

      // Parse the JSON response — 3 tentatives : bloc ```json```, regex greedy, réponse brute
      const codeBlock = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/s);
      const rawJson =
        codeBlock?.[1] ??
        response.content.match(/\{[\s\S]*\}/)?.[0] ??
        (response.content.trim().startsWith("{") ? response.content.trim() : undefined);
      if (!rawJson) {
        throw new Error("La réponse de Claude ne contient pas de JSON valide. Réessaie.");
      }

      let parsed: {
        grade: number;
        feedback: string;
        criteria: Array<{
          criterion: string;
          max_points: number;
          awarded_points: number;
          comment: string;
        }>;
        general_comment: string;
      };
      try {
        parsed = JSON.parse(rawJson) as typeof parsed;
      } catch {
        throw new Error("Claude n'a pas renvoyé un JSON valide. Réessaie — cela arrive parfois avec des exercices très longs.");
      }

      const grid: CriteriaGrid = {
        criteria: parsed.criteria.map((c) => ({
          criterion: c.criterion,
          max_points: c.max_points,
          awarded_points: c.awarded_points,
          comment: c.comment,
        })),
        general_comment: parsed.general_comment,
      };

      setCorrectionResult({
        grade: parsed.grade,
        maxGrade: 20,
        feedback: parsed.feedback,
        criteriaGrid: grid,
        model: response.model,
      });
      setAdjustedGrade(String(parsed.grade));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de la correction. Reessaie.",
      );
    } finally {
      setCorrecting(false);
    }
  }

  // ─── Validate & Save ───────────────────────────────────────────────────

  async function handleValidate() {
    if (!correctionResult || selectedLearnerIds.length === 0) return;

    setSaving(true);
    setError("");

    try {
      const finalGrade = parseFloat(adjustedGrade);
      if (isNaN(finalGrade) || finalGrade < 0 || finalGrade > correctionResult.maxGrade) {
        setError(`La note doit etre entre 0 et ${correctionResult.maxGrade}.`);
        setSaving(false);
        return;
      }

      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      const storedSubmission = submissionFile
        ? `[Fichier importé : ${submissionFile.name}]`
        : submissionText.trim();
      const isGroup = selectedLearnerIds.length > 1;
      const groupCorrectionId = isGroup ? db.generateId() : null;

      // Une ligne par apprenant — chacun garde sa progression individuelle.
      // Les lignes d'un groupe partagent le même group_correction_id.
      const firstId = db.generateId();
      let i = 0;
      for (const learnerId of selectedLearnerIds) {
        const id = i === 0 ? firstId : db.generateId();
        await db.execute(
          `INSERT INTO corrections (id, learner_id, content_id, submission_text, grade, max_grade, feedback_markdown, criteria_grid, model_used, validated, group_correction_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            id,
            learnerId,
            selectedContentId || null,
            storedSubmission,
            finalGrade,
            correctionResult.maxGrade,
            correctionResult.feedback,
            JSON.stringify(correctionResult.criteriaGrid),
            correctionResult.model,
            groupCorrectionId,
            now,
            now,
          ],
        );
        i++;
      }

      setValidated(true);
      setSavedCorrectionId(firstId);
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Reset ─────────────────────────────────────────────────────────────

  function handleNewCorrection() {
    setSubmissionText("");
    setSubmissionFile(null);
    setCorrectionResult(null);
    setValidated(false);
    setAdjustedGrade("");
    setError("");
    setSavedCorrectionId(null);
    setSelectedLearnerIds([]);
  }

  // ─── Grade color helper ────────────────────────────────────────────────

  function gradeColor(grade: number, max: number): string {
    const ratio = grade / max;
    if (ratio >= 0.8) return "text-green-600";
    if (ratio >= 0.6) return "text-yellow-600";
    if (ratio >= 0.4) return "text-orange-500";
    return "text-red-600";
  }

  function gradeBg(grade: number, max: number): string {
    const ratio = grade / max;
    if (ratio >= 0.8) return "bg-green-50 border-green-200";
    if (ratio >= 0.6) return "bg-yellow-50 border-yellow-200";
    if (ratio >= 0.4) return "bg-orange-50 border-orange-200";
    return "bg-red-50 border-red-200";
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────

  const canCorrect = Boolean(
    selectedLearnerIds.length > 0 &&
      (submissionText.trim().length > 0 || submissionFile) &&
      !correcting &&
      !correctionResult
  );

  async function handleFileSelect(file: File | null) {
    setError("");
    if (!file) {
      setSubmissionFile(null);
      return;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      const text = await file.text();
      setSubmissionText(text);
      setSubmissionFile(null);
      return;
    }
    if (name.endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setSubmissionText(result.value);
        setSubmissionFile(null);
        return;
      } catch (err) {
        console.error("Lecture .docx:", err);
        setError("Impossible de lire ce fichier .docx. Essaie de l'exporter en PDF.");
        return;
      }
    }
    if (
      file.type === "application/pdf" ||
      file.type === "image/jpeg" ||
      file.type === "image/png" ||
      file.type === "image/gif" ||
      file.type === "image/webp"
    ) {
      setSubmissionFile(file);
      setSubmissionText("");
      return;
    }
    setError(
      "Format non supporté. Utilise .txt, .md, .docx, .pdf, .png, .jpg, .webp.",
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Corrections</h1>
          <p className="text-sm text-muted-foreground">
            Corrige les copies de tes apprenants avec l'aide de Claude
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        <button
          onClick={() => setActiveTab("new")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "new"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCheck className="h-4 w-4" />
          Nouvelle correction
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" />
          Historique
        </button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {activeTab === "new" ? (
        <NewCorrectionTab
          formations={formations}
          groups={groups}
          learners={learners}
          contents={contents}
          selectedFormationId={selectedFormationId}
          selectedGroupId={selectedGroupId}
          selectedLearnerIds={selectedLearnerIds}
          selectedContentId={selectedContentId}
          submissionText={submissionText}
          submissionFile={submissionFile}
          correcting={correcting}
          correctionResult={correctionResult}
          adjustedGrade={adjustedGrade}
          validated={validated}
          saving={saving}
          canCorrect={canCorrect}
          onFormationChange={(id) => { setSelectedFormationId(id); setError(""); }}
          onGroupChange={(id) => { setSelectedGroupId(id); setError(""); }}
          onLearnersChange={(ids) => { setSelectedLearnerIds(ids); setError(""); }}
          onContentChange={(id) => { setSelectedContentId(id); setError(""); }}
          onSubmissionChange={setSubmissionText}
          onFileSelect={handleFileSelect}
          onCorrect={handleCorrect}
          onGradeChange={setAdjustedGrade}
          onValidate={handleValidate}
          onNewCorrection={handleNewCorrection}
          savedCorrectionId={savedCorrectionId}
          gradeColor={gradeColor}
          gradeBg={gradeBg}
          senderEmail={senderEmail}
        />
      ) : (
        <HistoryTab
          history={history}
          loading={historyLoading}
          gradeColor={gradeColor}
          onDeleted={loadHistory}
        />
      )}
    </div>
  );
}

// ─── Onglet Nouvelle correction ─────────────────────────────────────────────

function NewCorrectionTab({
  formations,
  groups,
  learners,
  contents,
  selectedFormationId,
  selectedGroupId,
  selectedLearnerIds,
  selectedContentId,
  submissionText,
  submissionFile,
  correcting,
  correctionResult,
  adjustedGrade,
  validated,
  saving,
  canCorrect,
  onFormationChange,
  onGroupChange,
  onLearnersChange,
  onContentChange,
  onSubmissionChange,
  onFileSelect,
  onCorrect,
  onGradeChange,
  onValidate,
  onNewCorrection,
  savedCorrectionId,
  gradeColor,
  gradeBg,
  senderEmail,
}: {
  formations: Formation[];
  groups: Group[];
  learners: Learner[];
  contents: GeneratedContent[];
  selectedFormationId: string;
  selectedGroupId: string;
  selectedLearnerIds: string[];
  selectedContentId: string;
  submissionText: string;
  submissionFile: File | null;
  correcting: boolean;
  correctionResult: {
    grade: number;
    maxGrade: number;
    feedback: string;
    criteriaGrid: CriteriaGrid;
    model: string;
  } | null;
  adjustedGrade: string;
  validated: boolean;
  saving: boolean;
  canCorrect: boolean;
  onFormationChange: (id: string) => void;
  onGroupChange: (id: string) => void;
  onLearnersChange: (ids: string[]) => void;
  onContentChange: (id: string) => void;
  onSubmissionChange: (text: string) => void;
  onFileSelect: (file: File | null) => void;
  onCorrect: () => void;
  onGradeChange: (grade: string) => void;
  onValidate: () => void;
  onNewCorrection: () => void;
  savedCorrectionId: string | null;
  gradeColor: (grade: number, max: number) => string;
  gradeBg: (grade: number, max: number) => string;
  senderEmail: string;
}) {
  const isGroupCorrection = selectedLearnerIds.length > 1;
  const selectedLearners = learners.filter((l) => selectedLearnerIds.includes(l.id));

  function toggleLearner(id: string) {
    if (selectedLearnerIds.includes(id)) {
      onLearnersChange(selectedLearnerIds.filter((x) => x !== id));
    } else {
      onLearnersChange([...selectedLearnerIds, id]);
    }
  }
  function toggleAll() {
    if (selectedLearnerIds.length === learners.length) {
      onLearnersChange([]);
    } else {
      onLearnersChange(learners.map((l) => l.id));
    }
  }
  const [emailSent, setEmailSent] = useState(false);

  async function handleSendEmailDirect() {
    // Email rapide : seulement pour correction individuelle
    const learner = selectedLearners[0];
    if (selectedLearnerIds.length !== 1 || !learner?.email) return;

    const contentTitle = contents.find((c) => c.id === selectedContentId)?.title;
    const subject = `Correction : ${contentTitle ?? "ton exercice"}`;
    const noteLine = `Note : ${adjustedGrade}/20\n\n`;
    const gridLines = correctionResult?.criteriaGrid?.criteria
      .map((c) => `- ${c.criterion} : ${c.awarded_points}/${c.max_points} — ${c.comment}`)
      .join("\n") ?? "";
    const generalComment = correctionResult?.criteriaGrid?.general_comment
      ? `\n\nCommentaire général :\n${correctionResult.criteriaGrid.general_comment}`
      : "";

    const body = `Bonjour ${learner.first_name},\n\nVoici le retour sur ${contentTitle ?? "ton exercice"}.\n\n${noteLine}${gridLines}${generalComment}\n\nBon courage pour la suite.`;
    const trimmed = body.length > 1800 ? body.slice(0, 1800) + "…" : body;
    await openCompose(senderEmail, learner.email, subject, trimmed);

    if (savedCorrectionId) {
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      await db.execute(
        `UPDATE corrections SET sent_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, savedCorrectionId],
      );
    }
    setEmailSent(true);
  }

  if (validated) {
    const isGroup = selectedLearnerIds.length > 1;
    const soloLearner = !isGroup ? selectedLearners[0] : undefined;
    const hasEmail = Boolean(soloLearner?.email);

    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">
          {isGroup ? "Correction de groupe enregistrée" : "Correction enregistrée"}
        </h2>
        <p className="text-muted-foreground text-center">
          La note de {adjustedGrade}/20 a été sauvegardée
          {isGroup ? ` pour ${selectedLearnerIds.length} apprenants.` : "."}
        </p>
        {isGroup && (
          <p className="text-xs text-muted-foreground text-center max-w-md">
            Chaque apprenant garde la note dans sa progression individuelle. Tu peux envoyer un email depuis l'historique pour chacun.
          </p>
        )}
        <div className="flex gap-3">
          {!isGroup && (
            <Button
              variant="outline"
              onClick={handleSendEmailDirect}
              disabled={!hasEmail || emailSent}
              title={!hasEmail ? "Aucun email enregistré pour cet apprenant" : undefined}
            >
              {emailSent ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              {emailSent ? "Email ouvert" : "Envoyer par email"}
            </Button>
          )}
          <Button onClick={onNewCorrection}>
            <FileCheck className="h-4 w-4" />
            Nouvelle correction
          </Button>
        </div>
        {!isGroup && !hasEmail && (
          <p className="text-xs text-muted-foreground">
            Aucun email enregistré pour cet apprenant.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Etape 1 : Selection */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Badge variant="outline" className="text-xs">1</Badge>
            Sélection des apprenants
          </div>
          {isGroupCorrection && (
            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
              Correction de groupe — {selectedLearnerIds.length} apprenants
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Formation</Label>
            <Select
              value={selectedFormationId}
              onChange={(e) => onFormationChange(e.target.value)}
            >
              <option value="">-- Choisis une formation --</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Groupe</Label>
            <Select
              value={selectedGroupId}
              onChange={(e) => onGroupChange(e.target.value)}
              disabled={!selectedFormationId}
            >
              <option value="">-- Choisis un groupe --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>
              Apprenants
              {selectedLearnerIds.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({selectedLearnerIds.length} sélectionné{selectedLearnerIds.length > 1 ? "s" : ""})
                </span>
              )}
            </Label>
            {learners.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-primary hover:underline"
              >
                {selectedLearnerIds.length === learners.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            )}
          </div>
          {!selectedGroupId ? (
            <p className="text-xs text-muted-foreground">Choisis d'abord un groupe.</p>
          ) : learners.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun apprenant dans ce groupe.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {learners.map((l) => {
                const checked = selectedLearnerIds.includes(l.id);
                return (
                  <label
                    key={l.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      checked ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-background"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={checked}
                      onChange={() => toggleLearner(l.id)}
                    />
                    <span className="truncate">{l.first_name} {l.last_name}</span>
                  </label>
                );
              })}
            </div>
          )}
          {isGroupCorrection && (
            <p className="text-xs text-muted-foreground">
              La même note sera attribuée à chacun et comptera dans la progression individuelle des {selectedLearnerIds.length} apprenants.
            </p>
          )}
        </div>
      </div>

      {/* Etape 2 : Contenu de reference */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Badge variant="outline" className="text-xs">2</Badge>
          Exercice ou cours (optionnel)
        </div>

        <div className="space-y-1.5">
          <Label>Contenu de référence</Label>
          <Select
            value={selectedContentId}
            onChange={(e) => onContentChange(e.target.value)}
            disabled={!selectedFormationId}
          >
            <option value="">-- Aucun contenu sélectionné --</option>
            {contents.map((c) => (
              <option key={c.id} value={c.id}>
                [{labelForContentType(c.content_type)}] {c.title}
              </option>
            ))}
          </Select>
          {contents.length === 0 && selectedFormationId && (
            <p className="text-xs text-muted-foreground">
              Aucun contenu généré pour cette formation.
            </p>
          )}
        </div>
      </div>

      {/* Etape 3 : Copie */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Badge variant="outline" className="text-xs">3</Badge>
          Copie de l'apprenant
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Copie à corriger</Label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Importer un fichier
              <input
                type="file"
                accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown"
                className="hidden"
                disabled={correcting || !!correctionResult}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onFileSelect(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {submissionFile ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              {submissionFile.type.startsWith("image/") ? (
                <ImageIcon className="h-5 w-5 shrink-0 text-primary" />
              ) : (
                <FileTextIcon className="h-5 w-5 shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{submissionFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(submissionFile.size / 1024).toFixed(1)} Ko — Claude lira directement ce fichier
                </p>
              </div>
              <button
                type="button"
                onClick={() => onFileSelect(null)}
                disabled={correcting || !!correctionResult}
                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
                aria-label="Retirer le fichier"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Textarea
                id="submission"
                value={submissionText}
                onChange={(e) => onSubmissionChange(e.target.value)}
                placeholder="Colle ici le texte de la copie de l'apprenant, ou importe un fichier (Word, PDF, image, .txt/.md)..."
                rows={8}
                disabled={correcting || !!correctionResult}
              />
              <p className="text-xs text-muted-foreground">
                {submissionText.length} caractère(s)
              </p>
            </>
          )}
        </div>

        <Button
          onClick={onCorrect}
          disabled={!canCorrect}
          className="w-full sm:w-auto"
        >
          {correcting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Correction en cours...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Corriger avec Claude
            </>
          )}
        </Button>
      </div>

      {/* Etape 4 : Resultats */}
      {correctionResult && (
        <div className="space-y-4">
          {/* Note globale */}
          <div className={`rounded-xl border p-6 ${gradeBg(correctionResult.grade, correctionResult.maxGrade)}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Note suggeree par Claude</p>
                <p className={`text-4xl font-bold ${gradeColor(correctionResult.grade, correctionResult.maxGrade)}`}>
                  {correctionResult.grade}/{correctionResult.maxGrade}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {correctionResult.model}
              </Badge>
            </div>
          </div>

          {/* Grille de criteres */}
          {correctionResult.criteriaGrid.criteria.length > 0 && (
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <h3 className="font-semibold">Grille de criteres</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Critere</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground text-center w-24">Points</th>
                      <th className="pb-2 font-medium text-muted-foreground">Commentaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correctionResult.criteriaGrid.criteria.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{c.criterion}</td>
                        <td className="py-2.5 pr-4 text-center">
                          <span className={gradeColor(c.awarded_points, c.max_points)}>
                            {c.awarded_points}
                          </span>
                          <span className="text-muted-foreground">/{c.max_points}</span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{c.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {correctionResult.criteriaGrid.general_comment && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm font-medium">Commentaire general</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {correctionResult.criteriaGrid.general_comment}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Feedback detaille */}
          <div className="rounded-xl border bg-card p-6 space-y-3">
            <h3 className="font-semibold">Feedback detaille</h3>
            <div className="prose prose-sm max-w-none text-sm text-muted-foreground whitespace-pre-wrap">
              {correctionResult.feedback}
            </div>
          </div>

          {/* Validation */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Badge variant="outline" className="text-xs">4</Badge>
              Validation
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="final-grade">Note finale</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="final-grade"
                    type="number"
                    min={0}
                    max={correctionResult.maxGrade}
                    step={0.5}
                    value={adjustedGrade}
                    onChange={(e) => onGradeChange(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">/ {correctionResult.maxGrade}</span>
                </div>
              </div>

              <div className="ml-auto">
                <Button onClick={onValidate} disabled={saving || !adjustedGrade}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Valider et enregistrer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Historique ──────────────────────────────────────────────────────

function HistoryTab({
  history,
  loading,
  gradeColor,
  onDeleted,
}: {
  history: HistoryItem[];
  loading: boolean;
  gradeColor: (grade: number, max: number) => string;
  onDeleted: () => void;
}) {
  const [toDelete, setToDelete] = useState<HistoryItem | null>(null);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <History className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Aucune correction pour l'instant.</p>
      </div>
    );
  }

  function formatMembers(item: HistoryItem): string {
    return item.members
      .map((m) => `${m.learner_first_name ?? ""} ${m.learner_last_name ?? ""}`.trim())
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="space-y-3">
      {history.map((item) => {
        const c = item.rep;
        const isGroup = item.kind === "group";
        const memberCount = item.members.length;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpenDetailId(c.id)}
            className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
          >
            {/* Initiales / icône groupe */}
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isGroup ? "bg-purple-100 text-purple-700" : "bg-muted text-muted-foreground"
            }`}>
              {isGroup
                ? `+${memberCount}`
                : `${(c.learner_first_name?.[0] ?? "?")}${(c.learner_last_name?.[0] ?? "?")}`}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">
                  {isGroup
                    ? formatMembers(item)
                    : `${c.learner_first_name ?? "Inconnu"} ${c.learner_last_name ?? ""}`}
                </p>
                {isGroup && (
                  <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 shrink-0">
                    Groupe
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {c.content_title ?? "Sans exercice"} — {new Date(c.created_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {/* Note */}
            {c.grade != null && (
              <div className="text-right">
                <span className={`text-lg font-bold ${gradeColor(c.grade, c.max_grade)}`}>
                  {c.grade}
                </span>
                <span className="text-sm text-muted-foreground">/{c.max_grade}</span>
              </div>
            )}

            {/* Statut */}
            {c.validated ? (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 shrink-0">
                Validee
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                Brouillon
              </Badge>
            )}

            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setToDelete(item); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setToDelete(item); } }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
              aria-label="Supprimer la correction"
            >
              <Trash2 className="h-4 w-4" />
            </span>

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}

      {openDetailId && (
        <CorrectionDetailDialog
          correctionId={openDetailId}
          onClose={() => setOpenDetailId(null)}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete?.kind === "group" ? "Supprimer la correction de groupe ?" : "Supprimer cette correction ?"}
        message={
          toDelete?.kind === "group"
            ? `Cette correction concerne ${toDelete.members.length} apprenants : ${toDelete.members
                .map((m) => `${m.learner_first_name ?? ""} ${m.learner_last_name ?? ""}`.trim())
                .filter(Boolean)
                .join(", ")}.\n\nLa note sera retirée de la progression de chacun. Cette action est irréversible.`
            : `Correction de ${toDelete?.rep.learner_first_name ?? ""} ${toDelete?.rep.learner_last_name ?? ""}.\n\nCette action est irréversible.`
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!toDelete) return;
          for (const m of toDelete.members) {
            await db.deleteCorrection(m.id);
          }
          setToDelete(null);
          onDeleted();
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
