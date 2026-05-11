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
  CalendarPlus,
  Upload,
  Square,
} from "lucide-react";
import { AddToPlanningDialog } from "@/features/planning/AddToPlanningDialog";
import { ImportContentDialog } from "./ImportContentDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { markdownToPdf, downloadPdf } from "@/lib/pdf-export";
import { hasFormateurSection, stripFormateur, stripCorrectAnswerHints } from "@/lib/utils";
import { DownloadToast } from "@/components/ui/download-toast";
import { db } from "@/lib/db";
import { requestStream, estimateCost } from "@/lib/claude";
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

// ─── Draft persistence ───────────────────────────────────────
// Restaure le travail en cours après un verrouillage / mise en veille.

const DRAFT_KEY = "formassist:generation:draft:v1";

interface Draft {
  formationId: string;
  typeValue: string | null;
  competenceIds: string[];
  bloomLevels: BloomLevel[];
  duration: string;
  groupSize: string;
  additionalInstructions: string;
  generatedContent: string;
  generatedTitle: string;
  generationModel: string;
  generationCost: number;
  editBuffer: string;
  editing: boolean;
  savedAt: number;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (typeof d?.generatedContent !== "string" || !d.generatedContent.trim()) return null;
    return d;
  } catch {
    return null;
  }
}

