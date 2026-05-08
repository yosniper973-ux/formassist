import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FileText,
  Search,
  ArrowLeft,
  Pencil,
  Trash2,
  Sparkles,
  Clock,
  Target,
  Send,
  Loader2,
  Save,
  GripVertical,
  CalendarPlus,
  Check,
  Download,
} from "lucide-react";
import { AddToPlanningDialog } from "@/features/planning/AddToPlanningDialog";
import { markdownToPdf, downloadPdf } from "@/lib/pdf-export";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { DownloadToast } from "@/components/ui/download-toast";
import { db } from "@/lib/db";
import { request as claudeRequest } from "@/lib/claude";
import { useAppStore } from "@/stores/appStore";
import type { Formation, CCP, Competence } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateShort } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface Phase {
  name: string;
  duration: string;
  method: string;
  materials: string;
  content: string;
}

interface PedagogicalSheet {
  id: string;
  formation_id: string;
  title: string;
  general_objective: string;
  sub_objectives: string[];
  targeted_cps: string[];
  phases: Phase[];
  model_used: string | null;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SheetRow {
  id: string;
  formation_id: string;
  title: string;
  general_objective: string;
  sub_objectives: string;
  targeted_cps: string;
  phases: string;
  model_used: string | null;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

type ViewMode = "list" | "create" | "detail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSheet(row: SheetRow): PedagogicalSheet {
  return {
    ...row,
    sub_objectives: safeParseJson<string[]>(row.sub_objectives, []),
    targeted_cps: safeParseJson<string[]>(row.targeted_cps, []),
    phases: safeParseJson<Phase[]>(row.phases, []),
  };
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parsePhaseMinutes(duration: string): number {
  if (!duration) return 0;
  const text = duration.toLowerCase();
  const hoursMatch = text.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const minutesMatch = text.match(/(\d+)\s*m/);
  let total = 0;
  if (hoursMatch?.[1]) total += Math.round(parseFloat(hoursMatch[1].replace(",", ".")) * 60);
  if (minutesMatch?.[1]) total += parseInt(minutesMatch[1], 10);
  if (total === 0) {
    const bare = text.match(/(\d+)/);
    if (bare?.[1]) total = parseInt(bare[1], 10);
  }
  return total;
}

function totalMinutesFromPhases(phases: Phase[]): number | null {
  const total = phases.reduce((sum, p) => sum + parsePhaseMinutes(p.duration), 0);
  return total > 0 ? total : null;
}

function sheetToMarkdown(sheet: PedagogicalSheet, formationTitle?: string): string {
  const lines: string[] = [];
  lines.push(`# ${sheet.title}`);
  if (formationTitle) lines.push("", `*${formationTitle} — v${sheet.version}*`);

  if (sheet.general_objective) {
    lines.push("", "## Objectif général", "", sheet.general_objective);
  }

  if (sheet.sub_objectives.length > 0) {
    lines.push("", "## Sous-objectifs", "");
    sheet.sub_objectives.forEach((o) => lines.push(`- ${o}`));
  }

  if (sheet.targeted_cps.length > 0) {
    lines.push("", "## Compétences ciblées", "");
    sheet.targeted_cps.forEach((c) => lines.push(`- ${c}`));
  }

  if (sheet.phases.length > 0) {
    lines.push("", "## Déroulement", "");
    lines.push("| # | Phase | Durée | Méthode | Matériel |");
    lines.push("|---|-------|-------|---------|----------|");
    sheet.phases.forEach((p, idx) => {
      lines.push(
        `| ${idx + 1} | ${p.name} | ${p.duration} | ${p.method} | ${p.materials} |`,
      );
    });

    sheet.phases.forEach((p, idx) => {
      lines.push("", `### Phase ${idx + 1} — ${p.name}`, "");
      if (p.duration) lines.push(`**Durée :** ${p.duration}`);
      if (p.method) lines.push(`**Méthode :** ${p.method}`);
      if (p.materials) lines.push(`**Matériel :** ${p.materials}`);
      if (p.content) lines.push("", p.content);
    });
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function FichesPedagoPage() {
  const { activeCentreId, addApiCost } = useAppStore();

  // Navigation
  const [view, setView] = useState<ViewMode>("list");
  const [selectedSheet, setSelectedSheet] = useState<PedagogicalSheet | null>(null);

  // Données
  const [sheets, setSheets] = useState<PedagogicalSheet[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [ccps, setCcps] = useState<CCP[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Formulaire de creation
  const [formFormationId, setFormFormationId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formObjective, setFormObjective] = useState("");
  const [formSubObjectives, setFormSubObjectives] = useState("");
  const [formSelectedCps, setFormSelectedCps] = useState<string[]>([]);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Edition detail
  const [editingPhaseIndex, setEditingPhaseIndex] = useState<number | null>(null);
  const [editPhase, setEditPhase] = useState<Phase | null>(null);
  const [saving, setSaving] = useState(false);

  // Mini-conversation
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Suppression
  const [toDeleteSheet, setToDeleteSheet] = useState<PedagogicalSheet | null>(null);

  // Add to planning
  const [showAddToPlanning, setShowAddToPlanning] = useState(false);
  const [planningToast, setPlanningToast] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ path: string; name: string } | null>(null);

  // -------------------------------------------------------------------------
  // Chargement des donnees
  // -------------------------------------------------------------------------

  const loadSheets = useCallback(async () => {
    setLoading(true);
    try {
      let formationIds: string[] = [];

      if (activeCentreId) {
        const rows = (await db.getFormations(activeCentreId)) as unknown as Formation[];
        setFormations(rows);
        formationIds = rows.map((f) => f.id);
      } else {
        const allCentres = await db.query<{ id: string }>("SELECT id FROM centres WHERE archived_at IS NULL");
        const all: Formation[] = [];
        for (const c of allCentres) {
          const rows = (await db.getFormations(c.id)) as unknown as Formation[];
          all.push(...rows);
        }
        setFormations(all);
        formationIds = all.map((f) => f.id);
      }

      if (formationIds.length === 0) {
        setSheets([]);
        return;
      }

      const placeholders = formationIds.map(() => "?").join(",");
      const rows = await db.query<SheetRow>(
        `SELECT * FROM pedagogical_sheets WHERE archived_at IS NULL AND formation_id IN (${placeholders}) ORDER BY updated_at DESC`,
        formationIds,
      );
      setSheets(rows.map(parseSheet));
    } finally {
      setLoading(false);
    }
  }, [activeCentreId]);

  const loadCompetences = useCallback(async (formationId: string) => {
    const ccpRows = await db.query<CCP>(
      "SELECT * FROM ccps WHERE formation_id = ? ORDER BY sort_order",
      [formationId],
    );
    setCcps(ccpRows);

    if (ccpRows.length > 0) {
      const ccpIds = ccpRows.map((c) => c.id);
      const placeholders = ccpIds.map(() => "?").join(",");
      const cpRows = await db.query<Competence>(
        `SELECT * FROM competences WHERE ccp_id IN (${placeholders}) ORDER BY sort_order`,
        ccpIds,
      );
      setCompetences(cpRows);
    } else {
      setCompetences([]);
    }
  }, []);

  useEffect(() => {
    loadSheets();
  }, [loadSheets]);

  useEffect(() => {
    if (formFormationId) {
      loadCompetences(formFormationId);
    } else {
      setCcps([]);
      setCompetences([]);
    }
  }, [formFormationId, loadCompetences]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  function openCreate() {
    setFormFormationId(formations[0]?.id ?? "");
    setFormTitle("");
    setFormObjective("");
    setFormSubObjectives("");
    setFormSelectedCps([]);
    setGenerationError(null);
    setView("create");
  }

  function openDetail(sheet: PedagogicalSheet) {
    setSelectedSheet(sheet);
    setEditingPhaseIndex(null);
    setEditPhase(null);
    setConversation([]);
    setChatInput("");
    loadCompetences(sheet.formation_id);
    setView("detail");
  }

  function backToList() {
    setView("list");
    setSelectedSheet(null);
    loadSheets();
  }

  function toggleCp(cpCode: string) {
    setFormSelectedCps((prev) =>
      prev.includes(cpCode) ? prev.filter((c) => c !== cpCode) : [...prev, cpCode],
    );
  }

  // -------------------------------------------------------------------------
  // Generation avec Claude
  // -------------------------------------------------------------------------

  async function handleGenerate() {
    if (!formFormationId || !formTitle.trim() || !formObjective.trim()) {
      setGenerationError("Remplis au moins le titre et l'objectif general.");
      return;
    }

    setGenerating(true);
    setGenerationError(null);

    try {
      const formation = formations.find((f) => f.id === formFormationId);
      const selectedCompetences = competences.filter((cp) =>
        formSelectedCps.includes(cp.code),
      );

      const userMessage = buildGenerationPrompt({
        formationTitle: formation?.title ?? "",
        title: formTitle.trim(),
        objective: formObjective.trim(),
        subObjectives: formSubObjectives
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        competences: selectedCompetences,
      });

      const response = await claudeRequest({
        task: "generation_fiche_pedagogique",
        messages: [{ role: "user", content: userMessage }],
        context: { formationId: formFormationId },
      });

      addApiCost(response.costEuros);

      const generated = safeParseJson<{ phases?: Phase[]; sub_objectives?: string[] }>(
        extractJson(response.content),
        {},
      );

      const phases = generated.phases ?? [];
      const subObjectives = formSubObjectives
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const id = db.generateId();
      const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

      await db.execute(
        `INSERT INTO pedagogical_sheets (id, formation_id, title, general_objective, sub_objectives, targeted_cps, phases, model_used, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          formFormationId,
          formTitle.trim(),
          formObjective.trim(),
          JSON.stringify(subObjectives),
          JSON.stringify(formSelectedCps),
          JSON.stringify(phases),
          response.model,
          nowStr,
          nowStr,
        ],
      );

      const newSheet: PedagogicalSheet = {
        id,
        formation_id: formFormationId,
        title: formTitle.trim(),
        general_objective: formObjective.trim(),
        sub_objectives: subObjectives,
        targeted_cps: formSelectedCps,
        phases,
        model_used: response.model,
        version: 1,
        archived_at: null,
        created_at: nowStr,
        updated_at: nowStr,
      };

      setConversation([
        { role: "user", content: userMessage },
        { role: "assistant", content: response.content },
      ]);

      openDetail(newSheet);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Erreur lors de la generation.");
    } finally {
      setGenerating(false);
    }
  }

  function buildGenerationPrompt(params: {
    formationTitle: string;
    title: string;
    objective: string;
    subObjectives: string[];
    competences: Competence[];
  }): string {
    let prompt = `Genere une fiche pedagogique structuree pour la formation "${params.formationTitle}".

Titre de la seance : ${params.title}
Objectif general : ${params.objective}`;

    if (params.subObjectives.length > 0) {
      prompt += `\nSous-objectifs :\n${params.subObjectives.map((s) => `- ${s}`).join("\n")}`;
    }

    if (params.competences.length > 0) {
      prompt += `\nCompetences visees :\n${params.competences.map((cp) => `- ${cp.code} : ${cp.title}`).join("\n")}`;
    }

    prompt += `\n\nReponds UNIQUEMENT avec un objet JSON valide au format :
{
  "phases": [
    {
      "name": "Nom de la phase",
      "duration": "ex: 15 min",
      "method": "ex: Expositive, Interrogative, Active...",
      "materials": "ex: Diaporama, tableau blanc...",
      "content": "Description detaillee du contenu et des activites"
    }
  ]
}

Inclus au minimum : accueil/introduction, apport theorique, mise en pratique, synthese/bilan.`;

    return prompt;
  }

  function extractJson(text: string): string {
    // Tente d'extraire un bloc JSON du texte
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }

  // -------------------------------------------------------------------------
  // Edition de phase
  // -------------------------------------------------------------------------

  function startEditPhase(index: number) {
    if (!selectedSheet) return;
    setEditingPhaseIndex(index);
    const phase = selectedSheet.phases[index];
    if (phase) setEditPhase({ ...phase });
  }

  function cancelEditPhase() {
    setEditingPhaseIndex(null);
    setEditPhase(null);
  }

  async function savePhase() {
    if (!selectedSheet || editingPhaseIndex === null || !editPhase) return;

    setSaving(true);
    try {
      const updatedPhases = [...selectedSheet.phases];
      updatedPhases[editingPhaseIndex] = editPhase;

      const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

      await db.execute(
        "UPDATE pedagogical_sheets SET phases = ?, version = version + 1, updated_at = ? WHERE id = ?",
        [JSON.stringify(updatedPhases), nowStr, selectedSheet.id],
      );

      setSelectedSheet({
        ...selectedSheet,
        phases: updatedPhases,
        version: selectedSheet.version + 1,
        updated_at: nowStr,
      });
      setEditingPhaseIndex(null);
      setEditPhase(null);
    } finally {
      setSaving(false);
    }
  }

  async function deletePhase(index: number) {
    if (!selectedSheet) return;

    const updatedPhases = selectedSheet.phases.filter((_, i) => i !== index);
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

    await db.execute(
      "UPDATE pedagogical_sheets SET phases = ?, version = version + 1, updated_at = ? WHERE id = ?",
      [JSON.stringify(updatedPhases), nowStr, selectedSheet.id],
    );

    setSelectedSheet({
      ...selectedSheet,
      phases: updatedPhases,
      version: selectedSheet.version + 1,
      updated_at: nowStr,
    });
  }

  async function deleteSheet(sheetId: string) {
    await db.deletePedagogicalSheet(sheetId);
    backToList();
  }

  // -------------------------------------------------------------------------
  // Mini-conversation
  // -------------------------------------------------------------------------

  async function handleChat() {
    if (!chatInput.trim() || !selectedSheet) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    const updatedConv: ConversationMessage[] = [
      ...conversation,
      { role: "user", content: userMsg },
    ];
    setConversation(updatedConv);

    try {
      const contextMsg = `Voici la fiche pedagogique actuelle :\n${JSON.stringify(selectedSheet.phases, null, 2)}\n\nDemande de l'utilisateur : ${userMsg}\n\nSi tu proposes des modifications, reponds avec le JSON complet des phases mises a jour dans un bloc JSON. Sinon, reponds en texte.`;

      const response = await claudeRequest({
        task: "generation_fiche_pedagogique",
        messages: [
          ...updatedConv.slice(0, -1).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: contextMsg },
        ],
        context: { formationId: selectedSheet.formation_id },
      });

      addApiCost(response.costEuros);

      setConversation([...updatedConv, { role: "assistant", content: response.content }]);

      // Tente d'appliquer les phases modifiees
      const jsonStr = extractJson(response.content);
      const parsed = safeParseJson<{ phases?: Phase[] }>(jsonStr, {});
      if (parsed.phases && parsed.phases.length > 0) {
        const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

        await db.execute(
          "UPDATE pedagogical_sheets SET phases = ?, version = version + 1, updated_at = ? WHERE id = ?",
          [JSON.stringify(parsed.phases), nowStr, selectedSheet.id],
        );

        setSelectedSheet({
          ...selectedSheet,
          phases: parsed.phases,
          version: selectedSheet.version + 1,
          updated_at: nowStr,
        });
      }
    } catch (err) {
      setConversation([
        ...updatedConv,
        {
          role: "assistant",
          content: `Erreur : ${err instanceof Error ? err.message : "Impossible de contacter Claude."}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Filtrage
  // -------------------------------------------------------------------------

  const filtered = sheets.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.general_objective.toLowerCase().includes(search.toLowerCase()),
  );

  // -------------------------------------------------------------------------
  // Rendu : Vue creation
  // -------------------------------------------------------------------------

  if (view === "create") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={backToList}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Nouvelle fiche pedagogique</h1>
            <p className="text-sm text-muted-foreground">
              Remplis les infos de base, Claude generera les phases.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-2xl space-y-5">
          {/* Formation */}
          <div className="space-y-1.5">
            <Label htmlFor="formation">Formation</Label>
            <select
              id="formation"
              value={formFormationId}
              onChange={(e) => setFormFormationId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">-- Choisis une formation --</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>

          {/* Titre */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre de la seance</Label>
            <Input
              id="title"
              placeholder="Ex : Initiation au HTML/CSS"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          {/* Objectif */}
          <div className="space-y-1.5">
            <Label htmlFor="objective">Objectif general</Label>
            <Textarea
              id="objective"
              placeholder="Que doivent savoir faire les apprenants a la fin ?"
              value={formObjective}
              onChange={(e) => setFormObjective(e.target.value)}
              rows={3}
            />
          </div>

          {/* Sous-objectifs */}
          <div className="space-y-1.5">
            <Label htmlFor="sub-objectives">Sous-objectifs (un par ligne)</Label>
            <Textarea
              id="sub-objectives"
              placeholder={"Comprendre la structure d'une page HTML\nUtiliser les selecteurs CSS de base"}
              value={formSubObjectives}
              onChange={(e) => setFormSubObjectives(e.target.value)}
              rows={4}
            />
          </div>

          {/* Competences */}
          {ccps.length > 0 && (
            <div className="space-y-2">
              <Label>Competences visees</Label>
              <div className="space-y-3">
                {ccps.map((ccp) => {
                  const cpList = competences.filter((cp) => cp.ccp_id === ccp.id);
                  if (cpList.length === 0) return null;
                  return (
                    <div key={ccp.id} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {ccp.code} - {ccp.title}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {cpList.map((cp) => (
                          <Badge
                            key={cp.id}
                            variant={formSelectedCps.includes(cp.code) ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleCp(cp.code)}
                          >
                            {cp.code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {generationError && (
            <Alert variant="destructive">
              <AlertDescription>{generationError}</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generation en cours...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generer avec Claude
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Rendu : Vue detail
  // -------------------------------------------------------------------------

  if (view === "detail" && selectedSheet) {
    const formation = formations.find((f) => f.id === selectedSheet.formation_id);

    return (
      <div className="space-y-6">
        {/* En-tete */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={backToList}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{selectedSheet.title}</h1>
              <p className="text-sm text-muted-foreground">
                {formation?.title ?? "Formation inconnue"} — v{selectedSheet.version}
                {" — "}
                {formatDateShort(selectedSheet.updated_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const md = sheetToMarkdown(selectedSheet, formation?.title);
                  const blob = await markdownToDocx(md);
                  const savedPath = await downloadDocx(blob, selectedSheet.title || "fiche-pedago");
                  if (savedPath) {
                    setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
                  }
                } catch (err) {
                  console.error("Export Word fiche:", err);
                  alert(err instanceof Error ? err.message : "Erreur export Word");
                }
              }}
            >
              <Download className="h-4 w-4" />
              Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const md = sheetToMarkdown(selectedSheet, formation?.title);
                  const blob = await markdownToPdf(md);
                  const savedPath = await downloadPdf(blob, selectedSheet.title || "fiche-pedago");
                  if (savedPath) {
                    setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
                  }
                } catch (err) {
                  console.error("Export PDF fiche:", err);
                  alert(err instanceof Error ? err.message : "Erreur export PDF");
                }
              }}
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddToPlanning(true)}
            >
              <CalendarPlus className="h-4 w-4" />
              Ajouter au planning
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setToDeleteSheet(selectedSheet)}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          </div>
        </div>

        <AddToPlanningDialog
          open={showAddToPlanning}
          onClose={() => setShowAddToPlanning(false)}
          defaultFormationId={selectedSheet.formation_id}
          defaultTitle={selectedSheet.title}
          defaultDescription={selectedSheet.general_objective}
          defaultDurationMinutes={totalMinutesFromPhases(selectedSheet.phases)}
          onCreated={async (slotId) => {
            try {
              await db.linkSheetToSlot(selectedSheet.id, slotId);
              setPlanningToast("Créneau créé et fiche liée au planning.");
              setTimeout(() => setPlanningToast(null), 4000);
            } catch (err) {
              console.error("Erreur liaison fiche/slot:", err);
            }
          }}
        />

        {planningToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 shadow-lg animate-in slide-in-from-bottom-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
              <Check className="h-4 w-4 text-green-700" />
            </div>
            <p className="text-sm font-medium text-green-900">{planningToast}</p>
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
          open={toDeleteSheet !== null}
          title={`Supprimer la fiche "${toDeleteSheet?.title ?? ""}" ?`}
          message={"Cette action supprime définitivement la fiche pédagogique et toutes ses phases.\n\nCette action est irréversible."}
          confirmLabel="Supprimer définitivement"
          onConfirm={async () => {
            if (!toDeleteSheet) return;
            await deleteSheet(toDeleteSheet.id);
            setToDeleteSheet(null);
          }}
          onCancel={() => setToDeleteSheet(null)}
        />

        {/* Objectifs */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Objectif general</p>
            <p className="text-sm text-foreground">{selectedSheet.general_objective}</p>
          </div>
          {selectedSheet.sub_objectives.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Sous-objectifs</p>
              <ul className="mt-1 list-inside list-disc text-sm text-foreground">
                {selectedSheet.sub_objectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          )}
          {selectedSheet.targeted_cps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Competences visees</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedSheet.targeted_cps.map((cp) => (
                  <Badge key={cp} variant="outline" className="text-xs">
                    {cp}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Phases */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Deroulement ({selectedSheet.phases.length} phases)
          </h2>

          {selectedSheet.phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune phase generee.</p>
          ) : (
            selectedSheet.phases.map((phase, index) => (
              <div
                key={index}
                className="rounded-xl border bg-card p-4 space-y-2"
              >
                {editingPhaseIndex === index && editPhase ? (
                  /* Mode edition */
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Nom de la phase</Label>
                      <Input
                        value={editPhase.name}
                        onChange={(e) =>
                          setEditPhase({ ...editPhase, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Duree</Label>
                        <Input
                          value={editPhase.duration}
                          onChange={(e) =>
                            setEditPhase({ ...editPhase, duration: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Methode</Label>
                        <Input
                          value={editPhase.method}
                          onChange={(e) =>
                            setEditPhase({ ...editPhase, method: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Materiels</Label>
                      <Input
                        value={editPhase.materials}
                        onChange={(e) =>
                          setEditPhase({ ...editPhase, materials: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Contenu</Label>
                      <Textarea
                        value={editPhase.content}
                        onChange={(e) =>
                          setEditPhase({ ...editPhase, content: e.target.value })
                        }
                        rows={5}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={savePhase} disabled={saving}>
                        {saving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditPhase}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Mode lecture */
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-foreground">{phase.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEditPhase(index)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deletePhase(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {phase.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {phase.method}
                      </span>
                      {phase.materials && (
                        <span>{phase.materials}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {phase.content}
                    </p>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Mini-conversation */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Affiner avec Claude
          </h3>

          {conversation.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2 text-sm">
              {conversation.slice(-4).map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-2 ${
                    msg.role === "user"
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {msg.role === "user" ? "Toi" : "Claude"}
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap">{msg.content.substring(0, 500)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Ex : Ajoute une phase de jeu de role apres la theorie..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChat();
                }
              }}
              disabled={chatLoading}
            />
            <Button size="icon" onClick={handleChat} disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Rendu : Vue liste
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fiches pedagogiques</h1>
          <p className="text-sm text-muted-foreground">
            {sheets.length} fiche(s)
            {activeCentreId ? "" : " — tous centres confondus"}
          </p>
        </div>
        <Button onClick={openCreate} disabled={formations.length === 0}>
          <Plus className="h-4 w-4" />
          Nouvelle fiche
        </Button>
      </div>

      {formations.length === 0 && !loading && (
        <Alert>
          <AlertDescription>
            Cree d'abord une formation pour pouvoir ajouter des fiches pedagogiques.
          </AlertDescription>
        </Alert>
      )}

      {/* Recherche */}
      {sheets.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une fiche..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">
              {search ? "Aucun resultat" : "Aucune fiche pedagogique"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Essaie un autre terme de recherche."
                : "Cree ta premiere fiche pour structurer tes seances."}
            </p>
          </div>
          {!search && formations.length > 0 && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Creer une fiche
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sheet) => {
            const formation = formations.find((f) => f.id === sheet.formation_id);
            return (
              <div
                key={sheet.id}
                className="group flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
                onClick={() => openDetail(sheet)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-foreground">{sheet.title}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formation?.title ?? "Formation inconnue"}</span>
                    <span>{formatDateShort(sheet.updated_at)}</span>
                    <span>{sheet.phases.length} phases</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sheet.targeted_cps.slice(0, 3).map((cp) => (
                    <Badge key={cp} variant="outline" className="text-xs">
                      {cp}
                    </Badge>
                  ))}
                  {sheet.targeted_cps.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{sheet.targeted_cps.length - 3}
                    </Badge>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDeleteSheet(sheet);
                    }}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    aria-label="Supprimer la fiche"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={toDeleteSheet !== null && view === "list"}
        title={`Supprimer la fiche "${toDeleteSheet?.title ?? ""}" ?`}
        message={"Cette action supprime définitivement la fiche pédagogique et toutes ses phases.\n\nCette action est irréversible."}
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!toDeleteSheet) return;
          await db.deletePedagogicalSheet(toDeleteSheet.id);
          setToDeleteSheet(null);
          loadSheets();
        }}
        onCancel={() => setToDeleteSheet(null)}
      />
    </div>
  );
}
