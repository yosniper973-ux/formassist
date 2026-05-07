import { useState, useEffect } from "react";
import {
  FolderOpen,
  History,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  Upload,
  FileText,
  Trash2,
  ChevronRight,
  X,
  Mail,
  Download,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { request as claudeRequest } from "@/lib/claude";
import { markdownToDocx, downloadDocx } from "@/lib/docx-export";
import { useAppStore } from "@/stores/appStore";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DownloadToast } from "@/components/ui/download-toast";
import type { Formation, Group, Learner } from "@/types";
import type { ClaudeContentBlock } from "@/types/api";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "new" | "history";
type DossierType = "dp" | "projet";

interface DossierRow {
  id: string;
  learner_id: string;
  formation_id: string;
  dossier_type: DossierType;
  filename: string | null;
  feedback_markdown: string | null;
  model_used: string | null;
  validated: number;
  sent_at: string | null;
  created_at: string;
  learner_first_name: string | null;
  learner_last_name: string | null;
  learner_email?: string | null;
  formation_title: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectDossierType(filename: string): DossierType {
  const lower = filename.toLowerCase();
  if (lower.includes("projet") || lower.includes("project") || lower.includes("dproj")) {
    return "projet";
  }
  return "dp";
}

function dossierLabel(type: DossierType): string {
  return type === "dp" ? "Dossier Professionnel (DP)" : "Dossier Projet (DProj)";
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function DossiersPage() {
  const { activeCentreId, addApiCost } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("new");

  // Cascading selectors
  const [formations, setFormations] = useState<Formation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);

  const [selectedFormationId, setSelectedFormationId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");

  // RC/RE
  const [rcreStatus, setRcreStatus] = useState<"none" | "text" | "pdf">("none");
  const [importingRcre, setImportingRcre] = useState(false);

  // Dossier
  const [dossierFile, setDossierFile] = useState<File | null>(null);
  const [dossierText, setDossierText] = useState<string | null>(null);
  const [dossierType, setDossierType] = useState<DossierType | null>(null);

  // Analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // History
  const [history, setHistory] = useState<DossierRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ path: string; name: string } | null>(null);

  // ─── Loading ───────────────────────────────────────────────

  useEffect(() => { loadFormations(); }, [activeCentreId]);
  useEffect(() => { if (selectedFormationId) { loadGroups(); loadRcreStatus(); } else { setGroups([]); setSelectedGroupId(""); setRcreStatus("none"); } }, [selectedFormationId]);
  useEffect(() => { if (selectedGroupId) loadLearners(); else { setLearners([]); setSelectedLearnerId(""); } }, [selectedGroupId]);
  useEffect(() => { if (activeTab === "history") loadHistory(); }, [activeTab]);

  async function loadFormations() {
    try {
      const centreIds: string[] = [];
      if (activeCentreId) {
        centreIds.push(activeCentreId);
      } else {
        const all = await db.query<{ id: string }>("SELECT id FROM centres WHERE archived_at IS NULL");
        centreIds.push(...all.map((c) => c.id));
      }
      const all: Formation[] = [];
      for (const cid of centreIds) {
        const rows = (await db.getFormations(cid)) as unknown as Formation[];
        all.push(...rows);
      }
      setFormations(all);
      if (all.length > 0 && !selectedFormationId) setSelectedFormationId(all[0]!.id);
    } catch { setError("Impossible de charger les formations."); }
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

  async function loadRcreStatus() {
    const rcre = await db.getRcre(selectedFormationId);
    if (rcre?.rcre_pdf_b64) setRcreStatus("pdf");
    else if (rcre?.rcre_text) setRcreStatus("text");
    else setRcreStatus("none");
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const rows = (await db.getDossierCorrections()) as unknown as DossierRow[];
      setHistory(rows);
    } catch { setError("Impossible de charger l'historique."); }
    finally { setHistoryLoading(false); }
  }

  // ─── Import RC/RE ──────────────────────────────────────────

  async function handleRcreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedFormationId) return;

