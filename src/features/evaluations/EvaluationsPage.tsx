import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Drama,
  User,
  Users,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Euro,
  History,
  FileText,
  AlertTriangle,
  Trash2,
  Download,
  Square,
  Check,
  Pencil,
  Save,
  Lock,
  Clock,
  Copy,
  Target,
  FileUp,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { DownloadToast } from "@/components/ui/download-toast";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { analyserRc, enregistrerRc, modalitesPourPrompt } from "./rc-import";
import { stripFormateur, extractFormateurSection, formatDateShort } from "@/lib/utils";
import { markdownToPlainText } from "@/lib/docx-template";
import { fillEvaluationTrame, type TramePayload } from "./fill-trame";
import { db } from "@/lib/db";
import { requestStream, estimateCost } from "@/lib/claude";
import { useAppStore } from "@/stores/appStore";
import type { Formation, CCP, Competence, GeneratedContent } from "@/types";
import type { ClaudeMessage } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// ─── Constants ───────────────────────────────────────────────

type EpreuveType = "role_play" | "exercise_individual" | "exercise_small_group";

const EPREUVE_TYPES: {
  value: EpreuveType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "role_play",
    label: "Mise en situation",
    description: "Contexte pro, posture « je »",
    icon: <Drama className="h-5 w-5" />,
  },
  {
    value: "exercise_individual",
    label: "Exercice individuel",
    description: "Production écrite personnelle",
    icon: <User className="h-5 w-5" />,
  },
  {
    value: "exercise_small_group",
    label: "Exercice petit groupe",
    description: "Livrable collectif, éval. individuelle",
    icon: <Users className="h-5 w-5" />,
  },
];

/** Plafonds d'injection des cours dans le prompt (maîtrise du contexte/coût) */
const MAX_COURSES = 6;
const MAX_CHARS_PER_COURSE = 8000;

interface EvalTemplate {
  id: string;
  centre_id: string;
  name: string;
  original_filename: string;
  file_path: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function durationLabel(min: number): string {
  if (min <= 0) return "";
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h} heure${h > 1 ? "s" : ""}`;
  }
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} minutes`;
}

/** Somme des points affichés dans le sujet au format "(X pts – CPy)". */
function computeBaremeTotal(sujet: string): number {
  let total = 0;
  const re = /\((\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\s*[–—-]\s*CP/gi;
  for (const m of sujet.matchAll(re)) {
    total += parseFloat(m[1]!.replace(",", "."));
  }
  return Math.round(total * 100) / 100;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extrait le contenu d'une section markdown "## <titre>" (sans le titre). */
function extractMdSection(md: string, titleRe: RegExp): string {
  const lines = md.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s/.test(lines[i]!) && titleRe.test(lines[i]!)) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i]!)) break;
    out.push(lines[i]!);
  }
  return out.join("\n").trim();
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_");
}

// ─── Component ───────────────────────────────────────────────

