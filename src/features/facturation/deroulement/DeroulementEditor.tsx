import { useEffect, useMemo, useState } from "react";
import {
  X,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Save,
  Download,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Centre, Formation, Invoice } from "@/types";
import {
  detectCcpsForInvoice,
  listDeroulementSheetsForInvoice,
  upsertDeroulementSheet,
  deleteDeroulementSheet,
  DEFAULT_REDACTEUR,
} from "./queries";
import type {
  DetectedCcp,
  DeroulementDraft,
  DeroulementSheetRow,
  PhaseDraft,
} from "./types";
import { formatDatesLabel } from "./dateLabel";
import { prefillDeroulement, mergePrefillResult } from "./ai";
import { exportDeroulementDocx } from "./docx";

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

interface FicheListItem {
  ccpId: string;
  ccpTitle: string;
  ccpCode: string;
  existingSheet: DeroulementSheetRow | null;
  detected: DetectedCcp | null;
}

export function DeroulementEditor({ invoice, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [centre, setCentre] = useState<Centre | null>(null);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [detected, setDetected] = useState<DetectedCcp[]>([]);
  const [existing, setExisting] = useState<DeroulementSheetRow[]>([]);
  const [selectedCcpId, setSelectedCcpId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeroulementDraft | null>(null);

  const formationId = invoice.formation_id;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const centreRow = await db.query<Centre>(
          "SELECT * FROM centres WHERE id = ?",
          [invoice.centre_id],
        );
        setCentre(centreRow[0] ?? null);

        if (!formationId) {
          setError(
            "Cette facture n'est rattachée à aucune formation. Impossible de générer une fiche de déroulement.",
          );
          setLoading(false);
          return;
        }
        const formRow = await db.query<Formation>(
          "SELECT * FROM formations WHERE id = ?",
          [formationId],
        );
        setFormation(formRow[0] ?? null);

        const det = await detectCcpsForInvoice({
          formationId,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
        });
        setDetected(det);

        const existingRows = await listDeroulementSheetsForInvoice(invoice.id);
        setExisting(existingRows);
      } catch (err) {
        console.error(err);
        setError("Impossible de charger les données de la facture.");
      } finally {
        setLoading(false);
      }
    })();
  }, [invoice.id, invoice.centre_id, invoice.period_start, invoice.period_end, formationId]);

  const ficheList = useMemo<FicheListItem[]>(() => {
    const map = new Map<string, FicheListItem>();
    for (const d of detected) {
      map.set(d.ccp.id, {
        ccpId: d.ccp.id,
        ccpTitle: d.ccp.title,
        ccpCode: d.ccp.code,
        existingSheet: null,
        detected: d,
      });
    }
    for (const s of existing) {
      if (!s.ccp_id) continue;
      const cur = map.get(s.ccp_id);
      if (cur) {
        cur.existingSheet = s;
      } else {
        map.set(s.ccp_id, {
          ccpId: s.ccp_id,
          ccpTitle: s.title,
          ccpCode: "",
          existingSheet: s,
          detected: null,
        });
      }
    }
    return Array.from(map.values());
  }, [detected, existing]);

  function buildFreshDraft(ccpId: string): DeroulementDraft | null {
    if (!formation) return null;
    const det = detected.find((d) => d.ccp.id === ccpId);
    if (!det) return null;
    const slotDates = Array.from(new Set(det.slots.map((s) => s.date))).sort();
    const datesLabel = formatDatesLabel(slotDates);

    const phases: PhaseDraft[] = det.competences.map((c) => {
      const dureeCompetence = det.total_duration_hours / Math.max(1, det.competences.length);
      // Mapping durée : si on peut sommer les slots uniquement liés à cette compétence, on le fait
      const objectifs = c.criteria
        .map((cr) => `- ${cr.description}`)
        .join("\n");
      return {
        competence_id: c.competence.id,
        code: c.competence.code,
        intitule: c.competence.title,
        duree_heures: Math.round(dureeCompetence * 10) / 10,
        is_ecf: false,
        selected_content_ids: [],
        objectifs_operationnels: objectifs,
        contenu: "",
        methodes: "",
        outils: "",
        evaluation: "",
      };
    });

    return {
      invoice_id: invoice.id,
      centre_id: invoice.centre_id,
      ccp_id: det.ccp.id,
      formation_id: formation.id,
      formation_title: formation.title,
      dates_label: datesLabel,
      total_duration_hours: det.total_duration_hours,
      redacteur: DEFAULT_REDACTEUR,
      titre_seance: det.ccp.title,
      objectif_general: "",
      phases,
      file_path_docx: null,
    };
  }

  function buildDraftFromExisting(
    sheet: DeroulementSheetRow,
  ): DeroulementDraft | null {
    if (!formation) return null;
    let phases: PhaseDraft[] = [];
    try {
      phases = JSON.parse(sheet.phases) as PhaseDraft[];
    } catch {
      phases = [];
    }
    return {
      id: sheet.id,
      invoice_id: invoice.id,
      centre_id: sheet.centre_id ?? invoice.centre_id,
      ccp_id: sheet.ccp_id ?? "",
      formation_id: sheet.formation_id,
      formation_title: formation.title,
      dates_label: sheet.dates_label ?? "",
      total_duration_hours: sheet.total_duration_hours ?? 0,
      redacteur: sheet.redacteur ?? DEFAULT_REDACTEUR,
      titre_seance: sheet.title,
      objectif_general: sheet.general_objective ?? "",
      phases,
      file_path_docx: sheet.file_path_docx,
    };
  }

  function openFiche(item: FicheListItem) {
    const d = item.existingSheet
      ? buildDraftFromExisting(item.existingSheet)
      : buildFreshDraft(item.ccpId);
    if (!d) {
      setError("Impossible de préparer cette fiche.");
      return;
    }
    setDraft(d);
    setSelectedCcpId(item.ccpId);
  }

  function backToList() {
    setDraft(null);
    setSelectedCcpId(null);
  }

  async function reload() {
    const existingRows = await listDeroulementSheetsForInvoice(invoice.id);
    setExisting(existingRows);
  }

  if (loading) {
    return (
      <Shell onClose={onClose}>
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Shell>
    );
  }

  if (error && !draft) {
    return (
      <Shell onClose={onClose}>
        <Alert variant="destructive" className="m-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Shell>
    );
  }

  if (draft && selectedCcpId) {
    const det = detected.find((d) => d.ccp.id === selectedCcpId);
    return (
      <Shell
        onClose={onClose}
        title={`Fiche — ${draft.titre_seance}`}
        subtitle={`Facture ${invoice.invoice_number} · ${draft.formation_title}`}
        onBack={backToList}
      >
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          detected={det ?? null}
          centre={centre}
          onSaved={async (savedId) => {
            setDraft((d) => (d ? { ...d, id: savedId } : d));
            await reload();
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell
      onClose={onClose}
      title="Fiches de déroulement de séance"
      subtitle={`Facture ${invoice.invoice_number} · ${
        formation?.title ?? ""
      } · ${invoice.period_start} → ${invoice.period_end}`}
    >
      <div className="space-y-4 p-6">
        {ficheList.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Aucune compétence détectée sur la période de facturation. Vérifie le
              planning : au moins un créneau doit être rattaché à une compétence.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {ficheList.length} CCP détecté{ficheList.length > 1 ? "s" : ""} sur la
              période — une fiche par compétence (CCP).
            </p>
            <div className="space-y-3">
              {ficheList.map((item) => {
                const nbPhases =
                  item.detected?.competences.length ??
                  (item.existingSheet ? safePhaseCount(item.existingSheet.phases) : 0);
                const nbSlots = item.detected?.slots.length ?? 0;
                const duration =
                  item.detected?.total_duration_hours ??
                  item.existingSheet?.total_duration_hours ??
                  0;
                return (
                  <div
                    key={item.ccpId}
                    className="flex items-center gap-4 rounded-xl border bg-card p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {item.ccpCode ? `${item.ccpCode} · ` : ""}
                          {item.ccpTitle}
                        </span>
                        {item.existingSheet ? (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            Enregistrée
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">
                            À remplir
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {nbPhases} phase{nbPhases > 1 ? "s" : ""}
                        {nbSlots > 0 ? ` · ${nbSlots} séance${nbSlots > 1 ? "s" : ""}` : ""}
                        {duration > 0 ? ` · ${duration} h` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {item.existingSheet && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm("Supprimer cette fiche ?")) return;
                            await deleteDeroulementSheet(item.existingSheet!.id);
                            await reload();
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button onClick={() => openFiche(item)}>
                        {item.existingSheet ? "Ouvrir" : "Créer / Remplir"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Draft editor (one fiche)
// ──────────────────────────────────────────────────────────────────────

function DraftEditor({
  draft,
  setDraft,
  detected,
  centre,
  onSaved,
}: {
  draft: DeroulementDraft;
  setDraft: (updater: (d: DeroulementDraft | null) => DeroulementDraft | null) => void;
  detected: DetectedCcp | null;
  centre: Centre | null;
  onSaved: (id: string) => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [openPhases, setOpenPhases] = useState<Set<number>>(new Set([0]));

  function togglePhase(i: number) {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function updateHeader<K extends keyof DeroulementDraft>(key: K, value: DeroulementDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function updatePhase(index: number, patch: Partial<PhaseDraft>) {
    setDraft((d) => {
      if (!d) return d;
      const next = [...d.phases];
      next[index] = { ...next[index]!, ...patch };
      return { ...d, phases: next };
    });
  }

  function toggleExerciseFor(index: number, contentId: string) {
    setDraft((d) => {
      if (!d) return d;
      const phase = d.phases[index]!;
      const has = phase.selected_content_ids.includes(contentId);
      const next = has
        ? phase.selected_content_ids.filter((x) => x !== contentId)
        : [...phase.selected_content_ids, contentId];
      const phases = [...d.phases];
      phases[index] = { ...phase, selected_content_ids: next };
      return { ...d, phases };
    });
  }

  async function handlePrefill() {
    setPrefilling(true);
    setMessage(null);
    try {
      const result = await prefillDeroulement({
        formation_title: draft.formation_title,
        ccp_title: draft.titre_seance,
        dates_label: draft.dates_label,
        total_duration_hours: draft.total_duration_hours,
        phases: draft.phases.map((p) => ({
          competence_id: p.competence_id,
          code: p.code,
          intitule: p.intitule,
          duree_heures: p.duree_heures,
          is_ecf: p.is_ecf,
          critere_descriptions: bulletsToList(p.objectifs_operationnels),
          selected_content_ids: p.selected_content_ids,
        })),
      });
      const merged = mergePrefillResult(draft.phases, result);
      setDraft((d) =>
        d
          ? {
              ...d,
              objectif_general: merged.objectif_general || d.objectif_general,
              phases: merged.phases,
            }
          : d,
      );
      setMessage({ kind: "ok", text: "Fiche pré-remplie par l'IA." });
    } catch (err) {
      console.error(err);
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Échec du pré-remplissage.",
      });
    } finally {
      setPrefilling(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const phasesJson = JSON.stringify(draft.phases);
      const selected: Record<string, string[]> = {};
      for (const p of draft.phases) selected[p.competence_id] = p.selected_content_ids;
      const id = await upsertDeroulementSheet({
        id: draft.id,
        invoice_id: draft.invoice_id,
        centre_id: draft.centre_id,
        formation_id: draft.formation_id,
        ccp_id: draft.ccp_id,
        title: draft.titre_seance,
        redacteur: draft.redacteur,
        dates_label: draft.dates_label,
        total_duration_hours: draft.total_duration_hours,
        general_objective: draft.objectif_general,
        phases_json: phasesJson,
        selected_exercise_ids_json: JSON.stringify(selected),
        file_path_docx: draft.file_path_docx,
      });
      await onSaved(id);
      setMessage({ kind: "ok", text: "Fiche enregistrée." });
    } catch (err) {
      console.error(err);
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Échec de l'enregistrement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      // Sauvegarde automatique avant export
      const phasesJson = JSON.stringify(draft.phases);
      const selected: Record<string, string[]> = {};
      for (const p of draft.phases) selected[p.competence_id] = p.selected_content_ids;
      const id = await upsertDeroulementSheet({
        id: draft.id,
        invoice_id: draft.invoice_id,
        centre_id: draft.centre_id,
        formation_id: draft.formation_id,
        ccp_id: draft.ccp_id,
        title: draft.titre_seance,
        redacteur: draft.redacteur,
        dates_label: draft.dates_label,
        total_duration_hours: draft.total_duration_hours,
        general_objective: draft.objectif_general,
        phases_json: phasesJson,
        selected_exercise_ids_json: JSON.stringify(selected),
        file_path_docx: draft.file_path_docx,
      });
      if (!draft.id) setDraft((d) => (d ? { ...d, id } : d));

      const templatePath = centre?.deroulement_template_path ?? null;
      const safeTitle = draft.titre_seance
        .replace(/[^a-zA-Z0-9À-ſ]+/g, "_")
        .substring(0, 60);
      const fileName = `Fiche_deroulement_${safeTitle}`;
      const savedPath = await exportDeroulementDocx({
        draft: { ...draft, id },
        templatePath,
        fileName,
      });
      if (savedPath) {
        await db.execute(
          `UPDATE pedagogical_sheets SET file_path_docx = ? WHERE id = ?`,
          [savedPath, id],
        );
        setDraft((d) => (d ? { ...d, file_path_docx: savedPath } : d));
      }
      await onSaved(id);
      setMessage({
        kind: "ok",
        text: savedPath
          ? `Fichier exporté : ${savedPath}`
          : "Fichier téléchargé.",
      });
    } catch (err) {
      console.error(err);
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Échec de l'export DOCX.",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      {message && (
        <Alert variant={message.kind === "err" ? "destructive" : "default"}>
          {message.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Header fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Titre de la séance</Label>
          <Input
            value={draft.titre_seance}
            onChange={(e) => updateHeader("titre_seance", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Rédacteur</Label>
          <Input
            value={draft.redacteur}
            onChange={(e) => updateHeader("redacteur", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Dates</Label>
          <Input
            value={draft.dates_label}
            onChange={(e) => updateHeader("dates_label", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Durée totale (h)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={draft.total_duration_hours}
            onChange={(e) =>
              updateHeader("total_duration_hours", parseFloat(e.target.value) || 0)
            }
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Objectif général</Label>
        <Textarea
          rows={3}
          value={draft.objectif_general}
          onChange={(e) => updateHeader("objectif_general", e.target.value)}
          placeholder="Rempli automatiquement par l'IA quand tu cliques sur « Pré-remplir avec IA »."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {draft.phases.length} phase{draft.phases.length > 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePrefill}
            disabled={prefilling || saving || exporting}
          >
            <Sparkles className="h-4 w-4" />
            {prefilling ? "Pré-remplissage…" : "Pré-remplir avec IA"}
          </Button>
          <Button onClick={handleSave} disabled={saving || exporting || prefilling}>
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button onClick={handleExport} disabled={exporting || saving || prefilling}>
            <Download className="h-4 w-4" />
            {exporting ? "Export…" : "Exporter DOCX"}
          </Button>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {draft.phases.map((phase, idx) => {
          const open = openPhases.has(idx);
          const compAvailable = detected?.competences.find(
            (c) => c.competence.id === phase.competence_id,
          );
          const options = compAvailable?.availableContents ?? [];
          return (
            <div key={phase.competence_id} className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => togglePhase(idx)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      Phase {idx + 1}
                      {phase.is_ecf ? " (ECF)" : ""}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate">{phase.intitule}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {phase.duree_heures} h ·{" "}
                    {phase.selected_content_ids.length} exercice
                    {phase.selected_content_ids.length > 1 ? "s" : ""} sélectionné
                    {phase.selected_content_ids.length > 1 ? "s" : ""}
                  </p>
                </div>
              </button>
              {open && (
                <div className="space-y-4 border-t px-4 py-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Intitulé</Label>
                      <Input
                        value={phase.intitule}
                        onChange={(e) => updatePhase(idx, { intitule: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Durée (h)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={phase.duree_heures}
                        onChange={(e) =>
                          updatePhase(idx, {
                            duree_heures: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 pb-2 text-sm">
                        <input
                          type="checkbox"
                          checked={phase.is_ecf}
                          onChange={(e) => updatePhase(idx, { is_ecf: e.target.checked })}
                          className="h-4 w-4"
                        />
                        Phase d'évaluation (ECF)
                      </label>
                    </div>
                  </div>

                  {/* Volet exercices */}
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Exercices réalisés avec les apprenants
                    </p>
                    {options.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aucun cours ou exercice n'est encore rattaché à cette
                        compétence dans l'app. Tu peux quand même remplir la fiche
                        manuellement.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {options.map((opt) => {
                          const checked = phase.selected_content_ids.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-background"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleExerciseFor(idx, opt.id)}
                                className="mt-0.5 h-4 w-4 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{opt.title}</span>
                                  <Badge className="bg-slate-100 text-slate-600">
                                    {labelForContentType(opt.content_type)}
                                  </Badge>
                                </div>
                                {opt.markdown_preview && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                    {opt.markdown_preview}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Objectifs opérationnels</Label>
                      <Textarea
                        rows={4}
                        value={phase.objectifs_operationnels}
                        onChange={(e) =>
                          updatePhase(idx, { objectifs_operationnels: e.target.value })
                        }
                        placeholder="- Critère 1\n- Critère 2"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Contenu</Label>
                      <Textarea
                        rows={4}
                        value={phase.contenu}
                        onChange={(e) => updatePhase(idx, { contenu: e.target.value })}
                        placeholder="- Point 1\n- Point 2"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Méthodes pédagogiques</Label>
                      <Textarea
                        rows={3}
                        value={phase.methodes}
                        onChange={(e) => updatePhase(idx, { methodes: e.target.value })}
                        placeholder="- Active (exemple)\n- Interrogative (exemple)"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Outils et techniques</Label>
                      <Textarea
                        rows={3}
                        value={phase.outils}
                        onChange={(e) => updatePhase(idx, { outils: e.target.value })}
                        placeholder="- Paperboard\n- Fiches consignes"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>Évaluation prévue</Label>
                      <Textarea
                        rows={3}
                        value={phase.evaluation}
                        onChange={(e) => updatePhase(idx, { evaluation: e.target.value })}
                        placeholder="- Modalité\n- Critères observés"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Helpers + Shell
// ──────────────────────────────────────────────────────────────────────

function Shell({
  children,
  onClose,
  title,
  subtitle,
  onBack,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Retour"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {title ?? "Fiche de déroulement"}
              </h2>
              {subtitle && (
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function bulletsToList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-•·●◦]+/, "").trim())
    .filter(Boolean);
}

function safePhaseCount(json: string): number {
  try {
    const arr = JSON.parse(json) as unknown[];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function labelForContentType(t: string): string {
  switch (t) {
    case "course":
      return "Cours";
    case "exercise_individual":
      return "Ex. individuel";
    case "exercise_small_group":
      return "Ex. petit groupe";
    case "exercise_collective":
      return "Ex. collectif";
    case "pedagogical_game":
      return "Jeu péda";
    case "role_play":
      return "Mise en situation";
    case "trainer_sheet":
      return "Fiche formateur";
    default:
      return t;
  }
}