    setImportingRcre(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      if (isPdf) {
        const b64 = await fileToBase64(file);
        await db.saveRcre(selectedFormationId, { pdfB64: b64 });
        setRcreStatus("pdf");
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        await db.saveRcre(selectedFormationId, { text: result.value });
        setRcreStatus("text");
      } else {
        const text = await file.text();
        await db.saveRcre(selectedFormationId, { text });
        setRcreStatus("text");
      }
      showToast("RC/RE importé avec succès ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import du RC/RE.");
    } finally {
      setImportingRcre(false);
    }
  }

  // ─── Import dossier ────────────────────────────────────────

  async function handleDossierFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError("");
    const detectedType = detectDossierType(file.name);
    setDossierType(detectedType);

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    if (isPdf || file.type.startsWith("image/")) {
      setDossierFile(file);
      setDossierText(null);
    } else if (file.name.toLowerCase().endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        setDossierText(result.value);
        setDossierFile(null);
      } catch {
        setError("Impossible de lire ce fichier Word. Essaie de l'exporter en PDF.");
      }
    } else {
      const text = await file.text();
      setDossierText(text);
      setDossierFile(null);
    }

    setDossierFile((prev) => {
      if (!isPdf && !file.type.startsWith("image/")) return prev;
      return file;
    });
  }

  function clearDossier() {
    setDossierFile(null);
    setDossierText(null);
    setDossierType(null);
  }

  // ─── Analyze ───────────────────────────────────────────────

  async function handleAnalyze() {
    if (!selectedLearnerId || !selectedFormationId) return;
    if (!dossierFile && !dossierText) return;

    setError("");
    setAnalyzing(true);
    setFeedback(null);

    try {
      const learner = learners.find((l) => l.id === selectedLearnerId);
      const formation = formations.find((f) => f.id === selectedFormationId);
      const rcre = await db.getRcre(selectedFormationId);

      // Build REAC context from DB
      const ccps = await db.query<{ code: string; title: string; id: string }>(
        "SELECT id, code, title FROM ccps WHERE formation_id = ? ORDER BY sort_order",
        [selectedFormationId],
      );
      let reacContext = "";
      if (ccps.length > 0) {
        reacContext = "## REAC — Structure des compétences\n\n";
        for (const ccp of ccps) {
          reacContext += `### ${ccp.code} — ${ccp.title}\n`;
          const comps = await db.query<{ code: string; title: string }>(
            "SELECT code, title FROM competences WHERE ccp_id = ? ORDER BY sort_order",
            [ccp.id],
          );
          for (const c of comps) reacContext += `- ${c.code} : ${c.title}\n`;
          reacContext += "\n";
        }
      }

      const dossierLabel_ = dossierLabel(dossierType ?? "dp");
      const learnerName = learner ? `${learner.first_name} ${learner.last_name}` : "Apprenant";

      // Build message content
      const messageBlocks: ClaudeContentBlock[] = [];

      // REAC as text block
      if (reacContext) {
        messageBlocks.push({ type: "text", text: reacContext });
      }

      // RC/RE
      if (rcre?.rcre_pdf_b64) {
        messageBlocks.push({ type: "text", text: "## RC/RE (Référentiel de Certification / Référentiel d'Évaluation)" });
        messageBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: rcre.rcre_pdf_b64 },
        });
      } else if (rcre?.rcre_text) {
        messageBlocks.push({
          type: "text",
          text: `## RC/RE (Référentiel de Certification / Référentiel d'Évaluation)\n\n${rcre.rcre_text}`,
        });
      }

      // Dossier intro
      messageBlocks.push({
        type: "text",
        text: `## ${dossierLabel_} de ${learnerName}${formation ? ` — ${formation.title}` : ""}\n\nAnalyse ce dossier en appliquant rigoureusement les critères du REAC et du RC/RE fournis ci-dessus.`,
      });

      // Dossier content
      if (dossierFile) {
        const isPdf = dossierFile.type === "application/pdf" || dossierFile.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          const b64 = await fileToBase64(dossierFile);
          messageBlocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: b64 },
          });
        } else {
          const b64 = await fileToBase64(dossierFile);
          messageBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: dossierFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: b64,
            },
          });
        }
      } else if (dossierText) {
        messageBlocks.push({ type: "text", text: dossierText });
      }

      const response = await claudeRequest({
        task: "correction_dossier",
        messages: [{ role: "user", content: messageBlocks }],
        maxTokens: 8000,
      });

      addApiCost(response.costEuros);

      // Save to DB
      const id = await db.saveDossierCorrection({
        learnerId: selectedLearnerId,
        formationId: selectedFormationId,
        dossierType: dossierType ?? "dp",
        filename: dossierFile?.name ?? null,
        submissionText: dossierText ?? (dossierFile ? `[Fichier : ${dossierFile.name}]` : null),
        feedbackMarkdown: response.content,
        modelUsed: response.model,
      });

      setFeedback(response.content);
      setModelUsed(response.model);
      setSavedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse.");
    } finally {
      setAnalyzing(false);
    }
  }

  // ─── Send email ────────────────────────────────────────────

  async function handleSendEmail() {
    const learner = learners.find((l) => l.id === selectedLearnerId);
    if (!learner?.email || !feedback || !savedId) return;

    const subject = `Analyse de votre ${dossierLabel(dossierType ?? "dp")}`;
    const body = `Bonjour ${learner.first_name},\n\nVeuillez trouver ci-dessous le retour sur votre ${dossierLabel(dossierType ?? "dp")}.\n\n${feedback.replace(/[#*`]/g, "").slice(0, 1800)}\n\nBon courage pour la suite.`;
    const mailto = `mailto:${encodeURIComponent(learner.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    await db.markDossierSent(savedId);
    setEmailSent(true);
    showToast(`Email ouvert pour ${learner.first_name} ${learner.last_name}`);
  }

  // ─── Export Word ───────────────────────────────────────────

  async function handleExportWord() {
    if (!feedback) return;
    try {
      const learner = learners.find((l) => l.id === selectedLearnerId);
      const name = learner ? `${learner.first_name}_${learner.last_name}` : "apprenant";
      const blob = await markdownToDocx(feedback);
      const savedPath = await downloadDocx(blob, `Analyse_${dossierType?.toUpperCase() ?? "DP"}_${name}`);
      if (savedPath) {
        setDownloadToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'export Word");
    }
  }

  function handleNewAnalysis() {
    setDossierFile(null);
    setDossierText(null);
    setDossierType(null);
    setFeedback(null);
    setModelUsed("");
    setSavedId(null);
    setEmailSent(false);
    setError("");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const canAnalyze = Boolean(
    selectedLearnerId && (dossierFile || dossierText) && !analyzing && !feedback,
  );

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dossiers DP / Projet</h1>
        <p className="text-sm text-muted-foreground">
          Analyse des Dossiers Professionnels et Dossiers Projet avec regard de jury
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        <button
          onClick={() => setActiveTab("new")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "new" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <FolderOpen className="h-4 w-4" /> Nouvelle analyse
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <History className="h-4 w-4" /> Historique
        </button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {activeTab === "new" ? (
        <NewAnalysisTab
          formations={formations}
          groups={groups}
          learners={learners}
          selectedFormationId={selectedFormationId}
          selectedGroupId={selectedGroupId}
          selectedLearnerId={selectedLearnerId}
          rcreStatus={rcreStatus}
          importingRcre={importingRcre}
          dossierFile={dossierFile}
          dossierText={dossierText}
          dossierType={dossierType}
          analyzing={analyzing}
          feedback={feedback}
          modelUsed={modelUsed}

          emailSent={emailSent}
          canAnalyze={canAnalyze}
          hasEmail={Boolean(learners.find((l) => l.id === selectedLearnerId)?.email)}
          onFormationChange={(id) => { setSelectedFormationId(id); setError(""); }}
          onGroupChange={(id) => { setSelectedGroupId(id); setError(""); }}
          onLearnerChange={(id) => { setSelectedLearnerId(id); setError(""); }}
          onRcreFile={handleRcreFile}
          onDossierFile={handleDossierFile}
          onClearDossier={clearDossier}
          onDossierTypeChange={setDossierType}
          onAnalyze={handleAnalyze}
          onSendEmail={handleSendEmail}
          onExportWord={handleExportWord}
          onNewAnalysis={handleNewAnalysis}
        />
      ) : (
        <HistoryTab
          history={history}
          loading={historyLoading}
          openDetailId={openDetailId}
          onOpenDetail={setOpenDetailId}
          onDeleted={loadHistory}
        />
      )}

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
    </div>
  );
}

// ─── Onglet Nouvelle analyse ──────────────────────────────────────────────────

function NewAnalysisTab({
  formations, groups, learners,
  selectedFormationId, selectedGroupId, selectedLearnerId,
  rcreStatus, importingRcre,
  dossierFile, dossierText, dossierType,
  analyzing, feedback, modelUsed, emailSent,
  canAnalyze, hasEmail,
  onFormationChange, onGroupChange, onLearnerChange,
  onRcreFile, onDossierFile, onClearDossier, onDossierTypeChange,
  onAnalyze, onSendEmail, onExportWord, onNewAnalysis,
}: {
  formations: Formation[];
  groups: Group[];
  learners: Learner[];
  selectedFormationId: string;
  selectedGroupId: string;
  selectedLearnerId: string;
  rcreStatus: "none" | "text" | "pdf";
  importingRcre: boolean;
  dossierFile: File | null;
  dossierText: string | null;
  dossierType: DossierType | null;
  analyzing: boolean;
  feedback: string | null;
  modelUsed: string;
  emailSent: boolean;
  canAnalyze: boolean;
  hasEmail: boolean;
  onFormationChange: (id: string) => void;
  onGroupChange: (id: string) => void;
  onLearnerChange: (id: string) => void;
  onRcreFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDossierFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearDossier: () => void;
  onDossierTypeChange: (t: DossierType) => void;
  onAnalyze: () => void;
  onSendEmail: () => void;
  onExportWord: () => void;
  onNewAnalysis: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Étape 1 : Sélection */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Badge variant="outline" className="text-xs">1</Badge>
          Sélection
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Formation</Label>
            <Select value={selectedFormationId} onChange={(e) => onFormationChange(e.target.value)}>
              <option value="">-- Formation --</option>
              {formations.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Groupe</Label>
            <Select value={selectedGroupId} onChange={(e) => onGroupChange(e.target.value)} disabled={!selectedFormationId}>
              <option value="">-- Groupe --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Apprenant</Label>
            <Select value={selectedLearnerId} onChange={(e) => onLearnerChange(e.target.value)} disabled={!selectedGroupId}>
              <option value="">-- Apprenant --</option>
              {learners.map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>)}
            </Select>
          </div>
        </div>
      </div>

      {/* Étape 2 : RC/RE */}
      {selectedFormationId && (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Badge variant="outline" className="text-xs">2</Badge>
              RC/RE de la formation
            </div>
            {rcreStatus !== "none" && (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                <Check className="h-3 w-3" />
                {rcreStatus === "pdf" ? "PDF importé" : "Texte importé"}
              </Badge>
            )}
          </div>

          {rcreStatus === "none" ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>Aucun RC/RE importé pour cette formation. L'analyse sera moins précise sans lui.</span>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  {importingRcre ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Importer RC/RE
                  <input type="file" accept=".pdf,.docx,.txt" className="hidden" disabled={importingRcre} onChange={onRcreFile} />
                </label>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Le RC/RE sera fourni à Claude comme référentiel d'évaluation.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                {importingRcre ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Remplacer
                <input type="file" accept=".pdf,.docx,.txt" className="hidden" disabled={importingRcre} onChange={onRcreFile} />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Étape 3 : Dossier */}
      {selectedLearnerId && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Badge variant="outline" className="text-xs">3</Badge>
            Dossier de l'apprenant
          </div>

          {!dossierFile && !dossierText ? (
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 hover:bg-muted/30">
              <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-sm font-medium">Importer le dossier</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Le type (DP ou Projet) est détecté automatiquement depuis le nom du fichier
                </p>
                <p className="text-xs text-muted-foreground">Formats : PDF (recommandé), Word, texte</p>
              </div>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                disabled={analyzing || !!feedback}
                onChange={onDossierFile}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {dossierFile?.name ?? "Texte extrait"}
                  </p>
                  {dossierFile && (
                    <p className="text-xs text-muted-foreground">
                      {(dossierFile.size / 1024).toFixed(1)} Ko
                    </p>
                  )}
                </div>
                {!feedback && (
                  <button onClick={onClearDossier} className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Type détecté / modifiable */}
              {dossierType && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Type détecté :</span>
                  <div className="flex gap-2">
                    {(["dp", "projet"] as const).map((t) => (
                      <button
                        key={t}
                        disabled={!!feedback}
                        onClick={() => onDossierTypeChange(t)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${dossierType === t ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}
                      >
                        {t === "dp" ? "DP" : "DProj"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(dossierFile || dossierText) && !feedback && (
            <Button onClick={onAnalyze} disabled={!canAnalyze} className="w-full sm:w-auto">
              {analyzing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours…</>
              ) : (
                <><ShieldCheck className="h-4 w-4" /> Analyser avec Claude (regard jury)</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Résultats */}
      {feedback && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                Analyse — {dossierLabel(dossierType ?? "dp")}
              </h3>
              <Badge variant="outline" className="text-xs">{modelUsed}</Badge>
            </div>
            <div className="text-sm">
              <RichMarkdown content={feedback} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <Button variant="outline" size="sm" onClick={onExportWord}>
              <Download className="h-3.5 w-3.5" /> Export Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onSendEmail}
              disabled={!hasEmail || emailSent}
              title={!hasEmail ? "Aucun email enregistré pour cet apprenant" : undefined}
            >
              {emailSent ? <Check className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {emailSent ? "Email ouvert" : "Envoyer par email"}
            </Button>
            <div className="ml-auto">
              <Button onClick={onNewAnalysis}>
                <Sparkles className="h-4 w-4" /> Nouvelle analyse
              </Button>
            </div>
          </div>
          {!hasEmail && (
            <p className="text-xs text-muted-foreground">Aucun email enregistré pour cet apprenant.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Onglet Historique ────────────────────────────────────────────────────────

function HistoryTab({
  history, loading, openDetailId, onOpenDetail, onDeleted,
}: {
  history: DossierRow[];
  loading: boolean;
  openDetailId: string | null;
  onOpenDetail: (id: string | null) => void;
  onDeleted: () => void;
}) {
  const [toDelete, setToDelete] = useState<DossierRow | null>(null);
  const [detail, setDetail] = useState<DossierRow | null>(null);

  useEffect(() => {
    if (openDetailId) {
      const row = history.find((h) => h.id === openDetailId);
      setDetail(row ?? null);
    } else {
      setDetail(null);
    }
  }, [openDetailId, history]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <History className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Aucune analyse de dossier pour l'instant.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpenDetail(row.id)}
          className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {(row.learner_first_name?.[0] ?? "?")}{(row.learner_last_name?.[0] ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {row.learner_first_name ?? "?"} {row.learner_last_name ?? ""}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.formation_title ?? "Formation inconnue"} — {new Date(row.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <Badge variant="outline" className={row.dossier_type === "projet" ? "border-purple-300 text-purple-700" : "border-blue-300 text-blue-700"}>
            {row.dossier_type === "dp" ? "DP" : "DProj"}
          </Badge>
          {row.sent_at && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 shrink-0">
              <Check className="h-3 w-3" /> Envoyé
            </Badge>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setToDelete(row); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setToDelete(row); } }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            aria-label="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}

      {/* Détail */}
      {detail && (
        <DossierDetailDialog row={detail} onClose={() => onOpenDetail(null)} />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette analyse ?"
        message={`Analyse de ${toDelete?.learner_first_name ?? ""} ${toDelete?.learner_last_name ?? ""}.\n\nCette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!toDelete) return;
          await db.deleteDossierCorrection(toDelete.id);
          setToDelete(null);
          onDeleted();
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// ─── Dialog Détail ────────────────────────────────────────────────────────────

function DossierDetailDialog({ row, onClose }: { row: DossierRow; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [dlToast, setDlToast] = useState<{ path: string; name: string } | null>(null);
  const [sent, setSent] = useState(Boolean(row.sent_at));

  async function handleSendEmail() {
    if (!row.learner_email || !row.feedback_markdown) return;
    setSending(true);
    try {
      const subject = `Analyse de votre ${dossierLabel(row.dossier_type)}`;
      const body = `Bonjour ${row.learner_first_name},\n\nVeuillez trouver ci-dessous le retour sur votre ${dossierLabel(row.dossier_type)}.\n\n${row.feedback_markdown.replace(/[#*`]/g, "").slice(0, 1800)}\n\nBon courage pour la suite.`;
      const mailto = `mailto:${encodeURIComponent(row.learner_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      await db.markDossierSent(row.id);
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  async function handleExportWord() {
    if (!row.feedback_markdown) return;
    try {
      const blob = await markdownToDocx(row.feedback_markdown);
      const name = `${row.learner_first_name ?? ""}_${row.learner_last_name ?? ""}`;
      const savedPath = await downloadDocx(blob, `Analyse_${row.dossier_type.toUpperCase()}_${name}`);
      if (savedPath) {
        setDlToast({ path: savedPath, name: savedPath.split(/[\\/]/).pop() ?? savedPath });
      }
    } catch {
      setExportToast("Erreur lors de l'export Word");
      setTimeout(() => setExportToast(null), 4000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl bg-card shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-semibold">
              {row.learner_first_name} {row.learner_last_name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {row.formation_title ?? "Formation"} — {new Date(row.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className={row.dossier_type === "projet" ? "border-purple-300 text-purple-700" : "border-blue-300 text-blue-700"}>
                {dossierLabel(row.dossier_type)}
              </Badge>
              {sent && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  <Check className="h-3 w-3" /> Envoyé
                </Badge>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-3 flex shrink-0 items-center gap-1.5 rounded-md border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent" aria-label="Fermer">
            <X className="h-4 w-4" />
            Fermer
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {row.feedback_markdown ? (
            <RichMarkdown content={row.feedback_markdown} />
          ) : (
            <p className="text-muted-foreground">Aucun feedback disponible.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-4 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {row.learner_email ? `Email : ${row.learner_email}` : "Pas d'email enregistré"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportWord}>
              <Download className="h-3.5 w-3.5" /> Word
            </Button>
            <Button
              size="sm"
              onClick={handleSendEmail}
              disabled={!row.learner_email || sending || sent}
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sent ? <Check className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {sent ? "Envoyé" : "Envoyer par email"}
            </Button>
          </div>
        </div>
      </div>

      {exportToast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {exportToast}
        </div>
      )}

      {dlToast && (
        <DownloadToast
          path={dlToast.path}
          name={dlToast.name}
          onClose={() => setDlToast(null)}
        />
      )}
    </div>
  );
}
