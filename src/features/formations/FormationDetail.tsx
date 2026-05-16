import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Upload,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { db } from "@/lib/db";
import { requestStream } from "@/lib/claude";
import type { Formation, CCP, Competence, EvaluationCriterion, ExtraActivity } from "@/types";
import type { ClaudeContentBlock } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Extrait le premier objet JSON valide d'un texte quelconque.
 * - Cherche d'abord un bloc ```json … ```
 * - Sinon, trouve le premier { et suit les accolades imbriquées pour trouver
 *   le } correspondant (robuste même si Claude ajoute du texte après le JSON).
 * Retourne null si aucun objet JSON complet n'est trouvé.
 */
function extractJsonObject(text: string): string | null {
  // 1. Bloc de code markdown
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock?.[1]?.trim().startsWith("{")) return codeBlock[1];

  // 2. Comptage d'accolades — évite que la regex greedy capture du texte parasite
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (inString && ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // JSON tronqué (depth > 0 jusqu'à la fin)
}

/** Prompt dédié extraction savoirs — format texte, pas JSON */
const SAVOIRS_EXTRACTION_PROMPT = `Tu es un expert des REAC (Référentiels Emploi Activités Compétences) du Ministère du Travail français.

Analyse le REAC fourni et extrais les savoirs et savoir-faire de chaque fiche compétence professionnelle.

FORMAT DE SORTIE OBLIGATOIRE — texte brut uniquement, sans JSON, sans markdown :

=== CP1 ===
TECHNIQUE | item savoir-faire technique
ORGANISATIONNEL | item savoir-faire organisationnel
RELATIONNEL | item savoir-faire relationnel
SAVOIR | item savoir théorique

=== CP2 ===
...

RÈGLES STRICTES :
- CODE entre === === = code exact de la compétence (CP1, CP2, C1, C2, etc.)
- Une ligne par item, préfixée par sa catégorie et le caractère |
- Catégories autorisées : TECHNIQUE, ORGANISATIONNEL, RELATIONNEL, SAVOIR
- Pour les REAC sans séparation explicite des catégories :
  * Items commençant par "Connaissance" → SAVOIR
  * Items décrivant des actions concrètes ou gestuelles → TECHNIQUE (si doute → TECHNIQUE)
  * Items sur l'organisation du travail → ORGANISATIONNEL
  * Items sur les relations humaines → RELATIONNEL
- Copie les items EXACTEMENT tels qu'ils apparaissent dans le document (guillemets compris)
- Ne saute aucune fiche compétence professionnelle`;

/** Parse le format texte pipe-séparé retourné par Claude pour les savoirs */
function parseSavoirsText(text: string): Array<{
  code: string;
  savoirs: {
    sf_techniques: string[];
    sf_organisationnels: string[];
    sf_relationnels: string[];
    savoirs: string[];
  };
}> {
  const result: ReturnType<typeof parseSavoirsText> = [];

  // Découpe par marqueurs === CODE ===
  const parts = text.split(/\n?===\s*(.+?)\s*===\n?/);

  for (let i = 1; i < parts.length; i += 2) {
    const code = parts[i]!.trim();
    const content = parts[i + 1] ?? "";

    const savoirs = {
      sf_techniques: [] as string[],
      sf_organisationnels: [] as string[],
      sf_relationnels: [] as string[],
      savoirs: [] as string[],
    };

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("|")) continue;

      const pipeIdx = trimmed.indexOf("|");
      const category = trimmed.slice(0, pipeIdx).trim().toUpperCase();
      const item = trimmed.slice(pipeIdx + 1).trim();
      if (!item) continue;

      if (category === "TECHNIQUE") savoirs.sf_techniques.push(item);
      else if (category === "ORGANISATIONNEL") savoirs.sf_organisationnels.push(item);
      else if (category === "RELATIONNEL") savoirs.sf_relationnels.push(item);
      else if (category === "SAVOIR") savoirs.savoirs.push(item);
    }

    const total =
      savoirs.sf_techniques.length +
      savoirs.sf_organisationnels.length +
      savoirs.sf_relationnels.length +
      savoirs.savoirs.length;

    if (total > 0) result.push({ code, savoirs });
  }

  return result;
}

type Tab = "reac" | "perimetre" | "activites";

interface ReacTreeCCP extends CCP {
  competences: (Competence & { criteria: EvaluationCriterion[] })[];
}

interface Props {
  formation: Formation;
  onBack: () => void;
}