function writeDraft(d: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* quota / SSR — silent */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* silent */
  }
}

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
  const [bloomLevels, setBloomLevels] = useState<BloomLevel[]>(["apply"]);
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
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [showAddToPlanning, setShowAddToPlanning] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [planningToast, setPlanningToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ path: string; name: string } | null>(null);

  // Editing
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");

  // Brouillon restauré (verrouillage / veille)
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const draftHydratedRef = useRef(false);

  // History
  const [history, setHistory] = useState<GeneratedContent[]>([]);
  const [historyFilter, setHistoryFilter] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Error
  const [error, setError] = useState("");

  // ─── Restauration brouillon (avant tout autre useEffect) ───

  useEffect(() => {
    const d = readDraft();
    if (!d) {
      draftHydratedRef.current = true;
      return;
    }
    setSelectedFormationId(d.formationId || "");
    if (d.typeValue) {
      const opt = CONTENT_TYPES.find((c) => c.value === d.typeValue);
      if (opt) setSelectedType(opt);
    }
    setSelectedCompetenceIds(new Set(d.competenceIds || []));
    if (Array.isArray(d.bloomLevels) && d.bloomLevels.length > 0) {
      setBloomLevels(d.bloomLevels);
    }
    setDuration(d.duration || "60");
    setGroupSize(d.groupSize || "12");
    setAdditionalInstructions(d.additionalInstructions || "");
    setGeneratedContent(d.generatedContent || "");
    setGeneratedTitle(d.generatedTitle || "");
    setGenerationModel(d.generationModel || "");
    setGenerationCost(d.generationCost || 0);
    setEditBuffer(d.editBuffer || "");
    setEditing(Boolean(d.editing));
    setRestoredAt(d.savedAt || Date.now());
    setActiveTab("generate");
    // Hydrate flag posé après un tick pour éviter qu'un useEffect d'écriture
    // ne se déclenche immédiatement avec un état partiel.
    queueMicrotask(() => {
      draftHydratedRef.current = true;
    });
  }, []);

  // ─── Persistance brouillon (à chaque changement utile) ───

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (saved) {
      // Une sauvegarde DB a réussi → on retire le brouillon.
      clearDraft();
      return;
    }
    if (!generatedContent.trim()) {
      // Rien à restaurer → pas de brouillon.
      clearDraft();
      return;
    }
    writeDraft({
      formationId: selectedFormationId,
      typeValue: selectedType?.value ?? null,
      competenceIds: Array.from(selectedCompetenceIds),
      bloomLevels,
      duration,
      groupSize,
      additionalInstructions,
      generatedContent,
      generatedTitle,
      generationModel,
      generationCost,
      editBuffer,
      editing,
      savedAt: Date.now(),
    });
  }, [
    saved,
    selectedFormationId,
    selectedType,
    selectedCompetenceIds,
    bloomLevels,
    duration,
    groupSize,
    additionalInstructions,
    generatedContent,
    generatedTitle,
    generationModel,
    generationCost,
    editBuffer,
    editing,
  ]);

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

  // ─── Build competence code prefix (e.g. "CCP1/CP2+CP3" or "CCP1/CP2 · CCP2/CP1") ───

  function buildCompetenceCode(): string {
    const groups: { ccpCode: string; compCodes: string[] }[] = [];
    for (const ccp of ccps) {
      const codes = ccp.competences
        .filter((c) => selectedCompetenceIds.has(c.id))
        .map((c) => c.code);
      if (codes.length > 0) groups.push({ ccpCode: ccp.code, compCodes: codes });
    }
    return groups
      .map((g) => `${g.ccpCode}/${g.compCodes.join("+")}`)
      .join(" · ");
  }

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
    const bloomLabels = bloomLevels
      .map((lvl) => BLOOM_LEVELS.find((b) => b.value === lvl)?.label ?? lvl);
    const bloomText =
      bloomLabels.length > 1
        ? `Niveaux taxonomiques de Bloom (à couvrir) : ${bloomLabels.join(", ")}`
        : `Niveau taxonomique de Bloom : ${bloomLabels[0] ?? ""}`;

    const durationMin = parseInt(duration, 10) || 60;
    const durationHoursDecimal = (durationMin / 60).toFixed(durationMin % 60 === 0 ? 0 : 1);

    let prompt = `Génère un ${typeLabel} pour la formation "${formation?.title ?? ""}".

Compétences ciblées :
${compList || "(aucune compétence sélectionnée)"}

${bloomText}
Durée demandée : **${durationMin} minutes (${durationHoursDecimal}h)** — **CONTRAINTE FERME, NON NÉGOCIABLE**
Taille du groupe : ${groupSize} apprenants`;

    // Sizing rules per content type — ensures the generated content actually fills the requested duration
    const sizingBlock = (() => {
      const t = selectedType?.value;
      if (t === "trainer_sheet") {
        // QCM : ~1 min 30 à 2 min par question (lecture + réflexion + correction collective)
        const minQ = Math.max(10, Math.round(durationMin / 2.5));
        const maxQ = Math.max(minQ + 5, Math.round(durationMin / 1.5));
        return `

EXIGENCE OBLIGATOIRE — Dimensionnement du QCM :

La durée demandée est de **${durationMin} minutes**. Tu dois produire **entre ${minQ} et ${maxQ} questions** (compter ~1 min 30 à 2 min par question : lecture + réflexion + correction collective).

- En dessous de ${minQ} questions, le QCM est trop court → INACCEPTABLE.
- Couvre l'ensemble des compétences sélectionnées et tous les niveaux de Bloom demandés, en variant la difficulté.
- Numérote les questions et regroupe-les en sections logiques si pertinent (ex : "Bases", "Application", "Analyse de cas").
- Termine par un **corrigé détaillé** avec, pour chaque question, la bonne réponse et une **justification pédagogique** (1-2 phrases).
- Indique la **durée totale estimée** dans l'introduction et la **répartition** (passation / correction).`;
      }
      if (t === "course") {
        return `

EXIGENCE OBLIGATOIRE — Dimensionnement du cours :

La durée demandée est de **${durationMin} minutes (${durationHoursDecimal}h)**. Tu dois produire un déroulé **réellement calibré pour cette durée**, ni plus court ni plus long.

- Découpe le cours en **phases datées en minutes** (ex : "Phase 1 — Introduction (15 min)", "Phase 2 — Apport théorique (40 min)", …).
- La somme des durées de phases doit **égaler ${durationMin} minutes** (tolérance ±5 %).
- Inclus systématiquement : accueil/introduction, apports, activités d'appropriation, synthèse, évaluation/clôture.
- Pour une durée ≥ 90 min, prévois au moins une **pause** explicite.`;
      }
      // exercices, jeux, mises en situation
      return `

EXIGENCE OBLIGATOIRE — Dimensionnement de l'activité :

La durée demandée est de **${durationMin} minutes (${durationHoursDecimal}h)**. L'activité doit **réellement remplir cette durée**.

- Découpe le déroulé en **étapes datées en minutes** (consignes / temps individuel / mise en commun / debriefing).
- La somme des durées doit **égaler ${durationMin} minutes** (tolérance ±5 %).
- Si la durée dépasse ce qu'une activité unique permet de couvrir naturellement, propose **plusieurs sous-activités enchaînées** (variantes, niveaux progressifs, débriefing approfondi) plutôt que de raccourcir.
- Inclus toujours : présentation/consigne, déroulement, mise en commun, débriefing pédagogique.`;
    })();
    prompt += sizingBlock;

    if (additionalInstructions.trim()) {
      prompt += `\n\nInstructions supplémentaires :\n${additionalInstructions.trim()}`;
    }

    prompt += `

EXIGENCE OBLIGATOIRE — Vidéos pédagogiques :

Si tu proposes que les apprenants regardent une vidéo, tu **dois impérativement** fournir au moins **un lien cliquable** menant à la vidéo (ou à des résultats de recherche pertinents). La formatrice ne doit JAMAIS avoir à chercher la vidéo elle-même.

Règles strictes :
1. **N'invente AUCUNE URL de vidéo précise** (ni \`youtube.com/watch?v=…\` inventé, ni \`vimeo.com/12345\` inventé). Les IDs hallucinés mènent à des 404.
2. **Plateforme libre** : YouTube *ou* toute autre source pertinente (Vimeo, Dailymotion, INA, France TV / Lumni, Canal-U, TED, Khan Academy, site officiel d'un organisme, MOOC, etc.). YouTube par défaut s'il n'y a pas mieux.
3. **Format des liens** — utilise UNE de ces deux formes selon ce qui est le plus fiable :
   - **URL de recherche** (préférée si tu n'es pas sûr d'un titre exact) :
     • YouTube : \`https://www.youtube.com/results?search_query=MOTS+CLES\`
     • Vimeo : \`https://vimeo.com/search?q=MOTS+CLES\`
     • Lumni : \`https://www.lumni.fr/recherche?query=MOTS+CLES\`
     • Canal-U : \`https://www.canal-u.tv/recherche/?q=MOTS+CLES\`
     • Recherche générique : \`https://www.google.com/search?q=MOTS+CLES+vidéo&tbm=vid\`
   - **URL exacte d'une chaîne ou d'une page établie** (uniquement si tu es certain qu'elle existe et est stable, ex : la page d'une chaîne YouTube reconnue, la page d'un MOOC public officiel). En cas de doute → URL de recherche.
4. Choisis des **mots-clés français précis et pédagogiques** : sujet + niveau + angle ("introduction", "expliqué simplement", "tuto", "cas concret"…).
5. Propose **2 à 3 angles différents** (cadrage théorique, démo pratique, exemple concret) pour donner du choix.
6. Si tu connais une **chaîne ou un producteur francophone reconnu** pour le sujet (Khan Academy France, ScienceEtonnante, Hygiène Mentale, Le Réveilleur, France TV/Lumni, Canal-U, INA, etc.), nomme-le et inclus son nom dans la recherche.
7. Présente chaque suggestion ainsi :
   > **🎬 [Titre court de l'angle]** — [phrase d'intention pédagogique en 1 ligne]
   > 🔗 [Plateforme + descriptif court](https://...)

Cette section est OBLIGATOIRE dès qu'une vidéo est mentionnée dans le déroulé.`;

    if (selectedType?.value === "course") {
      prompt += `

EXIGENCE OBLIGATOIRE — Objectifs (à placer juste après le titre, avant tout déroulé) :

## Objectifs pédagogiques
- Formule **un ou plusieurs** objectifs pédagogiques de haut niveau, exprimés du point de vue de l'apprenant ("À l'issue de ce cours, l'apprenant sera capable de…"), alignés sur les compétences ciblées et les niveaux de Bloom retenus.

## Objectifs opérationnels
- Pour **chaque compétence sélectionnée**, formule **au moins un** objectif opérationnel rédigé strictement selon la **règle des 3C** :
  1. **Comportement observable** — un verbe d'action mesurable (ex : identifier, calculer, rédiger, paramétrer, argumenter…). Évite "comprendre", "connaître", "savoir".
  2. **Condition de réalisation** — le contexte, les outils, les ressources, les contraintes ("à partir de…", "en disposant de…", "sans documentation…").
  3. **Critère de réussite** — un seuil de performance vérifiable (quantité, qualité, temps, marge d'erreur, conformité à un standard).

Présente chaque objectif opérationnel sous cette forme structurée :
> **[Code compétence]** — *Comportement* : … · *Condition* : … · *Critère* : …

Ne saute aucune compétence sélectionnée. Si plusieurs niveaux de Bloom sont demandés, répartis-les sur les objectifs.`;
    }

    prompt += `\n\nRéponds en français. Structure le contenu en Markdown avec :
- Un titre clair
- Les objectifs pédagogiques${selectedType?.value === "course" ? " et opérationnels (selon les exigences ci-dessus)" : ""}
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

    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setError("");
    setGeneratedContent("");
    setGeneratedTitle("");
    setSaved(false);
    setSavedContentId(null);
    setCopied(false);
    setEditing(false);

    let fullContent = "";
    let aborted = false;

    try {
      const messages = buildMessages();

      for await (const chunk of requestStream(
        {
          task: selectedType.task,
          messages,
          context: {
            formationId: selectedFormationId,
            groupSize: parseInt(groupSize, 10),
          },
        },
        controller.signal,
        (meta) => {
          setGenerationModel(meta.model);
          setGenerationCost(meta.costEuros);
          addApiCost(meta.costEuros);
        },
      )) {
        fullContent += chunk;
        setGeneratedContent(fullContent);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        aborted = true;
      } else {
        setError(err instanceof Error ? err.message : "Erreur lors de la génération");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }

    // Extraire le titre du contenu (complet ou partiel si arrêté)
    if (fullContent.trim() || aborted) {
      const titleMatch = fullContent.match(/^#\s+(.+)$/m);
      const rawTitle = titleMatch?.[1]?.trim() ?? "";
      const typeLabel = selectedType.label;
      const stripPattern = new RegExp(
        `^(?:${typeLabel}|cours|exercice|qcm|jeu|jeu de r[oô]le|cas pratique)s?\\s*(?:[—:\\-]\\s*)?`,
        "i",
      );
      const cleanTitle = rawTitle.replace(stripPattern, "").trim();
      const compCode = buildCompetenceCode();
      const subject = cleanTitle || new Date().toLocaleDateString("fr-FR");
      const finalTitle = compCode
        ? `${typeLabel} ${compCode} - ${subject}`
        : `${typeLabel} - ${subject}`;
      setGeneratedTitle(finalTitle);
    }
  }

  // ─── Save ───

  async function handleSave() {
    if (!selectedFormationId || !selectedType) return;
    try {
      const content = editing ? editBuffer : generatedContent;
      const newId = await db.createContent({
        formation_id: selectedFormationId,
        content_type: selectedType.value,
        title: generatedTitle,
        content_markdown: content,
        model_used: generationModel,
        generation_cost: generationCost,
        bloom_level: bloomLevels.join(","),
        estimated_duration: parseInt(duration, 10),
      });
      setSaved(true);
      setSavedContentId(newId);
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
    setSavedContentId(null);
    setCopied(false);
    setEditing(false);
    setError("");
    setRestoredAt(null);
    clearDraft();
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
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Niveaux de Bloom <span className="text-xs text-muted-foreground font-normal">(plusieurs choix possibles)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {BLOOM_LEVELS.map((b) => {
                      const active = bloomLevels.includes(b.value);
                      return (
                        <button
                          type="button"
                          key={b.value}
                          onClick={() => {
                            setBloomLevels((prev) => {
                              const has = prev.includes(b.value);
                              if (has) {
                                // Garde au moins 1 niveau sélectionné
                                if (prev.length === 1) return prev;
                                return prev.filter((v) => v !== b.value);
                              }
                              // Ajoute en respectant l'ordre canonique de BLOOM_LEVELS
                              const next = [...prev, b.value];
                              return BLOOM_LEVELS.filter((l) => next.includes(l.value)).map(
                                (l) => l.value,
                              );
                            });
                            setCostEstimate(null);
                          }}
                          className={
                            "px-3 py-1.5 rounded-full border text-xs font-medium transition-colors " +
                            (active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:bg-muted")
                          }
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              <div className="grid grid-cols-2 gap-4">
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

                {/* Generate / Stop button */}
                {costEstimate && (
                  generating ? (
                    <Button
                      onClick={() => abortRef.current?.abort()}
                      variant="destructive"
                      className="w-full"
                    >
                      <Square className="h-4 w-4" />
                      Arrêter la génération
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      className="w-full"
                    >
                      <Sparkles className="h-4 w-4" />
                      Générer
                    </Button>
                  )
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

            {generating && !generatedContent && (
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

            {generatedContent && (
              <div className="space-y-3">
                {generating && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Génération en cours — clique sur "Arrêter" si tu veux stopper ici
                  </div>
                )}
                {restoredAt && !saved && !generating && (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <div className="text-xs">
                      <p className="font-semibold">Brouillon récupéré</p>
                      <p className="text-amber-800">
                        Génération du{" "}
                        {new Date(restoredAt).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        — pense à <strong>l'enregistrer</strong> pour ne pas la reperdre.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRestoredAt(null)}
                      className="text-xs text-amber-900 hover:text-amber-700 underline shrink-0"
                    >
                      Compris
                    </button>
                  </div>
                )}
                {/* Actions bar — masqué pendant la génération */}
                {!generating && <div className="flex items-center justify-between">
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
                    {(() => {
                      const hasFormateur = hasFormateurSection(generatedContent);
                      const dualVersion = true;
                      const baseName = (generatedTitle || "document").replace(/[\\/:*?"<>|]/g, "_");
                      return (
                        <>
                          {/* Version formateur (document complet) */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const blob = await markdownToDocx(generatedContent);
                                const savedPath = await downloadDocx(blob, baseName);
                                if (savedPath) setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Erreur export Word");
                              }
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                            {dualVersion ? "Word · Formateur" : "Word"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const blob = await markdownToPdf(generatedContent);
                                const savedPath = await downloadPdf(blob, baseName);
                                if (savedPath) setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Erreur export PDF");
                              }
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                            {dualVersion ? "PDF · Formateur" : "PDF"}
                          </Button>
                          {/* Version apprenant (sans corrigé) — QCM ou tout document avec section formateur */}
                          {dualVersion && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={async () => {
                                  try {
                                    const apprenant = hasFormateur ? stripFormateur(generatedContent) : stripCorrectAnswerHints(generatedContent);
                                    const blob = await markdownToDocx(apprenant);
                                    const savedPath = await downloadDocx(blob, `${baseName}_apprenant`);
                                    if (savedPath) setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : "Erreur export Word");
                                  }
                                }}
                              >
                                <Users className="h-3.5 w-3.5" />
                                Word · Apprenant
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={async () => {
                                  try {
                                    const apprenant = hasFormateur ? stripFormateur(generatedContent) : stripCorrectAnswerHints(generatedContent);
                                    const blob = await markdownToPdf(apprenant);
                                    const savedPath = await downloadPdf(blob, `${baseName}_apprenant`);
                                    if (savedPath) setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : "Erreur export PDF");
                                  }
                                }}
                              >
                                <Users className="h-3.5 w-3.5" />
                                PDF · Apprenant
                              </Button>
                            </>
                          )}
                        </>
                      );
                    })()}
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
                    {saved && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddToPlanning(true)}
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Ajouter au planning
                      </Button>
                    )}
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
                </div>}

                {/* Content */}
                {editing ? (
                  <Textarea
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    className="min-h-[500px] font-mono text-sm"
                  />
                ) : (
                  <div ref={previewRef} className="rounded-lg border bg-card p-5">
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImport(true)}
                  >
                    <Upload className="h-4 w-4" />
                    Importer
                  </Button>
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
                      <HistoryCard
                        key={item.id}
                        item={item}
                        onDeleted={loadHistory}
                        onDownloaded={(path) => {
                          const name = path.split(/[\\/]/).pop() ?? path;
                          setDownloadToast({ path, name });
                        }}
                        onLinked={() => {
                          setPlanningToast("Créneau créé et contenu lié au planning.");
                          setTimeout(() => setPlanningToast(null), 4000);
                          loadHistory();
                        }}
                      />
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {downloadToast && (
        <DownloadToast
          path={downloadToast.path}
          name={downloadToast.name}
          onClose={() => setDownloadToast(null)}
        />
      )}

      <AddToPlanningDialog
        open={showAddToPlanning}
        onClose={() => setShowAddToPlanning(false)}
        defaultFormationId={selectedFormationId}
        defaultTitle={generatedTitle}
        defaultDurationMinutes={parseInt(duration, 10) || null}
        onCreated={async (slotId) => {
          if (savedContentId) {
            try {
              await db.linkContentToSlot(savedContentId, slotId);
            } catch (err) {
              console.error("Erreur liaison contenu/slot:", err);
            }
          }
          setPlanningToast("Créneau créé et contenu lié au planning.");
          setTimeout(() => setPlanningToast(null), 4000);
        }}
      />

      {showImport && (
        <ImportContentDialog
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadHistory();
          }}
        />
      )}

      {planningToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 shadow-lg animate-in slide-in-from-bottom-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <Check className="h-4 w-4 text-green-700" />
          </div>
          <p className="text-sm font-medium text-green-900">{planningToast}</p>
        </div>
      )}
    </div>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────

function HistoryCard({ item, onDeleted, onDownloaded, onLinked }: { item: GeneratedContent; onDeleted: () => void; onDownloaded?: (path: string) => void; onLinked?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddToPlanning, setShowAddToPlanning] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(item.content_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const bloomLabel = (item.bloom_level ?? "")
    .split(",")
    .map((v) => BLOOM_LEVELS.find((b) => b.value === v.trim())?.label)
    .filter((l): l is string => Boolean(l))
    .join(" · ");

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
                {item.source === "import" && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-400/40 bg-amber-50">
                    <Upload className="h-3 w-3" />
                    Importé
                  </Badge>
                )}
                {item.slot_id && (
                  <Badge variant="outline" className="text-xs text-primary border-primary/40">
                    <CalendarPlus className="h-3 w-3" />
                    Dans le planning
                  </Badge>
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
            {(() => {
              const hasFormateur = hasFormateurSection(item.content_markdown);
              const dualVersion = true;
              const baseName = (item.title || "document").replace(/[\\/:*?"<>|]/g, "_");
              return (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const blob = await markdownToDocx(item.content_markdown);
                        const savedPath = await downloadDocx(blob, baseName);
                        if (savedPath) onDownloaded?.(savedPath);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Erreur export Word");
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {dualVersion ? "Word · Formateur" : "Word"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const blob = await markdownToPdf(item.content_markdown);
                        const savedPath = await downloadPdf(blob, baseName);
                        if (savedPath) onDownloaded?.(savedPath);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Erreur export PDF");
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {dualVersion ? "PDF · Formateur" : "PDF"}
                  </Button>
                  {dualVersion && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={async () => {
                          try {
                            const apprenant = hasFormateur ? stripFormateur(item.content_markdown) : stripCorrectAnswerHints(item.content_markdown);
                            const blob = await markdownToDocx(apprenant);
                            const savedPath = await downloadDocx(blob, `${baseName}_apprenant`);
                            if (savedPath) onDownloaded?.(savedPath);
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Erreur export Word");
                          }
                        }}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Word · Apprenant
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={async () => {
                          try {
                            const apprenant = hasFormateur ? stripFormateur(item.content_markdown) : stripCorrectAnswerHints(item.content_markdown);
                            const blob = await markdownToPdf(apprenant);
                            const savedPath = await downloadPdf(blob, `${baseName}_apprenant`);
                            if (savedPath) onDownloaded?.(savedPath);
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Erreur export PDF");
                          }
                        }}
                      >
                        <Users className="h-3.5 w-3.5" />
                        PDF · Apprenant
                      </Button>
                    </>
                  )}
                </>
              );
            })()}
            {!item.slot_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddToPlanning(true)}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Ajouter au planning
              </Button>
            )}
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
      <AddToPlanningDialog
        open={showAddToPlanning}
        onClose={() => setShowAddToPlanning(false)}
        defaultFormationId={item.formation_id}
        defaultTitle={item.title}
        defaultDurationMinutes={item.estimated_duration ?? null}
        onCreated={async (slotId) => {
          try {
            await db.linkContentToSlot(item.id, slotId);
            onLinked?.();
          } catch (err) {
            console.error("Erreur liaison contenu/slot:", err);
          }
        }}
      />
    </Card>
  );
}

