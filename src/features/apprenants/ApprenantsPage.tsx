import { useState, useEffect } from "react";
import {
  Plus,
  Users,
  Upload,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  GraduationCap,
  BarChart3,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Formation, Centre, Group, Learner } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LearnerDetailDialog } from "./LearnerDetailDialog";

export function ApprenantsPage() {
  const { activeCentreId } = useAppStore();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [, setCentres] = useState<Centre[]>([]);
  const [selectedFormationId, setSelectedFormationId] = useState<string>("");
  const [groups, setGroups] = useState<GroupWithLearners[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Dialogues
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showLearnerForm, setShowLearnerForm] = useState(false);
  const [editLearner, setEditLearner] = useState<Learner | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>("");
  const [showImport, setShowImport] = useState(false);
  const [toDeleteGroup, setToDeleteGroup] = useState<Group | null>(null);
  const [toDeleteLearner, setToDeleteLearner] = useState<Learner | null>(null);
  const [detailLearner, setDetailLearner] = useState<Learner | null>(null);

  interface GroupWithLearners extends Group {
    learners: Learner[];
  }

  useEffect(() => {
    loadFormations();
  }, [activeCentreId]);

  useEffect(() => {
    if (selectedFormationId) loadGroups();
  }, [selectedFormationId]);

  async function loadFormations() {
    setLoading(true);
    try {
      const allCentres = (await db.getCentres(false)) as unknown as Centre[];
      setCentres(allCentres);

      const allFormations: Formation[] = [];
      const centreIds = activeCentreId ? [activeCentreId] : allCentres.map((c) => c.id);
      for (const cid of centreIds) {
        const rows = (await db.getFormations(cid)) as unknown as Formation[];
        allFormations.push(...rows);
      }
      setFormations(allFormations);

      if (allFormations.length > 0 && !selectedFormationId) {
        setSelectedFormationId(allFormations[0]!.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    const groupRows = (await db.getGroups(selectedFormationId)) as unknown as Group[];
    const withLearners: GroupWithLearners[] = [];
    const expanded = new Set<string>();

    for (const g of groupRows) {
      const learnerRows = (await db.getLearners(g.id)) as unknown as Learner[];
      withLearners.push({ ...g, learners: learnerRows });
      expanded.add(g.id);
    }

    setGroups(withLearners);
    setExpandedGroups(expanded);
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalLearners = groups.reduce((acc, g) => acc + g.learners.length, 0);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Apprenants</h1>
          <p className="text-sm text-muted-foreground">
            {totalLearners} apprenant(s) — {groups.length} groupe(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" />
            Importer CSV
          </Button>
          <Button onClick={() => { setShowGroupForm(true); }}>
            <Plus className="h-4 w-4" />
            Nouveau groupe
          </Button>
        </div>
      </div>

      {/* Sélecteur de formation */}
      <div className="flex items-center gap-4">
        <Label className="shrink-0">Formation :</Label>
        <Select
          value={selectedFormationId}
          onChange={(e) => setSelectedFormationId(e.target.value)}
          className="max-w-md"
        >
          {formations.map((f) => (
            <option key={f.id} value={f.id}>{f.title}</option>
          ))}
        </Select>
      </div>

      {/* Groupes */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : formations.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <GraduationCap className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Crée d'abord une formation.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <Users className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Aucun groupe pour cette formation.</p>
          <Button onClick={() => setShowGroupForm(true)}>
            <Plus className="h-4 w-4" />
            Créer un groupe
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-xl border bg-card">
              {/* En-tête du groupe */}
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => toggleGroup(group.id)} className="shrink-0">
                  {expandedGroups.has(group.id) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <Users className="h-4 w-4 text-primary" />
                <span className="font-semibold">{group.name}</span>
                <Badge variant="outline" className="text-xs">
                  {group.learners.length} apprenant(s)
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTargetGroupId(group.id);
                      setEditLearner(null);
                      setShowLearnerForm(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter
                  </Button>
                  <button
                    onClick={() => setToDeleteGroup(group)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    aria-label="Supprimer le groupe"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Liste des apprenants */}
              {expandedGroups.has(group.id) && group.learners.length > 0 && (
                <div className="border-t">
                  {group.learners.map((learner, i) => (
                    <div
                      key={learner.id}
                      onClick={() => setDetailLearner(learner)}
                      className={`group/learner flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 ${
                        i < group.learners.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {learner.first_name[0]}{learner.last_name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {learner.first_name} {learner.last_name}
                        </p>
                        {learner.email && (
                          <p className="truncate text-xs text-muted-foreground">{learner.email}</p>
                        )}
                      </div>
                      {learner.specific_needs && (
                        <Badge variant="outline" className="shrink-0 text-xs">
                          Besoins spécifiques
                        </Badge>
                      )}
                      <span className="hidden items-center gap-1 text-xs text-primary group-hover/learner:flex">
                        <BarChart3 className="h-3.5 w-3.5" /> Suivi
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTargetGroupId(group.id);
                          setEditLearner(learner);
                          setShowLearnerForm(true);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setToDeleteLearner(learner); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer l'apprenant"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialogue nouveau groupe */}
      {showGroupForm && (
        <GroupFormDialog
          formationId={selectedFormationId}
          onClose={() => setShowGroupForm(false)}
          onSaved={() => { setShowGroupForm(false); loadGroups(); }}
        />
      )}

      {/* Dialogue apprenant */}
      {showLearnerForm && (
        <LearnerFormDialog
          groupId={targetGroupId}
          learner={editLearner}
          onClose={() => setShowLearnerForm(false)}
          onSaved={() => { setShowLearnerForm(false); loadGroups(); }}
        />
      )}

      {/* Dialogue import CSV */}
      {showImport && (
        <CsvImportDialog
          groups={groups}
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); loadGroups(); }}
        />
      )}

      <ConfirmDialog
        open={toDeleteGroup !== null}
        title={`Supprimer le groupe "${toDeleteGroup?.name ?? ""}" ?`}
        message={
          "Cette action supprime définitivement le groupe ET tous les apprenants qui y sont rattachés, ainsi que leurs contenus générés, corrections et fiches pédagogiques associés.\n\nCette action est irréversible."
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!toDeleteGroup) return;
          await db.deleteGroup(toDeleteGroup.id);
          setToDeleteGroup(null);
          loadGroups();
        }}
        onCancel={() => setToDeleteGroup(null)}
      />

      <ConfirmDialog
        open={toDeleteLearner !== null}
        title={`Supprimer "${toDeleteLearner?.first_name ?? ""} ${toDeleteLearner?.last_name ?? ""}" ?`}
        message={
          "Cette action supprime définitivement l'apprenant ET tous ses contenus générés, corrections et fiches pédagogiques associés.\n\nCette action est irréversible."
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!toDeleteLearner) return;
          await db.deleteLearner(toDeleteLearner.id);
          setToDeleteLearner(null);
          loadGroups();
        }}
        onCancel={() => setToDeleteLearner(null)}
      />

      {detailLearner && (
        <LearnerDetailDialog
          learner={detailLearner}
          onClose={() => setDetailLearner(null)}
        />
      )}
    </div>
  );
}

// ─── Dialogue création de groupe ─────────────────────────────────────────────

function GroupFormDialog({
  formationId,
  onClose,
  onSaved,
}: {
  formationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await db.createGroup(formationId, name.trim(), desc || undefined);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl bg-card shadow-xl p-6">
        <h2 className="mb-4 text-lg font-semibold">Nouveau groupe</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Nom du groupe *</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Promo MSADS Septembre 2025"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-desc">Description (optionnel)</Label>
            <Input
              id="group-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ex : Groupe du mardi/jeudi"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? "Création…" : "Créer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dialogue ajout/édition d'un apprenant ──────────────────────────────────

function LearnerFormDialog({
  groupId,
  learner,
  onClose,
  onSaved,
}: {
  groupId: string;
  learner: Learner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(learner?.first_name ?? "");
  const [lastName, setLastName] = useState(learner?.last_name ?? "");
  const [email, setEmail] = useState(learner?.email ?? "");
  const [phone, setPhone] = useState(learner?.phone ?? "");
  const [level, setLevel] = useState(learner?.initial_level ?? "");
  const [needs, setNeeds] = useState(learner?.specific_needs ?? "");
  const [notes, setNotes] = useState(learner?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;

    setSaving(true);
    const data: Record<string, unknown> = {
      group_id: groupId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email || null,
      phone: phone || null,
      initial_level: level || null,
      specific_needs: needs || null,
      notes: notes || null,
    };

    if (learner) {
      const keys = Object.keys(data);
      const sets = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => data[k]);
      await db.execute(
        `UPDATE learners SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
        [...values, learner.id],
      );
    } else {
      await db.createLearner(data);
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card shadow-xl max-h-[85vh] flex flex-col">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {learner ? "Modifier l'apprenant" : "Nouvel apprenant"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fn">Prénom *</Label>
                <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln">Nom *</Label>
                <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Téléphone</Label>
                <Input id="ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="level">Niveau initial</Label>
              <Select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">— Non renseigné —</option>
                <option value="debutant">Débutant</option>
                <option value="intermediaire">Intermédiaire</option>
                <option value="avance">Avancé</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="needs">Besoins spécifiques</Label>
              <Textarea
                id="needs"
                value={needs}
                onChange={(e) => setNeeds(e.target.value)}
                placeholder="Handicap, dyslexie, allophone, rythme adapté…"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Remarques libres…"
                rows={2}
              />
            </div>
          </div>
          <div className="border-t px-6 py-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!firstName.trim() || !lastName.trim() || saving}>
              {saving ? "Enregistrement…" : learner ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dialogue import CSV ────────────────────────────────────────────────────

function CsvImportDialog({
  groups,
  onClose,
  onSaved,
}: {
  groups: Array<Group & { learners: Learner[] }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targetGroup, setTargetGroup] = useState(groups[0]?.id ?? "");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Array<{ firstName: string; lastName: string; email: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  function handleParse() {
    setError("");
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length === 0) { setError("Colle le contenu CSV ici."); return; }

    // Détecter le séparateur
    const sep = lines[0]!.includes(";") ? ";" : ",";
    const parsed: typeof preview = [];

    // Ignorer la première ligne si elle semble être un en-tête
    const startIdx = /nom|prenom|first|last/i.test(lines[0]!) ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i]!.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length >= 2) {
        parsed.push({
          firstName: cols[0] ?? "",
          lastName: cols[1] ?? "",
          email: cols[2] ?? "",
        });
      }
    }

    if (parsed.length === 0) { setError("Aucun apprenant détecté. Vérifie le format (Prénom;Nom;Email)."); return; }
    setPreview(parsed);
  }

  async function handleImport() {
    if (!targetGroup || preview.length === 0) return;
    setImporting(true);
    try {
      for (const p of preview) {
        await db.createLearner({
          group_id: targetGroup,
          first_name: p.firstName,
          last_name: p.lastName,
          email: p.email || null,
        });
      }
      onSaved();
    } catch {
      setError("Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card shadow-xl max-h-[85vh] flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Importer des apprenants (CSV)</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Groupe cible</Label>
            <Select value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.learners.length} apprenants)</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Colle le CSV ici (Prénom ; Nom ; Email)</Label>
            <Textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setPreview([]); }}
              rows={6}
              placeholder={"Prénom;Nom;Email\nMarie;Dupont;marie@email.fr\nJean;Martin;jean@email.fr"}
              className="font-mono text-xs"
            />
          </div>

          {preview.length === 0 ? (
            <Button variant="outline" onClick={handleParse} disabled={!csvText.trim()}>
              Vérifier le format
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-green-600 font-medium">{preview.length} apprenant(s) détecté(s)</p>
              <div className="max-h-40 overflow-y-auto rounded border text-xs">
                {preview.map((p, i) => (
                  <div key={i} className="flex gap-2 border-b px-3 py-1.5 last:border-0">
                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                    {p.email && <span className="text-muted-foreground">{p.email}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
          )}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleImport}
            disabled={preview.length === 0 || !targetGroup || importing}
          >
            {importing ? "Import…" : `Importer ${preview.length} apprenant(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
