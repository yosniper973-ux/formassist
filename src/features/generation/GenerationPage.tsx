import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Users,
  User,
  Gamepad2,
  Drama,
  ListChecks,
  Sparkles,
  Copy,
  Save,
  RefreshCw,
  Pencil,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Euro,
  History,
  Wand2,
  FileText,
  AlertTriangle,
  Trash2,
  Download,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { db } from "@/lib/db";
import { request as claudeRequest, estimateCost } from "@/lib/claude";
import { useAppStore } from "@/stores/appStore";
import type { Formation, CCP, Competence, GeneratedContent } from "@/types";
import type { TaskType, ClaudeMessage } from "@/types/api";
import type { ContentType, BloomLevel } from "@/types/content";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Constants ───────────────────────────────────────────────

interface ContentTypeOption {
  value: ContentType;
  label: string;
  description: string;
  icon: React.ReactNode;
  task: TaskType;
}

const CONTENT_TYPES: ContentTypeOption[] = [
  {
    value: "course",
    label: "Cours complet",
    description: "Déroulé pédagogique structuré",
    icon: <BookOpen className="h-5 w-5" />,
    task: "generation_cours",
  },
  {
    value: "exercise_individual",
    label: "Exercice individuel",
    description: "Travail personnel pour un apprenant",
    icon: <User className="h-5 w-5" />,
    task: "generation_exercice",
  },
  {
    value: "exercise_small_group",
    label: "Exercice petit groupe",
    description: "Activité collaborative (3-5 pers.)",
    icon: <Users className="h-5 w-5" />,
    task: "generation_exercice",
  },
  {
    value: "exercise_collective",
    label: "Exercice collectif",
    description: "Activité pour tout le groupe",
    icon: <Users className="h-5 w-5" />,
    task: "generation_exercice",
  },
  {
    value: "pedagogical_game",
    label: "Jeu pédagogique",
    description: "Apprentissage par le jeu",
    icon: <Gamepad2 className="h-5 w-5" />,
    task: "generation_jeu",
  },
  {
    value: "role_play",
    label: "Mise en situation",
    description: "Jeu de rôle / simulation pro",
    icon: <Drama className="h-5 w-5" />,
    task: "generation_mise_en_situation",
  },
  {
    value: "trainer_sheet" as ContentType,
    label: "QCM",
    description: "Quiz à choix multiples",
    icon: <ListChecks className="h-5 w-5" />,
    task: "qcm_simple",
  },
];

const BLOOM_LEVELS: { value: BloomLevel; label: string }[] = [
  { value: "remember", label: "Connaître" },
  { value: "understand", label: "Comprendre" },
  { value: "apply", label: "Appliquer" },
  { value: "analyze", label: "Analyser" },
  { value: "evaluate", label: "Évaluer" },
  { value: "create", label: "Créer" },
];

const CONTENT_TYPE_LABELS: Record<string, string> = {
  course: "Cours",
  exercise_individual: "Exercice individuel",
  exercise_small_group: "Exercice petit groupe",
  exercise_collective: "Exercice collectif",
  pedagogical_game: "Jeu pédagogique",
  role_play: "Mise en situation",
  trainer_sheet: "QCM",
};

// ─── Component ───────────────────────────────────────────────

