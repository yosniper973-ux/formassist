import { useState, useEffect } from "react";
import {
  FileCheck,
  History,
  Sparkles,
  Check,
  Loader2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { db } from "@/lib/db";
import { request as claudeRequest } from "@/lib/claude";
import { useAppStore } from "@/stores/appStore";
import type { Formation, Group, Learner, Correction, CriteriaGrid, GeneratedContent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

// ─── Types locaux ───────────────────────────────────────────────────────────

type Tab = "new" | "history";

interface CorrectionWithDetails extends Correction {
  learner_first_name?: string;
  learner_last_name?: string;
  content_title?: string;
}

// ─── Composant principal ────────────────────────────────────────────────────

export function CorrectionsPage() {
  const { activeCentreId, addApiCost } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("new");

  // Cascading selectors
  const [formations, setFormations] = useState<Formation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [contents, setContents] = useState<GeneratedContent[]>([]);

  const [selectedFormationId, setSelectedFormationId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [selectedContentId, setSelectedContentId] = useState("");

  // Submission
  const [submissionText, setSubmissionText] = useState("");

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

  // History
  const [history, setHistory] = useState<CorrectionWithDetails[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Errors
  const [error, setError] = useState("");

  // ─── Data loading ───────────────────────────────────────────────────────

  useEffect(() => {
    loadFormations();
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
      setSelectedLearnerId("");
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
    setSelectedLearnerId("");
  }

  async function loadLearners() {
    const rows = (await db.getLearners(selectedGroupId)) as unknown as Learner[];
    setLearners(rows);
    setSelectedLearnerId("");
  }

  async function loadContents() {
    const rows = (await db.getContents(selectedFormationId)) as unknown as GeneratedContent[];
    // Filter to exercise types only
    const exercises = rows.filter((c) =>
      c.content_type.startsWith("exercise") ||
      c.content_type === "role_play" ||
      c.content_type === "pedagogical_game",
    );
    setContents(exercises);
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
         LIMIT 50`,
      );
      setHistory(rows);
    } catch {
      setError("Impossible de charger l'historique.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // ─── AI Correction ─────────────────────────────────────────────────────

  async function handleCorrect() {
    if (!selectedLearnerId || !submissionText.trim()) return;

    setError("");
    setCorrecting(true);
    setCorrectionResult(null);
    setValidated(false);

    try {
      const selectedContent = contents.find((c) => c.id === selectedContentId);
      const selectedLearner = learners.find((l) => l.id === selectedLearnerId);

      const exerciseContext = selectedContent
        ? `## Exercice : ${selectedContent.title}\n\n${selectedContent.content_markdown}`
        : "Aucun exercice de reference fourni.";

      const learnerContext = selectedLearner
        ? `Apprenant : ${selectedLearner.first_name} ${selectedLearner.last_name}${
            selectedLearner.specific_needs ? ` (besoins specifiques : ${selectedLearner.specific_needs})` : ""
          }`
        : "";

      const userMessage = `${learnerContext}

${exerciseContext}

## Copie de l'apprenant

${submissionText.trim()}

---

Corrige cette copie. Reponds en JSON avec cette structure exacte :
{
  "grade": <number entre 0 et 20>,
  "feedback": "<feedback detaille en markdown>",
  "criteria": [
    {
      "criterion": "<nom du critere>",
      "max_points": <number>,
      "awarded_points": <number>,
      "comment": "<commentaire>"
    }
  ],
  "general_comment": "<commentaire general>"
}`;

      const response = await claudeRequest({
        task: "correction",
        messages: [{ role: "user", content: userMessage }],
      });

      addApiCost(response.costEuros);

      // Parse the JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("La reponse de Claude ne contient pas de JSON valide.");
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
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
    if (!correctionResult || !selectedLearnerId) return;

    setSaving(true);
    setError("");

    try {
      const finalGrade = parseFloat(adjustedGrade);
      if (isNaN(finalGrade) || finalGrade < 0 || finalGrade > correctionResult.maxGrade) {
        setError(`La note doit etre entre 0 et ${correctionResult.maxGrade}.`);
        setSaving(false);
        return;
      }

      const id = db.generateId();
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);

      await db.execute(
        `INSERT INTO corrections (id, learner_id, content_id, submission_text, grade, max_grade, feedback_markdown, criteria_grid, model_used, validated, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          selectedLearnerId,
          selectedContentId || null,
          submissionText.trim(),
          finalGrade,
          correctionResult.maxGrade,
          correctionResult.feedback,
          JSON.stringify(correctionResult.criteriaGrid),
          correctionResult.model,
          now,
          now,
        ],
      );

      setValidated(true);
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Reset ─────────────────────────────────────────────────────────────

  function handleNewCorrection() {
    setSubmissionText("");
    setCorrectionResult(null);
    setValidated(false);
    setAdjustedGrade("");
    setError("");
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
    selectedLearnerId && submissionText.trim().length > 0 && !correcting && !correctionResult
  );

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
          selectedLearnerId={selectedLearnerId}
          selectedContentId={selectedContentId}
          submissionText={submissionText}
          correcting={correcting}
          correctionResult={correctionResult}
          adjustedGrade={adjustedGrade}
          validated={validated}
          saving={saving}
          canCorrect={canCorrect}
          onFormationChange={(id) => { setSelectedFormationId(id); setError(""); }}
          onGroupChange={(id) => { setSelectedGroupId(id); setError(""); }}
          onLearnerChange={(id) => { setSelectedLearnerId(id); setError(""); }}
          onContentChange={(id) => { setSelectedContentId(id); setError(""); }}
          onSubmissionChange={setSubmissionText}
          onCorrect={handleCorrect}
          onGradeChange={setAdjustedGrade}
          onValidate={handleValidate}
          onNewCorrection={handleNewCorrection}
          gradeColor={gradeColor}
          gradeBg={gradeBg}
        />
      ) : (
        <HistoryTab
          history={history}
          loading={historyLoading}
          gradeColor={gradeColor}
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
  selectedLearnerId,
  selectedContentId,
  submissionText,
  correcting,
  correctionResult,
  adjustedGrade,
  validated,
  saving,
  canCorrect,
  onFormationChange,
  onGroupChange,
  onLearnerChange,
  onContentChange,
  onSubmissionChange,
  onCorrect,
  onGradeChange,
  onValidate,
  onNewCorrection,
  gradeColor,
  gradeBg,
}: {
  formations: Formation[];
  groups: Group[];
  learners: Learner[];
  contents: GeneratedContent[];
  selectedFormationId: string;
  selectedGroupId: string;
  selectedLearnerId: string;
  selectedContentId: string;
  submissionText: string;
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
  onLearnerChange: (id: string) => void;
  onContentChange: (id: string) => void;
  onSubmissionChange: (text: string) => void;
  onCorrect: () => void;
  onGradeChange: (grade: string) => void;
  onValidate: () => void;
  onNewCorrection: () => void;
  gradeColor: (grade: number, max: number) => string;
  gradeBg: (grade: number, max: number) => string;
}) {
  if (validated) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Correction enregistree</h2>
        <p className="text-muted-foreground">
          La note de {adjustedGrade}/20 a ete sauvegardee.
        </p>
        <Button onClick={onNewCorrection}>
          <FileCheck className="h-4 w-4" />
          Nouvelle correction
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Etape 1 : Selection */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Badge variant="outline" className="text-xs">1</Badge>
          Selection de l'apprenant
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

          <div className="space-y-1.5">
            <Label>Apprenant</Label>
            <Select
              value={selectedLearnerId}
              onChange={(e) => onLearnerChange(e.target.value)}
              disabled={!selectedGroupId}
            >
              <option value="">-- Choisis un apprenant --</option>
              {learners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.first_name} {l.last_name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Etape 2 : Exercice */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Badge variant="outline" className="text-xs">2</Badge>
          Exercice (optionnel)
        </div>

        <div className="space-y-1.5">
          <Label>Contenu / exercice de reference</Label>
          <Select
            value={selectedContentId}
            onChange={(e) => onContentChange(e.target.value)}
            disabled={!selectedFormationId}
          >
            <option value="">-- Aucun exercice selectionne --</option>
            {contents.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </Select>
          {contents.length === 0 && selectedFormationId && (
            <p className="text-xs text-muted-foreground">
              Aucun exercice genere pour cette formation.
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

        <div className="space-y-1.5">
          <Label htmlFor="submission">Colle ou tape le texte de la copie</Label>
          <Textarea
            id="submission"
            value={submissionText}
            onChange={(e) => onSubmissionChange(e.target.value)}
            placeholder="Colle ici le texte de la copie de l'apprenant..."
            rows={8}
            disabled={correcting || !!correctionResult}
          />
          <p className="text-xs text-muted-foreground">
            {submissionText.length} caractere(s)
          </p>
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
}: {
  history: CorrectionWithDetails[];
  loading: boolean;
  gradeColor: (grade: number, max: number) => string;
}) {
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

  return (
    <div className="space-y-3">
      {history.map((c) => (
        <div key={c.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
          {/* Initiales */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {(c.learner_first_name?.[0] ?? "?")}{(c.learner_last_name?.[0] ?? "?")}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {c.learner_first_name ?? "Inconnu"} {c.learner_last_name ?? ""}
            </p>
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

          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
}
