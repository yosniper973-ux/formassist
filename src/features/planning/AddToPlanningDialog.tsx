import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Formation, Group } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, total));
  const h = Math.floor(clamped / 60).toString().padStart(2, "0");
  const m = (clamped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface AddToPlanningDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (slotId: string) => void | Promise<void>;
  defaultFormationId?: string;
  defaultTitle?: string;
  defaultDescription?: string | null;
  defaultDurationMinutes?: number | null;
}

export function AddToPlanningDialog({
  open,
  onClose,
  onCreated,
  defaultFormationId,
  defaultTitle,
  defaultDescription,
  defaultDurationMinutes,
}: AddToPlanningDialogProps) {
  const { activeCentreId } = useAppStore();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  const [formationId, setFormationId] = useState(defaultFormationId ?? "");
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState(() => {
    const dur = defaultDurationMinutes && defaultDurationMinutes > 0 ? defaultDurationMinutes : 120;
    return minutesToTime(timeToMinutes("09:00") + dur);
  });
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [modality, setModality] = useState<"presential" | "remote" | "hybrid">("presential");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Charger formations + groupes accessibles
  useEffect(() => {
    if (!open) return;
    setLoadingRefs(true);
    (async () => {
      try {
        const centres = (await db.getCentres(false)) as unknown as { id: string }[];
        const centreIds = activeCentreId ? [activeCentreId] : centres.map((c) => c.id);
        const allFormations: Formation[] = [];
        for (const cid of centreIds) {
          const rows = (await db.getFormations(cid)) as unknown as Formation[];
          allFormations.push(...rows);
        }
        setFormations(allFormations);
        const allGroups: Group[] = [];
        for (const f of allFormations) {
          const g = (await db.getGroups(f.id)) as unknown as Group[];
          allGroups.push(...g);
        }
        setGroups(allGroups);
      } catch (err) {
        console.error("Erreur chargement formations:", err);
      } finally {
        setLoadingRefs(false);
      }
    })();
  }, [open, activeCentreId]);

  // Re-synchroniser les valeurs par défaut à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setFormationId(defaultFormationId ?? "");
    setGroupId("");
    setDate(todayStr());
    setStartTime("09:00");
    const dur = defaultDurationMinutes && defaultDurationMinutes > 0 ? defaultDurationMinutes : 120;
    setEndTime(minutesToTime(timeToMinutes("09:00") + dur));
    setTitle(defaultTitle ?? "");
    setModality("presential");
    setError("");
  }, [open, defaultFormationId, defaultTitle, defaultDurationMinutes]);

  const filteredGroups = useMemo(
    () => groups.filter((g) => g.formation_id === formationId),
    [groups, formationId],
  );

  const durationHours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
    return Math.max(0, diff / 60);
  }, [startTime, endTime]);

  async function handleSave() {
    if (!formationId || !date) {
      setError("Formation et date sont requis.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const slotId = await db.createSlot({
        formation_id: formationId,
        group_id: groupId || null,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        duration_hours: durationHours || 1,
        planning_type: "imposed",
        title: title || null,
        description: defaultDescription ?? null,
        modality,
        is_co_animated: 0,
        co_animator_name: null,
      });
      await onCreated(slotId);
      onClose();
    } catch (err) {
      console.error("Erreur création créneau:", err);
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Ajouter au planning
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Le contenu sera lié au créneau créé.
        </p>

        <div className="space-y-4">
          <div>
            <Label>Formation *</Label>
            <select
              className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
              value={formationId}
              onChange={(e) => {
                setFormationId(e.target.value);
                setGroupId("");
              }}
              disabled={loadingRefs}
            >
              <option value="">Sélectionner...</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                  {f.rncp_code ? ` (${f.rncp_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {filteredGroups.length > 0 && (
            <div>
              <Label>Groupe</Label>
              <select
                className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Tous les groupes</option>
                {filteredGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>Titre</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre du créneau"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Début</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  const dur =
                    defaultDurationMinutes && defaultDurationMinutes > 0
                      ? defaultDurationMinutes
                      : timeToMinutes(endTime) - timeToMinutes(startTime) || 120;
                  setEndTime(minutesToTime(timeToMinutes(e.target.value) + dur));
                }}
              />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          {durationHours > 0 && (
            <p className="text-xs text-muted-foreground">
              Durée : {durationHours.toFixed(1)}h
            </p>
          )}

          <div>
            <Label>Modalité</Label>
            <select
              className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
              value={modality}
              onChange={(e) =>
                setModality(e.target.value as "presential" | "remote" | "hybrid")
              }
            >
              <option value="presential">Présentiel</option>
              <option value="remote">Distanciel</option>
              <option value="hybrid">Hybride</option>
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!formationId || !date || saving}>
            {saving ? "Création..." : "Créer le créneau"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