export function EvaluationsPage() {
  const { activeCentreId, addApiCost } = useAppStore();

  const [activeTab, setActiveTab] = useState<"create" | "history">("create");

  // Étape 1 : formation & épreuve
  const [formations, setFormations] = useState<Formation[]>([]);
  const [selectedFormationId, setSelectedFormationId] = useState("");
  const [loadingFormations, setLoadingFormations] = useState(false);
  const [selectedEpreuves, setSelectedEpreuves] = useState<Set<EpreuveType>>(
    new Set(["role_play"]),
  );
  const [duration, setDuration] = useState("120");
  const [dateEpreuve, setDateEpreuve] = useState("");

  // Étape 2 : compétences
  const [ccps, setCcps] = useState<(CCP & { competences: Competence[] })[]>([]);
  const [selectedCompetenceIds, setSelectedCompetenceIds] = useState<Set<string>>(new Set());
  const [expandedCcps, setExpandedCcps] = useState<Set<string>>(new Set());

  // Étape 3 : cours sources
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [includeOtherTypes, setIncludeOtherTypes] = useState(false);
  const [contentLinks, setContentLinks] = useState<Map<string, Set<string>>>(new Map());

  // Étape 4 : trame
  // Référentiel d'évaluation : les modalités de l'épreuve, propres à chaque titre.
  const [modalites, setModalites] = useState("");
  const [rcEnCours, setRcEnCours] = useState(false);
  const [rcMessage, setRcMessage] = useState("");
  const [templates, setTemplates] = useState<EvalTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<EvalTemplate | null>(null);

  // Étape 5 : récap & coût
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [costEstimate, setCostEstimate] = useState<{
    estimatedCost: number;
    modelDisplayName: string;
    needsConfirmation: boolean;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Étape 6 : génération
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generationModel, setGenerationModel] = useState("");
  const [generationCost, setGenerationCost] = useState(0);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");
  const [showCorrige, setShowCorrige] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<"trame" | "simple" | "corrige" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ path: string; name: string } | null>(null);

  // Historique
  const [history, setHistory] = useState<GeneratedContent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [error, setError] = useState("");

  // ─── Chargements ───

  useEffect(() => {
    if (!activeCentreId) return;
    setLoadingFormations(true);
    db.getFormations(activeCentreId)
      .then((rows) => setFormations(rows as unknown as Formation[]))
      .catch((err) => console.error("Erreur chargement formations :", err))
      .finally(() => setLoadingFormations(false));
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCentreId]);

  async function loadTemplates() {
    if (!activeCentreId) return;
    try {
      const rows = await db.getEvaluationTemplates(activeCentreId);
      setTemplates(rows as unknown as EvalTemplate[]);
    } catch (err) {
      console.error("Erreur chargement trames :", err);
    }
  }

  useEffect(() => {
    if (!selectedFormationId) {
      setCcps([]);
      setContents([]);
      setSelectedCompetenceIds(new Set());
      setSelectedCourseIds(new Set());
      return;
    }
    loadCompetences(selectedFormationId);
    loadContents(selectedFormationId);
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
      setExpandedCcps(new Set(result.map((c) => c.id)));
    } catch (err) {
      console.error("Erreur chargement compétences :", err);
    }
  }

  async function loadContents(formationId: string) {
    try {
      const rows = await db.getContents(formationId);
      setContents(rows as unknown as GeneratedContent[]);
      const links = await db.getCompetenceIdsByContent(formationId);
      const map = new Map<string, Set<string>>();
      for (const row of links as { content_id: string; competence_id: string }[]) {
        const set = map.get(row.content_id) ?? new Set<string>();
        set.add(row.competence_id);
        map.set(row.content_id, set);
      }
      setContentLinks(map);
    } catch (err) {
      console.error("Erreur chargement contenus :", err);
    }
  }

  const loadHistory = useCallback(async () => {
    if (!selectedFormationId) return;
    setLoadingHistory(true);
    try {
      const rows = await db.getContents(selectedFormationId, "evaluation");
      setHistory(rows as unknown as GeneratedContent[]);
    } catch (err) {
      console.error("Erreur chargement historique :", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedFormationId]);

  useEffect(() => {
    if (activeTab === "history" && selectedFormationId) loadHistory();
  }, [activeTab, selectedFormationId, loadHistory]);

  // ─── Cours sources : candidats, présélection, couverture ───

  const allComps = useMemo(() => ccps.flatMap((c) => c.competences), [ccps]);
  const selectedComps = useMemo(
    () => allComps.filter((c) => selectedCompetenceIds.has(c.id)),
    [allComps, selectedCompetenceIds],
  );

  const candidateCourses = useMemo(
    () =>
      contents.filter((c) =>
        includeOtherTypes ? c.content_type !== "evaluation" : c.content_type === "course",
      ),
    [contents, includeOtherTypes],
  );

  /** Un contenu couvre-t-il une compétence ? Lien N-N, sinon heuristique code dans le titre. */
  const contentCoversComp = useCallback(
    (content: GeneratedContent, comp: Competence): boolean => {
      const linked = contentLinks.get(content.id);
      if (linked?.has(comp.id)) return true;
      if (comp.code) {
        const re = new RegExp(`\\b${escapeRegExp(comp.code)}\\b`, "i");
        if (re.test(content.title)) return true;
      }
      return false;
    },
    [contentLinks],
  );

  // Présélection automatique des cours quand les compétences changent
  useEffect(() => {
    if (selectedComps.length === 0) {
      setSelectedCourseIds(new Set());
      return;
    }
    const pre = new Set<string>();
    for (const content of candidateCourses) {
      if (selectedComps.some((comp) => contentCoversComp(content, comp))) {
        pre.add(content.id);
        if (pre.size >= MAX_COURSES) break;
      }
    }
    setSelectedCourseIds(pre);
    setCostEstimate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompetenceIds, candidateCourses]);

  const selectedCourses = useMemo(
    () => candidateCourses.filter((c) => selectedCourseIds.has(c.id)),
    [candidateCourses, selectedCourseIds],
  );

  /** Compétences sélectionnées non couvertes par les cours cochés */
  const uncoveredComps = useMemo(
    () =>
      selectedComps.filter(
        (comp) => !selectedCourses.some((content) => contentCoversComp(content, comp)),
      ),
    [selectedComps, selectedCourses, contentCoversComp],
  );

  // ─── Anti-doublon ───

  const overlappingEvals = useMemo(() => {
    if (selectedCompetenceIds.size === 0) return [];
    return contents.filter((c) => {
      if (c.content_type !== "evaluation") return false;
      const linked = contentLinks.get(c.id);
      if (!linked) return false;
      for (const id of selectedCompetenceIds) if (linked.has(id)) return true;
      return false;
    });
  }, [contents, contentLinks, selectedCompetenceIds]);

  // ─── Codes / libellés ───

  function buildCompetenceCode(): string {
    const groups: { ccpCode: string; compCodes: string[] }[] = [];
    for (const ccp of ccps) {
      const codes = ccp.competences
        .filter((c) => selectedCompetenceIds.has(c.id))
        .map((c) => c.code);
      if (codes.length > 0) groups.push({ ccpCode: ccp.code, compCodes: codes });
    }
    return groups.map((g) => `${g.ccpCode}/${g.compCodes.join("+")}`).join(" · ");
  }

  /** Ex. "Compétences n°10, 11, 12 – CCP3" (une entrée par CCP couvert) */
  function buildCompetencesHeader(compIds: Set<string>): string {
    const parts: string[] = [];
    for (const ccp of ccps) {
      const comps = ccp.competences.filter((c) => compIds.has(c.id));
      if (comps.length === 0) continue;
      const nums = comps.map((c) => c.code.match(/\d+/)?.[0] ?? c.code);
      const label = comps.length > 1 ? "Compétences" : "Compétence";
      parts.push(`${label} n°${nums.join(", ")} – ${ccp.code}`);
    }
    return parts.join(" · ");
  }

  // ─── Construction du prompt ───

  async function buildMessages(): Promise<ClaudeMessage[]> {
    const formation = formations.find((f) => f.id === selectedFormationId);
    const durationMin = parseInt(duration, 10) || 120;

    const epreuveLabels = EPREUVE_TYPES.filter((t) => selectedEpreuves.has(t.value)).map(
      (t) => t.label,
    );

    let prompt = `Génère un sujet d'Évaluation en Cours de Formation (ECF) pour le titre professionnel "${formation?.title ?? ""}"${formation?.rncp_code ? ` (${formation.rncp_code})` : ""}.

Type(s) d'épreuve demandés : ${epreuveLabels.join(" + ")}
Durée de l'épreuve : ${durationLabel(durationMin)} (${durationMin} minutes)`;
    if (dateEpreuve) {
      prompt += `\nDate prévue de l'épreuve : ${formatDateShort(dateEpreuve)}`;
    }

    // Compétences ciblées, groupées par CCP, descriptions REAC verbatim
    prompt += `\n\nCompétences ciblées (descriptions officielles du REAC) :`;
    for (const ccp of ccps) {
      const comps = ccp.competences.filter((c) => selectedCompetenceIds.has(c.id));
      if (comps.length === 0) continue;
      prompt += `\n\n### ${ccp.code} — ${ccp.title}`;
      for (const comp of comps) {
        prompt += `\n- **${comp.code} : ${comp.title}**`;
        if (comp.description) prompt += `\n  ${comp.description}`;
      }
    }

    // Modalités de l'épreuve, si le référentiel d'évaluation a été importé
    if (modalites) {
      prompt += `\n\nModalités officielles de l'épreuve de certification, issues du référentiel d'évaluation de ce titre. L'ECF doit préparer à cette épreuve, sans la reproduire à l'identique :\n${modalites}`;
    }

    // Critères d'évaluation officiels
    const criteria = await db.getCriteriaForCompetences(Array.from(selectedCompetenceIds));
    if (criteria.length > 0) {
      prompt += `\n\nCritères d'évaluation officiels du référentiel (à mobiliser dans la grille de notation de la TRAME FORMATEUR — ne PAS les recopier dans le sujet candidat) :`;
      let currentCode = "";
      for (const cr of criteria as {
        competence_code: string;
        description: string;
      }[]) {
        if (cr.competence_code !== currentCode) {
          currentCode = cr.competence_code;
          prompt += `\n\n${currentCode} :`;
        }
        prompt += `\n- ${cr.description}`;
      }
    }

    // Cours réellement dispensés
    prompt += `\n\nContenus des cours RÉELLEMENT DISPENSÉS aux apprenants — le sujet doit porter EXCLUSIVEMENT sur ces notions :`;
    const courses = selectedCourses.slice(0, MAX_COURSES);
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i]!;
      let body = c.content_markdown ?? "";
      const truncated = body.length > MAX_CHARS_PER_COURSE;
      if (truncated) body = body.slice(0, MAX_CHARS_PER_COURSE);
      prompt += `\n\n─── COURS ${i + 1} : « ${c.title} » ───\n${body}${truncated ? "\n[… contenu tronqué]" : ""}`;
    }

    // Sujets antérieurs à éviter
    if (overlappingEvals.length > 0) {
      prompt += `\n\nSujets d'évaluation DÉJÀ DONNÉS sur ces compétences — ton scénario doit être totalement différent :`;
      for (const ev of overlappingEvals) {
        prompt += `\n- « ${ev.title} »`;
      }
    }

    if (additionalInstructions.trim()) {
      prompt += `\n\nInstructions supplémentaires :\n${additionalInstructions.trim()}`;
    }

    const compCodes = selectedComps.map((c) => c.code).join(", ");
    prompt += `\n\nRappels impératifs : barème total = 100 points exactement, réparti équitablement entre ${compCodes} ; chaque question au format "Qn. … (X pts – CPy)" ; corrigé complet uniquement dans la section 🔒 TRAME FORMATEUR après le séparateur ---. Réponds en français.`;

    return [{ role: "user", content: prompt }];
  }

  // ─── Estimation ───

  const canEstimate =
    !!selectedFormationId &&
    selectedEpreuves.size > 0 &&
    selectedCompetenceIds.size > 0 &&
    selectedCourseIds.size > 0;

  async function handleEstimate() {
    if (!canEstimate) return;
    setEstimating(true);
    setError("");
    setCostEstimate(null);
    try {
      const messages = await buildMessages();
      const estimate = await estimateCost("generation_evaluation", messages);
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

  // ─── Génération ───

  async function handleGenerate() {
    if (!canEstimate || !costEstimate) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setError("");
    setGeneratedContent("");
    setGeneratedTitle("");
    setSaved(false);
    setEditing(false);
    setShowCorrige(false);

    let fullContent = "";
    try {
      const messages = await buildMessages();
      for await (const chunk of requestStream(
        {
          task: "generation_evaluation",
          messages,
          context: { formationId: selectedFormationId },
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
      if (!(err instanceof Error && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Erreur lors de la génération");
      }
    }

    if (fullContent.trim()) {
      const titleMatch = fullContent.match(/^#\s+(.+)$/m);
      const rawTitle = (titleMatch?.[1] ?? "")
        .replace(/^évaluation\s*(?:ECF)?\s*[–—:-]\s*/i, "")
        .trim();
      const compCode = buildCompetenceCode();
      const subject = rawTitle || new Date().toLocaleDateString("fr-FR");
      setGeneratedTitle(compCode ? `Évaluation ${compCode} - ${subject}` : `Évaluation - ${subject}`);
    }

    setGenerating(false);
    abortRef.current = null;
  }

  // ─── Sauvegarde ───

  async function handleSave() {
    if (!selectedFormationId || !generatedContent.trim()) return;
    try {
      const content = editing ? editBuffer : generatedContent;
      const newId = await db.createContent({
        formation_id: selectedFormationId,
        content_type: "evaluation",
        title: generatedTitle,
        content_markdown: content,
        model_used: generationModel,
        generation_cost: generationCost,
        estimated_duration: parseInt(duration, 10) || null,
      });
      await db.linkContentToCompetences(newId, Array.from(selectedCompetenceIds));
      setSaved(true);
      if (editing) {
        setGeneratedContent(editBuffer);
        setEditing(false);
      }
      loadContents(selectedFormationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    }
  }

  // ─── Payload trame ───

  async function buildTramePayload(
    fullMarkdown: string,
    compIds: Set<string>,
  ): Promise<TramePayload> {
    const formation = formations.find((f) => f.id === selectedFormationId);
    const durationMin = parseInt(duration, 10) || 120;
    const comps = allComps.filter((c) => compIds.has(c.id));

    // Descriptions REAC verbatim
    const description = comps
      .map((c) => `${c.code} — ${c.title} :\n${c.description ?? ""}`.trim())
      .join("\n\n");

    // Un bloc "rappel" par CCP couvert : toutes les compétences in_scope du CCP
    const rappels: { ccp_code: string; texte: string }[] = [];
    for (const ccp of ccps) {
      if (!ccp.competences.some((c) => compIds.has(c.id))) continue;
      rappels.push({
        ccp_code: ccp.code,
        texte: ccp.competences.map((c) => `• ${c.code} – ${c.title}`).join("\n"),
      });
    }

    // Critères verbatim groupés par compétence
    const criteria = await db.getCriteriaForCompetences(Array.from(compIds));
    let criteres = "";
    let currentCode = "";
    for (const cr of criteria as { competence_code: string; description: string }[]) {
      if (cr.competence_code !== currentCode) {
        currentCode = cr.competence_code;
        criteres += (criteres ? "\n\n" : "") + `${currentCode} :`;
      }
      criteres += `\n• ${cr.description}`;
    }

    const sujetMd = stripFormateur(fullMarkdown);
    return {
      titre_professionnel: formation?.title ?? "",
      code_rncp: formation?.rncp_code ?? "",
      duree: durationLabel(durationMin),
      date_epreuve: dateEpreuve ? formatDateShort(dateEpreuve) : "",
      competences_header: buildCompetencesHeader(compIds),
      description_competences_reac: description,
      rappels_ccp: rappels,
      criteres_evaluation: criteres,
      sujet_texte: markdownToPlainText(sujetMd),
      consignes: markdownToPlainText(
        extractMdSection(sujetMd, /consignes?\s+g[ée]n[ée]rales?/i),
      ),
    };
  }

  // ─── Exports ───

  async function handleExportTrame(
    fullMarkdown: string,
    title: string,
    compIds: Set<string>,
    templateId: string,
  ) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setExporting("trame");
    setError("");
    try {
      const payload = await buildTramePayload(fullMarkdown, compIds);
      const { blob, cost } = await fillEvaluationTrame(template.file_path, payload);
      addApiCost(cost);
      const savedPath = await downloadDocx(blob, sanitizeFilename(`EVALUATION ${title}`));
      if (savedPath) {
        setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du remplissage de la trame");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportSimple(fullMarkdown: string, title: string) {
    setExporting("simple");
    setError("");
    try {
      const blob = await markdownToDocx(stripFormateur(fullMarkdown));
      const savedPath = await downloadDocx(blob, sanitizeFilename(`SUJET ${title}`));
      if (savedPath) {
        setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur export Word");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportCorrige(fullMarkdown: string, title: string) {
    setExporting("corrige");
    setError("");
    try {
      const corrige = extractFormateurSection(fullMarkdown);
      if (!corrige) {
        setError("Aucune section corrigé (🔒 TRAME FORMATEUR) trouvée dans ce document.");
        return;
      }
      const blob = await markdownToDocx(`# CORRIGÉ — ${title}\n\n${corrige}`);
      const savedPath = await downloadDocx(blob, sanitizeFilename(`CORRIGE ${title}`));
      if (savedPath) {
        setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur export corrigé");
    } finally {
      setExporting(null);
    }
  }

  // ─── Référentiel d'évaluation ───

  useEffect(() => {
    if (!selectedFormationId) {
      setModalites("");
      return;
    }
    modalitesPourPrompt(selectedFormationId).then(setModalites).catch(() => setModalites(""));
  }, [selectedFormationId]);

  async function handleImportRc(file: File) {
    if (!selectedFormationId) return;
    setRcEnCours(true);
    setRcMessage("");
    setError("");
    try {
      const parse = await analyserRc(file, new AbortController().signal);
      const n = await enregistrerRc(selectedFormationId, parse);
      setModalites(await modalitesPourPrompt(selectedFormationId));
      const alertes = parse.warnings?.length
        ? ` À vérifier : ${parse.warnings.join(" ; ")}`
        : "";
      setRcMessage(`${n} modalité${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""}.${alertes}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRcEnCours(false);
    }
  }

  // ─── Trames : upload / suppression ───

  async function handleUploadTemplate() {
    if (!activeCentreId) return;
    setError("");
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Trame Word", extensions: ["docx"] }],
      });
      if (!selected || typeof selected !== "string") return;
      setUploadingTemplate(true);
      const savedPath = await invoke<string>("save_imported_file", {
        sourcePath: selected,
        category: "evaluation_trames",
      });
      const originalName = selected.split(/[\\/]/).pop() ?? "trame.docx";
      const name = originalName.replace(/\.docx$/i, "");
      const id = await db.createEvaluationTemplate({
        centre_id: activeCentreId,
        name,
        original_filename: originalName,
        file_path: savedPath,
      });
      await loadTemplates();
      setSelectedTemplateId(id);
    } catch (err) {
      console.error(err);
      setError("Impossible d'importer la trame. Réessaie.");
    } finally {
      setUploadingTemplate(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!templateToDelete) return;
    try {
      await db.deleteEvaluationTemplate(templateToDelete.id);
      if (selectedTemplateId === templateToDelete.id) setSelectedTemplateId("");
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setTemplateToDelete(null);
    }
  }

  // ─── Divers ───

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

  async function handleCopy() {
    await navigator.clipboard.writeText(editing ? editBuffer : generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayedContent = editing ? editBuffer : generatedContent;
  const sujetOnly = useMemo(() => stripFormateur(displayedContent), [displayedContent]);
  const baremeTotal = useMemo(
    () => (displayedContent && !generating ? computeBaremeTotal(sujetOnly) : null),
    [sujetOnly, displayedContent, generating],
  );

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Évaluations ECF</h1>
          <p className="text-sm text-muted-foreground">
            Génère des sujets d'Évaluation en Cours de Formation basés sur tes cours, dans la
            trame officielle de ton centre
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setActiveTab("create")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Target className="h-4 w-4" />
          Nouvelle évaluation
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

      {!activeCentreId && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Sélectionne un centre dans la barre latérale pour accéder aux évaluations.
          </AlertDescription>
        </Alert>
      )}

      {activeCentreId && activeTab === "create" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* ─── Colonne gauche : configuration ─── */}
          <div className="space-y-5">
            {/* Étape 1 : Formation */}
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
                    setGeneratedContent("");
                    setGeneratedTitle("");
                    setCostEstimate(null);
                    setSaved(false);
                    setError("");
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

            {/* Étape 1bis : type d'épreuve + durée + date */}
            {selectedFormationId && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Type d'épreuve</Label>
                    {selectedEpreuves.size > 1 && (
                      <Badge variant="outline" className="text-primary border-primary/40">
                        {selectedEpreuves.size} types — une partie par type
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {EPREUVE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => {
                          setSelectedEpreuves((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.value)) {
                              if (next.size > 1) next.delete(t.value);
                            } else {
                              next.add(t.value);
                            }
                            return next;
                          });
                          setCostEstimate(null);
                        }}
                        className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-colors ${
                          selectedEpreuves.has(t.value)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="text-muted-foreground">{t.icon}</span>
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Durée de l'épreuve (minutes)</Label>
                    <Input
                      type="number"
                      min="15"
                      step="15"
                      value={duration}
                      onChange={(e) => {
                        setDuration(e.target.value);
                        setCostEstimate(null);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Soit {durationLabel(parseInt(duration, 10) || 0) || "—"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Date de l'épreuve{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optionnelle)
                      </span>
                    </Label>
                    <Input
                      type="date"
                      value={dateEpreuve}
                      onChange={(e) => setDateEpreuve(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Étape 2 : Compétences */}
            {selectedFormationId && ccps.length > 0 && (
              <div className="space-y-1.5">
                <Label>Compétences évaluées</Label>
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
                                <span className="text-xs text-muted-foreground">{comp.code}</span>
                                <span className="text-muted-foreground">{comp.title}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectedCompetenceIds.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCompetenceIds.size} compétence(s) — barème /100 réparti
                    automatiquement
                  </p>
                )}
              </div>
            )}

            {selectedFormationId && ccps.every((c) => c.competences.length === 0) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Aucune compétence disponible. Importe d'abord le REAC de cette formation.
                </AlertDescription>
              </Alert>
            )}

            {/* Étape 3 : Cours sources */}
            {selectedCompetenceIds.size > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Cours sources (base du sujet)</Label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded"
                      checked={includeOtherTypes}
                      onChange={(e) => setIncludeOtherTypes(e.target.checked)}
                    />
                    Inclure exercices et autres contenus
                  </label>
                </div>
                {candidateCourses.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Aucun cours généré pour cette formation. L'évaluation doit se baser sur
                      les cours réellement dispensés : génère d'abord tes cours dans la page
                      Génération.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3">
                      {candidateCourses.map((c) => {
                        const checked = selectedCourseIds.has(c.id);
                        const disabled = !checked && selectedCourseIds.size >= MAX_COURSES;
                        return (
                          <label
                            key={c.id}
                            className={`flex items-start gap-2 text-sm ${
                              disabled ? "opacity-50" : "cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => {
                                setSelectedCourseIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.id)) next.delete(c.id);
                                  else if (next.size < MAX_COURSES) next.add(c.id);
                                  return next;
                                });
                                setCostEstimate(null);
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-foreground">{c.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDateShort(c.created_at)}
                                {(c.content_markdown?.length ?? 0) > MAX_CHARS_PER_COURSE &&
                                  " · long — sera tronqué"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedCourseIds.size}/{MAX_COURSES} cours max — présélection
                      automatique selon les compétences cochées
                    </p>
                    {uncoveredComps.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>
                            {uncoveredComps.map((c) => c.code).join(", ")}
                          </strong>{" "}
                          {uncoveredComps.length > 1
                            ? "ne sont couvertes par aucun cours sélectionné"
                            : "n'est couverte par aucun cours sélectionné"}{" "}
                          — le sujet risque de porter sur du contenu non enseigné.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Modalités de l'épreuve, issues du référentiel d'évaluation */}
            {selectedFormationId && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Modalités de l'épreuve</Label>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={rcEnCours}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleImportRc(f);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
                      {rcEnCours ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileUp className="h-3.5 w-3.5" />
                      )}
                      {rcEnCours ? "Analyse…" : "Importer le référentiel d'évaluation"}
                    </span>
                  </label>
                </div>
                {modalites ? (
                  <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    {modalites}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Le REAC décrit le métier, le référentiel d'évaluation décrit l'épreuve :
                    durées, parties de la mise en situation, entretiens. Sans lui, les sujets
                    sont calés au jugé.
                  </p>
                )}
                {rcMessage && <p className="text-xs text-primary">{rcMessage}</p>}
              </div>
            )}

            {/* Étape 4 : Trame du centre */}
            {selectedCompetenceIds.size > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Trame du centre</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUploadTemplate}
                    disabled={uploadingTemplate}
                  >
                    {uploadingTemplate ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileUp className="h-3.5 w-3.5" />
                    )}
                    Ajouter une trame
                  </Button>
                </div>
                <div className="space-y-1 rounded-lg border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="trame"
                      checked={selectedTemplateId === ""}
                      onChange={() => setSelectedTemplateId("")}
                    />
                    <span className="text-muted-foreground">
                      Sans trame (document Word simple)
                    </span>
                  </label>
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="trame"
                          checked={selectedTemplateId === t.id}
                          onChange={() => setSelectedTemplateId(t.id)}
                        />
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{t.name}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setTemplateToDelete(t)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="Supprimer cette trame"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Importe la trame Word vierge fournie par ton centre : elle sera
                      mémorisée pour les prochaines évaluations.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Étape 5 : instructions + anti-doublon + estimation */}
            {selectedCompetenceIds.size > 0 && selectedCourseIds.size > 0 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>
                    Instructions supplémentaires{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (optionnel)
                    </span>
                  </Label>
                  <Textarea
                    placeholder="Ex : contexte guyanais, secteur médico-social, insister sur la posture professionnelle…"
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    rows={2}
                  />
                </div>

                {overlappingEvals.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {overlappingEvals.length > 1
                        ? `${overlappingEvals.length} sujets existent déjà sur ces compétences`
                        : "Un sujet existe déjà sur ces compétences"}{" "}
                      : {overlappingEvals.map((e) => `« ${e.title} »`).join(", ")}. Le nouveau
                      sujet sera généré avec un scénario différent.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleEstimate}
                  disabled={!canEstimate || estimating}
                  variant="outline"
                  className="w-full"
                >
                  {estimating ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Euro className="h-4 w-4" />
                  )}
                  Estimer le coût
                </Button>

                {costEstimate && (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 font-medium">
                            <Euro className="h-3.5 w-3.5" />
                            {costEstimate.estimatedCost.toFixed(3)} EUR
                          </span>
                          <span className="text-muted-foreground">
                            Modèle : {costEstimate.modelDisplayName}
                          </span>
                        </div>
                        {selectedTemplateId && (
                          <p className="text-xs text-muted-foreground">
                            + un second appel (léger) au moment du remplissage de la trame
                          </p>
                        )}
                      </div>
                      {costEstimate.needsConfirmation && (
                        <Badge variant="outline" className="border-amber-300 text-amber-600">
                          Coût élevé
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {costEstimate &&
                  (generating ? (
                    <Button
                      onClick={() => abortRef.current?.abort()}
                      variant="destructive"
                      className="w-full"
                    >
                      <Square className="h-4 w-4" />
                      Arrêter la génération
                    </Button>
                  ) : (
                    <Button onClick={handleGenerate} className="w-full">
                      <Sparkles className="h-4 w-4" />
                      Générer l'évaluation
                    </Button>
                  ))}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* ─── Colonne droite : résultat ─── */}
          <div className="space-y-4">
            {!generatedContent && !generating && (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed py-16">
                <Target className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Le sujet d'évaluation apparaîtra ici
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Formation → épreuve → compétences → cours → trame, puis génère
                </p>
              </div>
            )}

            {generating && !generatedContent && (
              <div className="flex flex-col items-center justify-center rounded-xl border py-16">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium text-foreground">
                  Génération du sujet en cours...
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
                    Génération en cours — clique sur « Arrêter » si tu veux stopper ici
                  </div>
                )}

                {!generating && (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {generatedTitle}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Euro className="h-3 w-3" />
                            {generationCost.toFixed(3)} EUR
                          </span>
                          <span>{generationModel}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {durationLabel(parseInt(duration, 10) || 0)}
                          </span>
                        </div>
                      </div>
                      {baremeTotal !== null && (
                        <Badge
                          variant="outline"
                          className={
                            baremeTotal === 100
                              ? "shrink-0 border-green-300 bg-green-50 text-green-700"
                              : "shrink-0 border-amber-300 bg-amber-50 text-amber-700"
                          }
                        >
                          Barème : {baremeTotal}/100
                          {baremeTotal !== 100 && " ⚠️"}
                        </Badge>
                      )}
                    </div>

                    {baremeTotal !== null && baremeTotal !== 100 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          La somme des points du sujet fait {baremeTotal} au lieu de 100.
                          Corrige le barème avec « Modifier » avant d'exporter, ou relance la
                          génération.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Barre d'actions */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
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
                        {saved ? "Enregistrée" : "Enregistrer"}
                      </Button>
                    </div>

                    {/* Exports */}
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplateId && (
                        <Button
                          size="sm"
                          disabled={exporting !== null}
                          onClick={() =>
                            handleExportTrame(
                              displayedContent,
                              generatedTitle,
                              selectedCompetenceIds,
                              selectedTemplateId,
                            )
                          }
                        >
                          {exporting === "trame" ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Sujet · Trame du centre
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={exporting !== null}
                        onClick={() => handleExportSimple(displayedContent, generatedTitle)}
                      >
                        {exporting === "simple" ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Sujet · Word simple
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                        disabled={exporting !== null}
                        onClick={() => handleExportCorrige(displayedContent, generatedTitle)}
                      >
                        {exporting === "corrige" ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                        Corrigé évaluateur
                      </Button>
                    </div>

                    {/* Toggle sujet / corrigé */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCorrige(false)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          !showCorrige
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Sujet candidat
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCorrige(true)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                          showCorrige
                            ? "bg-amber-100 text-amber-800"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Lock className="h-3 w-3" />
                        Corrigé (🔒 formateur)
                      </button>
                    </div>
                  </>
                )}

                {/* Aperçu */}
                {editing ? (
                  <Textarea
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    rows={24}
                    className="font-mono text-xs"
                  />
                ) : (
                  <div className="max-h-[70vh] overflow-y-auto rounded-xl border bg-background p-5">
                    <RichMarkdown
                      content={
                        generating
                          ? generatedContent
                          : showCorrige
                            ? extractFormateurSection(displayedContent) ||
                              "*Aucune section corrigé trouvée.*"
                            : sujetOnly
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Historique ─── */}
      {activeCentreId && activeTab === "history" && (
        <div className="space-y-4">
          {!selectedFormationId ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Choisis d'abord une formation dans l'onglet « Nouvelle évaluation ».
              </AlertDescription>
            </Alert>
          ) : loadingHistory ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <History className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Aucune évaluation générée pour cette formation
              </p>
              <Button variant="outline" onClick={() => setActiveTab("create")}>
                <Sparkles className="h-4 w-4" />
                Créer une évaluation
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <EvalHistoryCard
                  key={item.id}
                  item={item}
                  compCodes={Array.from(contentLinks.get(item.id) ?? [])
                    .map((id) => allComps.find((c) => c.id === id)?.code)
                    .filter((c): c is string => Boolean(c))}
                  templates={templates}
                  exporting={exporting !== null}
                  onExportTrame={(templateId) =>
                    handleExportTrame(
                      item.content_markdown,
                      item.title,
                      contentLinks.get(item.id) ?? new Set(),
                      templateId,
                    )
                  }
                  onExportSimple={() => handleExportSimple(item.content_markdown, item.title)}
                  onExportCorrige={() =>
                    handleExportCorrige(item.content_markdown, item.title)
                  }
                  onDeleted={() => {
                    loadHistory();
                    if (selectedFormationId) loadContents(selectedFormationId);
                  }}
                />
              ))}
            </div>
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

      <ConfirmDialog
        open={templateToDelete !== null}
        title="Supprimer cette trame ?"
        message={`La trame « ${templateToDelete?.name ?? ""} » sera retirée de la bibliothèque du centre. Les évaluations déjà exportées ne sont pas affectées.`}
        onConfirm={handleDeleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
}

// ─── Carte historique ─────────────────────────────────────────

function EvalHistoryCard({
  item,
  compCodes,
  templates,
  exporting,
  onExportTrame,
  onExportSimple,
  onExportCorrige,
  onDeleted,
}: {
  item: GeneratedContent;
  compCodes: string[];
  templates: EvalTemplate[];
  exporting: boolean;
  onExportTrame: (templateId: string) => void;
  onExportSimple: () => void;
  onExportCorrige: () => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCorrige, setShowCorrige] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0]!.id);
  }, [templates, templateId]);

  async function handleDelete() {
    try {
      await db.deleteContent(item.id);
      onDeleted();
    } catch (err) {
      console.error("Erreur suppression évaluation :", err);
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer py-3" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">{item.title}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Évaluation ECF
                </Badge>
                {compCodes.map((code) => (
                  <Badge key={code} variant="outline" className="text-xs text-primary">
                    {code}
                  </Badge>
                ))}
                {item.estimated_duration && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {durationLabel(item.estimated_duration)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateShort(item.created_at)}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {templates.length > 0 && (
              <>
                {templates.length > 1 && (
                  <Select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="h-8 w-auto text-xs"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Button
                  size="sm"
                  disabled={exporting || !templateId || compCodes.length === 0}
                  onClick={() => onExportTrame(templateId)}
                  title={
                    compCodes.length === 0
                      ? "Compétences non liées — utilise l'export Word simple"
                      : undefined
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  Trame du centre
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" disabled={exporting} onClick={onExportSimple}>
              <Download className="h-3.5 w-3.5" />
              Sujet Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={exporting}
              onClick={onExportCorrige}
            >
              <Lock className="h-3.5 w-3.5" />
              Corrigé
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowCorrige(false)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  !showCorrige
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sujet
              </button>
              <button
                type="button"
                onClick={() => setShowCorrige(true)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  showCorrige
                    ? "bg-amber-100 text-amber-800"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Corrigé
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border bg-background p-4">
            <RichMarkdown
              content={
                showCorrige
                  ? extractFormateurSection(item.content_markdown) ||
                    "*Aucune section corrigé trouvée.*"
                  : stripFormateur(item.content_markdown)
              }
            />
          </div>
        </CardContent>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette évaluation ?"
        message={`« ${item.title} » sera définitivement supprimée.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Card>
  );
}