export function GenerationPage() {
  const { activeCentreId, addApiCost } = useAppStore();

  // Tab
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");

  // Step 1: Formation
  const [formations, setFormations] = useState<Formation[]>([]);
  const [selectedFormationId, setSelectedFormationId] = useState("");
  const [loadingFormations, setLoadingFormations] = useState(false);

  // Step 2: Content type
  const [selectedType, setSelectedType] = useState<ContentTypeOption | null>(null);

  // Step 3: Config
  const [ccps, setCcps] = useState<(CCP & { competences: Competence[] })[]>([]);
  const [selectedCompetenceIds, setSelectedCompetenceIds] = useState<Set<string>>(new Set());
  const [expandedCcps, setExpandedCcps] = useState<Set<string>>(new Set());
  const [bloomLevel, setBloomLevel] = useState<BloomLevel>("apply");
  const [duration, setDuration] = useState("60");
  const [groupSize, setGroupSize] = useState("12");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Step 4: Estimation
  const [costEstimate, setCostEstimate] = useState<{
    estimatedCost: number;
    modelDisplayName: string;
    needsConfirmation: boolean;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Step 5: Generation
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generationModel, setGenerationModel] = useState("");
  const [generationCost, setGenerationCost] = useState(0);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Editing
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");

  // History
  const [history, setHistory] = useState<GeneratedContent[]>([]);
  const [historyFilter, setHistoryFilter] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Error
  const [error, setError] = useState("");

  // ─── Load formations ───

  useEffect(() => {
    if (!activeCentreId) return;
    setLoadingFormations(true);
    db.getFormations(activeCentreId)
      .then((rows) => {
        setFormations(rows as unknown as Formation[]);
      })
      .catch((err) => console.error("Erreur chargement formations :", err))
      .finally(() => setLoadingFormations(false));
  }, [activeCentreId]);

  // ─── Load competences when formation changes ───

  useEffect(() => {
    if (!selectedFormationId) {
      setCcps([]);
      return;
    }
    loadCompetences(selectedFormationId);
  }, [selectedFormationId]);

  async function loadCompetences(formationId: string) {
    try {
      const ccpRows = await db.query<CCP>(
        "SELECT * FROM ccps WHERE formation_id = ? ORDER BY sort_order",
        [formationId],
      );
      const result: (CCP & { competences: Competence[] })[] = [];
      for (const ccp of ccpRows) {
        const comps = await db.query<Competence>(
          "SELECT * FROM competences WHERE ccp_id = ? AND in_scope = 1 ORDER BY sort_order",
          [ccp.id],
        );
        result.push({ ...ccp, competences: comps });
      }
      setCcps(result);
      // Expand all CCPs by default
      setExpandedCcps(new Set(result.map((c) => c.id)));
    } catch (err) {
      console.error("Erreur chargement compétences :", err);
    }
  }

  // ─── Load history ───

  const loadHistory = useCallback(async () => {
    if (!selectedFormationId) return;
    setLoadingHistory(true);
    try {
      const rows = await db.getContents(selectedFormationId);
      setHistory(rows as unknown as GeneratedContent[]);
    } catch (err) {
      console.error("Erreur chargement historique :", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedFormationId]);

  useEffect(() => {
    if (activeTab === "history" && selectedFormationId) {
      loadHistory();
    }
  }, [activeTab, selectedFormationId, loadHistory]);

  // ─── Build prompt ───

  function buildMessages(): ClaudeMessage[] {
    const formation = formations.find((f) => f.id === selectedFormationId);
    const selectedComps = ccps
      .flatMap((c) => c.competences)
      .filter((c) => selectedCompetenceIds.has(c.id));

    const compList = selectedComps
      .map((c) => `- ${c.code} : ${c.title}${c.description ? ` (${c.description})` : ""}`)
      .join("\n");

    const typeLabel = selectedType?.label ?? "contenu";
    const bloomLabel = BLOOM_LEVELS.find((b) => b.value === bloomLevel)?.label ?? bloomLevel;

    let prompt = `Génère un ${typeLabel} pour la formation "${formation?.title ?? ""}".

Compétences ciblées :
${compList || "(aucune compétence sélectionnée)"}

Niveau taxonomique de Bloom : ${bloomLabel}
Durée estimée : ${duration} minutes
Taille du groupe : ${groupSize} apprenants`;

    if (additionalInstructions.trim()) {
      prompt += `\n\nInstructions supplémentaires :\n${additionalInstructions.trim()}`;
    }

    prompt += `\n\nRéponds en français. Structure le contenu en Markdown avec :
- Un titre clair
- Les objectifs pédagogiques
- Le déroulé détaillé
- Les consignes pour le formateur
- Le matériel nécessaire si applicable`;

    return [{ role: "user", content: prompt }];
  }

  // ─── Estimate cost ───

  async function handleEstimate() {
    if (!selectedType) return;
    setEstimating(true);
    setError("");
    setCostEstimate(null);
    try {
      const messages = buildMessages();
      const estimate = await estimateCost(selectedType.task, messages);
      setCostEstimate({
        estimatedCost: estimate.estimatedCost,
        modelDisplayName: estimate.modelDisplayName,
        needsConfirmation: estimate.needsConfirmation,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'estimation");
    } finally {
      setEstimating(false);
    }
  }

  // ─── Generate ───

  async function handleGenerate() {
    if (!selectedType || !selectedFormationId) return;
    setGenerating(true);
    setError("");
    setGeneratedContent("");
    setGeneratedTitle("");
    setSaved(false);
    setCopied(false);
    setEditing(false);

    try {
      const messages = buildMessages();
      const result = await claudeRequest({
        task: selectedType.task,
        messages,
        context: {
          formationId: selectedFormationId,
          groupSize: parseInt(groupSize, 10),
        },
      });

      setGeneratedContent(result.content);
      setGenerationModel(result.model);
      setGenerationCost(result.costEuros);
      addApiCost(result.costEuros);

      // Extract title from first heading
      const titleMatch = result.content.match(/^#\s+(.+)$/m);
      setGeneratedTitle(titleMatch?.[1] ?? `${selectedType.label} — ${new Date().toLocaleDateString("fr-FR")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  // ─── Save ───

  async function handleSave() {
    if (!selectedFormationId || !selectedType) return;
    try {
      const content = editing ? editBuffer : generatedContent;
      await db.createContent({
        formation_id: selectedFormationId,
        content_type: selectedType.value,
        title: generatedTitle,
        content_markdown: content,
        model_used: generationModel,
        generation_cost: generationCost,
        bloom_level: bloomLevel,
        estimated_duration: parseInt(duration, 10),
      });
      setSaved(true);
      if (editing) {
        setGeneratedContent(editBuffer);
        setEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    }
  }

  // ─── Copy ───

  async function handleCopy() {
    const content = editing ? editBuffer : generatedContent;
    const html = previewRef.current?.innerHTML;
    try {
      if (!editing && html && typeof ClipboardItem !== "undefined") {
        const fullHtml = `<div style="font-family: Arial, sans-serif;">${html}</div>`;
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([fullHtml], { type: "text/html" }),
            "text/plain": new Blob([content], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(content);
      }
    } catch {
      await navigator.clipboard.writeText(content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Toggle competence ───

  function toggleCompetence(id: string) {
    setSelectedCompetenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCostEstimate(null);
  }

  function toggleAllInCcp(ccpId: string) {
    const ccp = ccps.find((c) => c.id === ccpId);
    if (!ccp) return;
    const allSelected = ccp.competences.every((c) => selectedCompetenceIds.has(c.id));
    setSelectedCompetenceIds((prev) => {
      const next = new Set(prev);
      for (const comp of ccp.competences) {
        if (allSelected) next.delete(comp.id);
        else next.add(comp.id);
      }
      return next;
    });
    setCostEstimate(null);
  }

  // ─── Reset ───

  function handleReset() {
    setGeneratedContent("");
    setGeneratedTitle("");
    setCostEstimate(null);
    setSaved(false);
    setCopied(false);
    setEditing(false);
    setError("");
  }

  // ─── Helpers ───

  const canEstimate =
    !!selectedFormationId && !!selectedType && selectedCompetenceIds.size > 0;

  const canGenerate = canEstimate && !!costEstimate;

  const selectedFormation = formations.find((f) => f.id === selectedFormationId);

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Génération de contenus</h1>
          <p className="text-sm text-muted-foreground">
            Crée des cours, exercices et activités pédagogiques avec l'IA
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setActiveTab("generate")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "generate"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Wand2 className="h-4 w-4" />
          Générer
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

      {/* No centre selected */}
      {!activeCentreId && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Sélectionne un centre dans la barre latérale pour accéder à la génération de contenus.
          </AlertDescription>
        </Alert>
      )}

      {activeCentreId && activeTab === "generate" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* ─── Left: Configuration ─── */}
          <div className="space-y-5">
            {/* Formation select */}
            <div className="space-y-1.5">
              <Label>Formation</Label>
              {loadingFormations ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Chargement...
                </div>
              ) : formations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune formation dans ce centre. Crée-en une d'abord.
                </p>
              ) : (
                <Select
                  value={selectedFormationId}
                  onChange={(e) => {
                    setSelectedFormationId(e.target.value);
                    handleReset();
                  }}
                >
                  <option value="">Choisis une formation...</option>
                  {formations.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {/* Content type */}
            {selectedFormationId && (
              <div className="space-y-1.5">
                <Label>Type de contenu</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CONTENT_TYPES.map((ct) => (
                    <button
                      key={ct.value}
                      onClick={() => {
                        setSelectedType(ct);
                        setCostEstimate(null);
                      }}
                      className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                        selectedType?.value === ct.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="mt-0.5 text-muted-foreground">{ct.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{ct.label}</p>
                        <p className="text-xs text-muted-foreground">{ct.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Competences */}
            {selectedType && ccps.length > 0 && (
              <div className="space-y-1.5">
                <Label>Compétences ciblées</Label>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-3">
                  {ccps.map((ccp) => {
                    if (ccp.competences.length === 0) return null;
                    const isExpanded = expandedCcps.has(ccp.id);
                    const allSelected = ccp.competences.every((c) =>
                      selectedCompetenceIds.has(c.id),
                    );
                    const someSelected = ccp.competences.some((c) =>
                      selectedCompetenceIds.has(c.id),
                    );
                    return (
                      <div key={ccp.id}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCcps((prev) => {
                                const next = new Set(prev);
                                if (next.has(ccp.id)) next.delete(ccp.id);
                                else next.add(ccp.id);
                                return next;
                              })
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected && !allSelected;
                              }}
                              onChange={() => toggleAllInCcp(ccp.id)}
                              className="rounded"
                            />
                            <span className="text-xs text-muted-foreground">{ccp.code}</span>
                            {ccp.title}
                          </label>
                        </div>
                        {isExpanded && (
                          <div className="ml-9 space-y-1 py-1">
                            {ccp.competences.map((comp) => (
                              <label
                                key={comp.id}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedCompetenceIds.has(comp.id)}
                                  onChange={() => toggleCompetence(comp.id)}
                                  className="rounded"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {comp.code}
                                </span>
                                <span className="text-muted-foreground">{comp.title}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {ccps.every((c) => c.competences.length === 0) && (
                    <p className="text-sm text-muted-foreground">
                      Aucune compétence disponible. Importe d'abord le REAC de cette formation.
                    </p>
                  )}
                </div>
                {selectedCompetenceIds.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCompetenceIds.size} compétence(s) sélectionnée(s)
                  </p>
                )}
              </div>
            )}

            {/* Options */}
            {selectedType && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bloom">Niveau de Bloom</Label>
                  <Select
                    id="bloom"
                    value={bloomLevel}
                    onChange={(e) => {
                      setBloomLevel(e.target.value as BloomLevel);
                      setCostEstimate(null);
                    }}
                  >
                    {BLOOM_LEVELS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="duration">Durée (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={5}
                    max={480}
                    value={duration}
                    onChange={(e) => {
                      setDuration(e.target.value);
                      setCostEstimate(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="group-size">Taille groupe</Label>
                  <Input
                    id="group-size"
                    type="number"
                    min={1}
                    max={30}
                    value={groupSize}
                    onChange={(e) => {
                      setGroupSize(e.target.value);
                      setCostEstimate(null);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Additional instructions */}
            {selectedType && (
              <div className="space-y-1.5">
                <Label htmlFor="instructions">Instructions supplémentaires (optionnel)</Label>
                <Textarea
                  id="instructions"
                  placeholder="Ex: Inclure un ice-breaker en début de séance, niveau débutant..."
                  value={additionalInstructions}
                  onChange={(e) => {
                    setAdditionalInstructions(e.target.value);
                    setCostEstimate(null);
                  }}
                  rows={3}
                />
              </div>
            )}

            {/* Cost estimate + Generate */}
            {selectedType && (
              <div className="space-y-3">
                {/* Estimate button */}
                {!costEstimate && (
                  <Button
                    onClick={handleEstimate}
                    disabled={!canEstimate || estimating}
                    variant="outline"
                    className="w-full"
                  >
                    {estimating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Estimation en cours...
                      </>
                    ) : (
                      <>
                        <Euro className="h-4 w-4" />
                        Estimer le coût
                      </>
                    )}
                  </Button>
                )}

                {/* Cost display */}
                {costEstimate && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Estimation du coût</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Euro className="h-3 w-3" />
                            {costEstimate.estimatedCost.toFixed(3)} EUR
                          </span>
                          <span>Modèle : {costEstimate.modelDisplayName}</span>
                        </div>
                      </div>
                      {costEstimate.needsConfirmation && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Coût élevé
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Generate button */}
                {costEstimate && (
                  <Button
                    onClick={handleGenerate}
                    disabled={!canGenerate || generating}
                    className="w-full"
                  >
                    {generating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Génération en cours...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Générer
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* ─── Right: Result ─── */}
          <div className="space-y-4">
            {!generatedContent && !generating && (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed py-16">
                <FileText className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Le contenu généré apparaîtra ici
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configure les paramètres à gauche puis lance la génération
                </p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center justify-center rounded-xl border py-16">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium text-foreground">
                  Génération en cours...
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cela peut prendre 30 secondes à 2 minutes
                </p>
              </div>
            )}

            {generatedContent && !generating && (
              <div className="space-y-3">
                {/* Actions bar */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-foreground">{generatedTitle}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Euro className="h-3 w-3" />
                        {generationCost.toFixed(3)} EUR
                      </span>
                      <span>{generationModel}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copié" : "Copier"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const blob = await markdownToDocx(generatedContent);
                          await downloadDocx(blob, (generatedTitle || "document").replace(/[\\/:*?"<>|]/g, "_"));
                        } catch (err) {
                          console.error("Export Word:", err);
                          setError(err instanceof Error ? err.message : "Erreur export Word");
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Word
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (editing) {
                          setGeneratedContent(editBuffer);
                          setEditing(false);
                        } else {
                          setEditBuffer(generatedContent);
                          setEditing(true);
                        }
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {editing ? "Terminer" : "Modifier"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSave}
                      disabled={saved}
                    >
                      {saved ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {saved ? "Enregistré" : "Enregistrer"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleReset();
                        handleEstimate();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regénérer
                    </Button>
                  </div>
                </div>

                {/* Content */}
                {editing ? (
                  <Textarea
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    className="min-h-[500px] font-mono text-sm"
                  />
                ) : (
                  <div ref={previewRef} className="max-h-[600px] overflow-y-auto rounded-lg border bg-card p-5">
                    <RichMarkdown content={generatedContent} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── History tab ─── */}
      {activeCentreId && activeTab === "history" && (
        <div className="space-y-4">
          {!selectedFormationId ? (
            <div className="space-y-3">
              <Label>Sélectionne une formation pour voir l'historique</Label>
              <Select
                value={selectedFormationId}
                onChange={(e) => setSelectedFormationId(e.target.value)}
              >
                <option value="">Choisis une formation...</option>
                {formations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Historique — {selectedFormation?.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {history.length} contenu(s) généré(s)
                  </p>
                </div>
                <Select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="w-48"
                >
                  <option value="">Tous les types</option>
                  {CONTENT_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </Select>
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <History className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Aucun contenu généré pour cette formation
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("generate")}
                  >
                    <Sparkles className="h-4 w-4" />
                    Générer un contenu
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {history
                    .filter((c) => !historyFilter || c.content_type === historyFilter)
                    .map((item) => (
                      <HistoryCard key={item.id} item={item} onDeleted={loadHistory} />
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────

function HistoryCard({ item, onDeleted }: { item: GeneratedContent; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(item.content_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const bloomLabel = BLOOM_LEVELS.find((b) => b.value === item.bloom_level)?.label;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-sm">{item.title}</CardTitle>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
                </Badge>
                {bloomLabel && (
                  <Badge variant="outline" className="text-xs">
                    {bloomLabel}
                  </Badge>
                )}
                {item.estimated_duration && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {item.estimated_duration} min
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {item.generation_cost != null && (
              <span>{item.generation_cost.toFixed(3)} EUR</span>
            )}
            <span>{new Date(item.created_at).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="mb-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié" : "Copier"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const blob = await markdownToDocx(item.content_markdown);
                  await downloadDocx(blob, (item.title || "document").replace(/[\\/:*?"<>|]/g, "_"));
                } catch (err) {
                  console.error("Export Word:", err);
                  alert(err instanceof Error ? err.message : "Erreur export Word");
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border bg-muted/30 p-4">
            <RichMarkdown content={item.content_markdown} />
          </div>
        </CardContent>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Supprimer "${item.title}" ?`}
        message={"Cette action supprime définitivement ce contenu généré.\n\nCette action est irréversible."}
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          await db.deleteContent(item.id);
          setConfirmDelete(false);
          onDeleted();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Card>
  );
}