export function FormationDetail({ formation, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("reac");
  const [ccps, setCcps] = useState<ReacTreeCCP[]>([]);
  const [extraActivities, setExtraActivities] = useState<ExtraActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCcps, setExpandedCcps] = useState<Set<string>>(new Set());

  // Parsing
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  // Extraction des savoirs
  const [extractingSavoirs, setExtractingSavoirs] = useState(false);
  const [savoirsError, setSavoirsError] = useState("");
  const [savoirsSuccess, setSavoirsSuccess] = useState(false);

  // Nouvelle activité hors-REAC
  const [newActivityName, setNewActivityName] = useState("");

  useEffect(() => {
    loadReac();
  }, [formation.id]);

  async function loadReac() {
    setLoading(true);
    try {
      // Charger les CCP
      const ccpRows = await db.query<CCP>(
        "SELECT * FROM ccps WHERE formation_id = ? ORDER BY sort_order",
        [formation.id],
      );

      const tree: ReacTreeCCP[] = [];
      const expanded = new Set<string>();

      for (const ccp of ccpRows) {
        const compRows = await db.query<Competence>(
          "SELECT * FROM competences WHERE ccp_id = ? ORDER BY sort_order",
          [ccp.id],
        );

        const compsWithCriteria = [];
        for (const comp of compRows) {
          const criteria = await db.query<EvaluationCriterion>(
            "SELECT * FROM evaluation_criteria WHERE competence_id = ? ORDER BY sort_order",
            [comp.id],
          );
          compsWithCriteria.push({ ...comp, criteria });
        }

        tree.push({ ...ccp, competences: compsWithCriteria });
        expanded.add(ccp.id);
      }

      setCcps(tree);
      setExpandedCcps(expanded);

      // Charger les activités hors-REAC
      const activities = await db.query<ExtraActivity>(
        "SELECT * FROM extra_activities WHERE formation_id = ? ORDER BY sort_order",
        [formation.id],
      );
      setExtraActivities(activities);
    } finally {
      setLoading(false);
    }
  }

  function toggleCcp(id: string) {
    setExpandedCcps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Import et parsing du REAC ───

  async function handleReacFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setParseError("");

    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

      let messageContent: string | ClaudeContentBlock[];

      if (isPdf) {
        // file.arrayBuffer() + btoa : plus fiable que FileReader.readAsDataURL sur macOS WebKit.
        // FileReader peut retourner un résultat vide ou mal formé sur certaines versions WebKit.
        const arrayBuffer = await file.arrayBuffer();
        if (arrayBuffer.byteLength === 0) {
          throw new Error("Le fichier PDF semble vide ou illisible. Essaie de l'ouvrir d'abord dans Aperçu.");
        }
        const bytes = new Uint8Array(arrayBuffer);
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += 8192) {
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
        }
        const base64 = btoa(chunks.join(""));
        messageContent = [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `Voici le REAC (Référentiel Emploi Activités Compétences) pour la formation "${formation.title}".\n\nExtrais la structure hiérarchique complète : tous les CCP, toutes les compétences (CP) de chaque CCP, tous les critères d'évaluation, et les activités-types. Ne saute aucune compétence, même si le document est dense.`,
          },
        ];
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (!result.value.trim()) {
          throw new Error("Impossible de lire ce fichier Word. Essaie de l'exporter en PDF depuis Word.");
        }
        messageContent = `Voici le contenu d'un document REAC pour la formation "${formation.title}".\n\nExtrais la structure hiérarchique complète (CCP, compétences, critères d'évaluation, activités-types).\n\n---\n\n${result.value}`;
      } else {
        const text = await file.text();
        messageContent = `Voici le contenu d'un document REAC pour la formation "${formation.title}".\n\nExtrais la structure hiérarchique complète (CCP, compétences, critères d'évaluation, activités-types).\n\n---\n\n${text}`;
      }

      // Streaming : collecte tous les chunks puis parse le JSON
      // (plus fiable que tauriFetch pour les grandes réponses)
      let reacFullText = "";
      const reacAbort = new AbortController();
      for await (const chunk of requestStream(
        { task: "parsing_reac", maxTokens: 16000, messages: [{ role: "user", content: messageContent }] },
        reacAbort.signal,
      )) {
        reacFullText += chunk;
      }

      // Extraire le JSON avec comptage d'accolades (robuste face au texte parasite)
      let rawJson = extractJsonObject(reacFullText);
      if (!rawJson) {
        setParseError("La réponse de Claude ne contient pas de JSON valide. Réessaie.");
        return;
      }
      // Nettoyer les trailing commas (erreur fréquente de Claude)
      rawJson = rawJson.replace(/,(\s*[}\]])/g, "$1");

      let parsed: {
        ccps: Array<{
          code: string;
          title: string;
          competences: Array<{
            code: string;
            title: string;
            description?: string;
            criteria: string[];
          }>;
        }>;
        activity_types?: Array<{ title: string; description?: string }>;
        warnings?: string[];
      };
      try {
        parsed = JSON.parse(rawJson) as typeof parsed;
      } catch {
        setParseError("Claude n'a pas renvoyé un JSON valide. Réessaie.");
        return;
      }

      // Sauvegarde via commande Rust (connexion directe avec busy_timeout = 30s)
      await invoke("save_reac", {
        formationId: formation.id,
        ccps: parsed.ccps,
      });

      // Sauvegarder les activités-types
      if (parsed.activity_types) {
        for (let i = 0; i < parsed.activity_types.length; i++) {
          const at = parsed.activity_types[i]!;
          await db.execute(
            "INSERT INTO activities_types (id, formation_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)",
            [db.generateId(), formation.id, at.title, at.description ?? null, i],
          );
        }
      }

      // Recharger l'arbre
      await loadReac();

      if (parsed.warnings && parsed.warnings.length > 0) {
        setParseError(`Analyse terminée avec ${parsed.warnings.length} avertissement(s) : ${parsed.warnings.join(". ")}`);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err) !== "{}"
              ? JSON.stringify(err)
              : String(err);
      setParseError(`Erreur : ${msg}`);
      console.error(err);
    } finally {
      setParsing(false);
    }
  }

  // ─── Extraction des savoirs pour REAC existant ───

  async function handleExtractSavoirsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractingSavoirs(true);
    setSavoirsError("");
    setSavoirsSuccess(false);

    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      let messageContent: string | ClaudeContentBlock[];

      if (isPdf) {
        const arrayBuffer = await file.arrayBuffer();
        if (arrayBuffer.byteLength === 0) throw new Error("Le fichier PDF semble vide ou illisible.");
        const bytes = new Uint8Array(arrayBuffer);
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += 8192) {
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
        }
        const base64 = btoa(chunks.join(""));
        messageContent = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: `Voici le REAC pour la formation "${formation.title}". Extrais les savoirs et savoir-faire de chaque fiche compétence selon le format demandé.` },
        ];
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (!result.value.trim()) throw new Error("Impossible de lire ce fichier Word. Essaie de l'exporter en PDF.");
        messageContent = `Voici le REAC pour la formation "${formation.title}".\n\n---\n\n${result.value}`;
      } else {
        const text = await file.text();
        messageContent = `Voici le REAC pour la formation "${formation.title}".\n\n---\n\n${text}`;
      }

      // Collecte le texte streamé — format pipe, pas JSON
      let fullText = "";
      const abortCtrl = new AbortController();
      for await (const chunk of requestStream(
        {
          task: "parsing_reac",
          systemPromptOverride: SAVOIRS_EXTRACTION_PROMPT,
          maxTokens: 16000,
          messages: [{ role: "user", content: messageContent }],
        },
        abortCtrl.signal,
      )) {
        fullText += chunk;
      }

      const competencesSavoirs = parseSavoirsText(fullText);

      if (competencesSavoirs.length === 0) {
        throw new Error(
          "Aucun savoir trouvé dans ce document. Vérifie que le PDF contient bien les fiches compétences.",
        );
      }

      await invoke("save_savoirs_for_formation", {
        formationId: formation.id,
        competencesSavoirs,
      });

      setSavoirsSuccess(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err) !== "{}"
              ? JSON.stringify(err)
              : String(err);
      setSavoirsError(`Erreur : ${msg}`);
      console.error(err);
    } finally {
      setExtractingSavoirs(false);
      e.target.value = "";
    }
  }

  // ─── Suppression du REAC ───

  async function handleDeleteReac() {
    const confirmed = window.confirm(
      `Supprimer le REAC de cette formation ?\n\nTous les CCP, compétences et critères d'évaluation seront définitivement supprimés.\nTu pourras réimporter un nouveau REAC corrigé.`,
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const existingCcps = await db.query<{ id: string }>(
        "SELECT id FROM ccps WHERE formation_id = ?",
        [formation.id],
      );
      for (const ccp of existingCcps) {
        const comps = await db.query<{ id: string }>(
          "SELECT id FROM competences WHERE ccp_id = ?",
          [ccp.id],
        );
        for (const comp of comps) {
          await db.execute("DELETE FROM evaluation_criteria WHERE competence_id = ?", [comp.id]);
        }
        await db.execute("DELETE FROM competences WHERE ccp_id = ?", [ccp.id]);
      }
      await db.execute("DELETE FROM ccps WHERE formation_id = ?", [formation.id]);
      await db.execute(
        "UPDATE formations SET reac_parsed = 0, updated_at = datetime('now') WHERE id = ?",
        [formation.id],
      );
      await loadReac();
    } finally {
      setLoading(false);
    }
  }

  // ─── Périmètre d'intervention ───

  async function toggleScope(compId: string, currentScope: boolean) {
    const newScope = currentScope ? 0 : 1;
    await db.execute(
      "UPDATE competences SET in_scope = ? WHERE id = ?",
      [newScope, compId],
    );
    // Mettre à jour localement
    setCcps((prev) =>
      prev.map((ccp) => ({
        ...ccp,
        competences: ccp.competences.map((c) =>
          c.id === compId ? { ...c, in_scope: !!newScope } : c,
        ),
      })),
    );
  }

  async function setScopeAll(inScope: boolean) {
    const val = inScope ? 1 : 0;
    for (const ccp of ccps) {
      for (const comp of ccp.competences) {
        await db.execute("UPDATE competences SET in_scope = ? WHERE id = ?", [val, comp.id]);
      }
    }
    await loadReac();
  }

  // ─── Activités hors-REAC ───

  async function addExtraActivity() {
    if (!newActivityName.trim()) return;
    await db.execute(
      "INSERT INTO extra_activities (id, formation_id, name, billable, sort_order, created_at) VALUES (?, ?, ?, 1, ?, datetime('now'))",
      [db.generateId(), formation.id, newActivityName.trim(), extraActivities.length],
    );
    setNewActivityName("");
    await loadReac();
  }

  async function deleteExtraActivity(id: string) {
    await db.execute("DELETE FROM extra_activities WHERE id = ?", [id]);
    await loadReac();
  }

  const totalCompetences = ccps.reduce((acc, ccp) => acc + ccp.competences.length, 0);
  const inScopeCount = ccps.reduce(
    (acc, ccp) => acc + ccp.competences.filter((c) => c.in_scope).length,
    0,
  );

  const tabs = [
    { id: "reac" as const, label: "REAC", icon: <BookOpen className="h-4 w-4" /> },
    { id: "perimetre" as const, label: `Périmètre (${inScopeCount}/${totalCompetences})`, icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: "activites" as const, label: `Hors-REAC (${extraActivities.length})`, icon: <ClipboardList className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{formation.title}</h1>
          {formation.rncp_code && (
            <p className="text-sm text-muted-foreground">RNCP {formation.rncp_code}</p>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px ${
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

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ═══ Onglet REAC ═══ */}
          {activeTab === "reac" && (
            <div className="space-y-6">
              {ccps.length === 0 ? (
                <ReacImportPanel
                  parsing={parsing}
                  parseError={parseError}
                  onFileChange={handleReacFile}
                />
              ) : (
                <>
                  {/* Bouton réimporter + extraire savoirs + supprimer */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {ccps.length} CCP — {totalCompetences} compétences
                    </p>
                    <div className="flex items-center gap-2">
                      {/* Extraire les savoirs */}
                      <label className={extractingSavoirs ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.docx,.txt"
                          disabled={extractingSavoirs}
                          onChange={handleExtractSavoirsFile}
                        />
                        <span className="flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/5">
                          {extractingSavoirs ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          {extractingSavoirs ? "Extraction…" : "Extraire les savoirs"}
                        </span>
                      </label>
                      {/* Réimporter */}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.docx,.txt"
                          onChange={handleReacFile}
                        />
                        <span className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Réimporter
                        </span>
                      </label>
                      <button
                        onClick={handleDeleteReac}
                        className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                        title="Supprimer le REAC"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </button>
                    </div>
                  </div>

                  {parseError && (
                    <Alert variant="warning">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                  )}

                  {savoirsSuccess && (
                    <Alert className="border-green-500/30 bg-green-500/5">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-700">
                        Savoirs extraits et enregistrés avec succès ! Ils sont maintenant disponibles dans Générer.
                      </AlertDescription>
                    </Alert>
                  )}

                  {savoirsError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{savoirsError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Arbre REAC */}
                  <div className="space-y-3">
                    {ccps.map((ccp) => (
                      <div key={ccp.id} className="rounded-xl border bg-card">
                        <button
                          onClick={() => toggleCcp(ccp.id)}
                          className="flex w-full items-center gap-3 p-4 text-left"
                        >
                          {expandedCcps.has(ccp.id) ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <Badge variant="default" className="shrink-0">{ccp.code}</Badge>
                          <span className="font-medium">{ccp.title}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {ccp.competences.length} CP
                          </span>
                        </button>

                        {expandedCcps.has(ccp.id) && (
                          <div className="border-t px-4 pb-4">
                            {ccp.competences.map((comp) => (
                              <div key={comp.id} className="mt-3 ml-7">
                                <div className="flex items-start gap-2">
                                  <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">
                                    {comp.code}
                                  </Badge>
                                  <div>
                                    <p className="text-sm font-medium">{comp.title}</p>
                                    {comp.description && (
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        {comp.description}
                                      </p>
                                    )}
                                    {comp.criteria.length > 0 && (
                                      <ul className="mt-1.5 space-y-0.5">
                                        {comp.criteria.map((cr) => (
                                          <li
                                            key={cr.id}
                                            className="flex items-start gap-1.5 text-xs text-muted-foreground"
                                          >
                                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                                            {cr.description}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ Onglet Périmètre ═══ */}
          {activeTab === "perimetre" && (
            <div className="space-y-6">
              {ccps.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    Importe d'abord un REAC dans l'onglet précédent pour définir ton périmètre.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {/* Raccourcis */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setScopeAll(true)}
                    >
                      Tout cocher
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setScopeAll(false)}
                    >
                      Tout décocher
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {inScopeCount} compétence(s) à ta charge
                    </span>
                  </div>

                  {/* Liste avec cases à cocher */}
                  {ccps.map((ccp) => (
                    <div key={ccp.id} className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">
                        {ccp.code} — {ccp.title}
                      </p>
                      {ccp.competences.map((comp) => (
                        <label
                          key={comp.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                            comp.in_scope
                              ? "border-primary/30 bg-primary/5"
                              : "border-border bg-card opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={comp.in_scope}
                            onChange={() => toggleScope(comp.id, comp.in_scope)}
                            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                          />
                          <div>
                            <span className="text-sm font-medium">
                              {comp.code} — {comp.title}
                            </span>
                            {comp.assigned_to && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Attribué à : {comp.assigned_to}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ═══ Onglet Activités hors-REAC ═══ */}
          {activeTab === "activites" && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Activités non-pédagogiques qui font partie du temps de travail facturable
                (accueil, sorties, oral, bilan…).
              </p>

              {/* Formulaire d'ajout */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nom de l'activité (ex : Journée d'accueil)"
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraActivity(); } }}
                  className="flex-1"
                />
                <Button
                  onClick={addExtraActivity}
                  disabled={!newActivityName.trim()}
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </div>

              {/* Liste */}
              {extraActivities.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Aucune activité hors-REAC pour l'instant.
                </div>
              ) : (
                <div className="space-y-2">
                  {extraActivities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-3"
                    >
                      <div className="flex items-center gap-3">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{a.name}</span>
                        {a.billable && (
                          <Badge variant="outline" className="text-xs">Facturable</Badge>
                        )}
                      </div>
                      <button
                        onClick={() => deleteExtraActivity(a.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Panneau d'import REAC ──────────────────────────────────────────────────

function ReacImportPanel({
  parsing,
  parseError,
  onFileChange,
}: {
  parsing: boolean;
  parseError: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {parsing ? (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="font-medium">Analyse du REAC en cours…</p>
          <p className="text-sm text-muted-foreground">
            Claude extrait les CCP, compétences et critères d'évaluation.
          </p>
        </div>
      ) : (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold text-foreground">Importer le REAC</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Dépose le PDF du Référentiel Emploi Activités Compétences.
              Claude analysera automatiquement le document pour en extraire les CCP,
              compétences et critères d'évaluation.
            </p>
          </div>

          <div className="flex gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt"
                onChange={onFileChange}
              />
              <span className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Upload className="h-4 w-4" />
                J'ai déjà le PDF
              </span>
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Formats acceptés : PDF (recommandé), Word (.docx), texte
          </p>

          {parseError && (
            <Alert variant="destructive" className="max-w-md">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
