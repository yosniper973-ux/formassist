import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Upload,
  AlertTriangle,
  Calendar,
  Clock,
  Filter,
  Pencil,
  Trash2,
  Copy,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Formation, Centre, Slot, Group } from "@/types";
import type { ClaudeContentBlock } from "@/types/api";
import { request as claudeRequest } from "@/lib/claude";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ============================================================
// Types locaux
// ============================================================

interface SlotRow extends Slot {
  centre_id: string;
  centre_name: string;
  centre_color: string;
  formation_title: string;
  formation_code: string | null;
}

interface Conflict {
  slotA: SlotRow;
  slotB: SlotRow;
}

type ViewMode = "month" | "week";

// ============================================================
// Helpers
// ============================================================

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

/**
 * Parser de secours : extrait chaque objet JSON bien formé d'une chaîne
 * contenant un tableau potentiellement cassé (réponse Claude tronquée
 * ou avec une virgule manquante). Scanne les accolades en respectant
 * les chaînes entre guillemets et les échappements.
 */
function extractSlotsFromBrokenJson(text: string): Array<{
  date: string;
  start_time?: string;
  end_time?: string;
  title?: string;
}> {
  const slots: Array<{ date: string; start_time?: string; end_time?: string; title?: string }> = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const block = text.slice(start, i + 1);
        try {
          const obj = JSON.parse(block);
          if (obj && typeof obj === "object" && typeof obj.date === "string") {
            slots.push(obj);
          }
        } catch {
          /* ignore le bloc cassé */
        }
        start = -1;
      }
    }
  }
  return slots;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d);
}

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDates(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const monday = getMonday(first);
  // On remplit 6 semaines (42 jours) pour avoir un calendrier complet
  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function detectConflicts(slots: SlotRow[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      if (a.date !== b.date) continue;
      if (!a.start_time || !b.start_time || !a.end_time || !b.end_time) continue;
      // Chevauchement horaire
      if (a.start_time < b.end_time && b.start_time < a.end_time) {
        conflicts.push({ slotA: a, slotB: b });
      }
    }
  }
  return conflicts;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ============================================================
// Composant principal
// ============================================================

export function PlanningPage() {
  const { activeCentreId } = useAppStore();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormationId, setFilterFormationId] = useState<string>("");

  // Dialogues
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [editSlot, setEditSlot] = useState<SlotRow | null>(null);
  const [prefillDate, setPrefillDate] = useState<string>("");
  const [showImport, setShowImport] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  // Plage de dates affichée
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: formatDate(monday), to: formatDate(sunday) };
    }
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    return {
      from: formatDate(new Date(y, m, 1)),
      to: formatDate(new Date(y, m + 1, 0)),
    };
  }, [viewMode, currentDate]);

  // Chargement des données
  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      // Charger slots multi-centres
      const rows = (await db.getAllSlots(dateRange.from, dateRange.to)) as unknown as SlotRow[];
      // Filtrer par centre actif
      const filtered = activeCentreId
        ? rows.filter((s) => s.centre_id === activeCentreId)
        : rows;
      setSlots(filtered);
    } catch (err) {
      console.error("Erreur chargement slots:", err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, activeCentreId]);

  const loadFormations = useCallback(async () => {
    try {
      const centres = (await db.getCentres(false)) as unknown as Centre[];
      const centreIds = activeCentreId ? [activeCentreId] : centres.map((c) => c.id);
      const allFormations: Formation[] = [];
      for (const cid of centreIds) {
        const rows = (await db.getFormations(cid)) as unknown as Formation[];
        allFormations.push(...rows);
      }
      setFormations(allFormations);

      // Charger groupes pour toutes les formations
      const allGroups: Group[] = [];
      for (const f of allFormations) {
        const g = (await db.getGroups(f.id)) as unknown as Group[];
        allGroups.push(...g);
      }
      setGroups(allGroups);
    } catch (err) {
      console.error("Erreur chargement formations:", err);
    }
  }, [activeCentreId]);

  useEffect(() => {
    loadFormations();
  }, [loadFormations]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // Filtrage
  const displayedSlots = useMemo(() => {
    if (!filterFormationId) return slots;
    return slots.filter((s) => s.formation_id === filterFormationId);
  }, [slots, filterFormationId]);

  // Conflits
  const conflicts = useMemo(() => detectConflicts(displayedSlots), [displayedSlots]);

  // Navigation
  function navigate(direction: number) {
    const d = new Date(currentDate);
    if (viewMode === "week") {
      d.setDate(d.getDate() + direction * 7);
    } else {
      d.setMonth(d.getMonth() + direction);
    }
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // Titre navigation
  const navTitle = useMemo(() => {
    if (viewMode === "week") {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `${monday.getDate()} ${MONTHS_FR[monday.getMonth()]} — ${sunday.getDate()} ${MONTHS_FR[sunday.getMonth()]} ${sunday.getFullYear()}`;
    }
    return `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [viewMode, currentDate]);

  // Slots groupés par date
  const slotsByDate = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const s of displayedSlots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [displayedSlots]);

  async function deleteSlot(id: string) {
    if (!confirm("Supprimer ce créneau ?")) return;
    await db.execute("DELETE FROM slots WHERE id = ?", [id]);
    await loadSlots();
  }

  async function duplicateSlot(slot: SlotRow) {
    const nextDate = new Date(parseDate(slot.date));
    nextDate.setDate(nextDate.getDate() + 7);
    await db.createSlot({
      formation_id: slot.formation_id,
      group_id: slot.group_id,
      date: formatDate(nextDate),
      start_time: slot.start_time,
      end_time: slot.end_time,
      duration_hours: slot.duration_hours,
      planning_type: slot.planning_type,
      title: slot.title,
      description: slot.description,
      modality: slot.modality,
      is_co_animated: slot.is_co_animated ? 1 : 0,
      co_animator_name: slot.co_animator_name,
      extra_activity_id: slot.extra_activity_id,
    });
    await loadSlots();
  }

  // ============================================================
  // Rendu
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6" /> Planning
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {displayedSlots.length} créneau{displayedSlots.length !== 1 ? "x" : ""} affiché{displayedSlots.length !== 1 ? "s" : ""}
            {conflicts.length > 0 && (
              <span className="text-orange-500 ml-2">
                ⚠ {conflicts.length} conflit{conflicts.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImport(true)}
          >
            <Upload className="h-4 w-4 mr-1" /> Importer
          </Button>
          {conflicts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-orange-500 border-orange-300"
              onClick={() => setShowConflicts(!showConflicts)}
            >
              <AlertTriangle className="h-4 w-4 mr-1" /> Conflits
            </Button>
          )}
          <Button
            onClick={() => {
              setEditSlot(null);
              setPrefillDate(formatDate(new Date()));
              setShowSlotForm(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Nouveau créneau
          </Button>
        </div>
      </div>

      {/* Conflits */}
      {showConflicts && conflicts.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold mb-2">Conflits détectés :</div>
            {conflicts.map((c, i) => (
              <div key={i} className="text-sm mb-1">
                • {c.slotA.date} : « {c.slotA.title || c.slotA.formation_title} » ({c.slotA.start_time}–{c.slotA.end_time})
                chevauche « {c.slotB.title || c.slotB.formation_title} » ({c.slotB.start_time}–{c.slotB.end_time})
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Barre de navigation */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Aujourd'hui
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-medium text-foreground ml-2">{navTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtre formation */}
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="text-sm border border-border rounded px-2 py-1 bg-background text-foreground"
              value={filterFormationId}
              onChange={(e) => setFilterFormationId(e.target.value)}
            >
              <option value="">Toutes les formations</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>
          {/* Basculer vue */}
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              className={`px-3 py-1 text-sm ${viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("week")}
            >
              Semaine
            </button>
            <button
              className={`px-3 py-1 text-sm ${viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("month")}
            >
              Mois
            </button>
          </div>
        </div>
      </div>

      {/* Vue calendrier */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : viewMode === "week" ? (
        <WeekView
          monday={getMonday(currentDate)}
          slotsByDate={slotsByDate}
          onClickSlot={(s) => {
            setEditSlot(s);
            setShowSlotForm(true);
          }}
          onAddSlot={(date) => {
            setEditSlot(null);
            setPrefillDate(date);
            setShowSlotForm(true);
          }}
          onDelete={deleteSlot}
          onDuplicate={duplicateSlot}
        />
      ) : (
        <MonthView
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          slotsByDate={slotsByDate}
          onClickDate={(date) => {
            setEditSlot(null);
            setPrefillDate(date);
            setShowSlotForm(true);
          }}
          onClickSlot={(s) => {
            setEditSlot(s);
            setShowSlotForm(true);
          }}
        />
      )}

      {/* Formulaire créneau */}
      {showSlotForm && (
        <SlotFormDialog
          slot={editSlot}
          prefillDate={prefillDate}
          formations={formations}
          groups={groups}
          onClose={() => setShowSlotForm(false)}
          onSaved={() => {
            setShowSlotForm(false);
            loadSlots();
          }}
        />
      )}

      {/* Import */}
      {showImport && (
        <ImportDialog
          formations={formations}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadSlots();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Vue semaine
// ============================================================

function WeekView({
  monday,
  slotsByDate,
  onClickSlot,
  onAddSlot,
  onDelete,
  onDuplicate,
}: {
  monday: Date;
  slotsByDate: Map<string, SlotRow[]>;
  onClickSlot: (s: SlotRow) => void;
  onAddSlot: (date: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (s: SlotRow) => void;
}) {
  const days = getWeekDates(monday);
  const today = formatDate(new Date());

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const dateStr = formatDate(d);
        const daySlots = slotsByDate.get(dateStr) ?? [];
        const isToday = dateStr === today;
        const isWeekend = i >= 5;

        return (
          <div
            key={dateStr}
            className={`min-h-[200px] border border-border rounded-lg p-2 ${
              isToday ? "bg-primary/5 border-primary/30" : isWeekend ? "bg-muted/30" : "bg-card"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}
              >
                {DAYS_FR[i]} {d.getDate()}
              </span>
              <button
                className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground"
                onClick={() => onAddSlot(dateStr)}
                title="Ajouter un créneau"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1">
              {daySlots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  onClick={() => onClickSlot(slot)}
                  onDelete={() => onDelete(slot.id)}
                  onDuplicate={() => onDuplicate(slot)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Vue mois
// ============================================================

function MonthView({
  year,
  month,
  slotsByDate,
  onClickDate,
  onClickSlot,
}: {
  year: number;
  month: number;
  slotsByDate: Map<string, SlotRow[]>;
  onClickDate: (date: string) => void;
  onClickSlot: (s: SlotRow) => void;
}) {
  const dates = getMonthDates(year, month);
  const today = formatDate(new Date());

  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-t-lg overflow-hidden">
        {DAYS_FR.map((d) => (
          <div key={d} className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden">
        {dates.map((d) => {
          const dateStr = formatDate(d);
          const isCurrentMonth = d.getMonth() === month;
          const isToday = dateStr === today;
          const daySlots = slotsByDate.get(dateStr) ?? [];

          return (
            <div
              key={dateStr}
              className={`min-h-[80px] p-1 cursor-pointer hover:bg-muted/50 ${
                isCurrentMonth ? "bg-card" : "bg-muted/20"
              } ${isToday ? "ring-1 ring-primary/30" : ""}`}
              onClick={() => onClickDate(dateStr)}
            >
              <span
                className={`text-xs ${
                  isToday
                    ? "bg-primary text-primary-foreground rounded-full px-1.5 py-0.5"
                    : isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                }`}
              >
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {daySlots.slice(0, 3).map((slot) => (
                  <div
                    key={slot.id}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer"
                    style={{
                      backgroundColor: `${slot.centre_color}20`,
                      borderLeft: `2px solid ${slot.centre_color}`,
                      color: slot.centre_color,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickSlot(slot);
                    }}
                    title={`${slot.title || slot.formation_title} (${slot.start_time || ""}–${slot.end_time || ""})`}
                  >
                    {slot.title || slot.formation_title}
                  </div>
                ))}
                {daySlots.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{daySlots.length - 3} de plus
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Carte créneau (vue semaine)
// ============================================================

function SlotCard({
  slot,
  onClick,
  onDelete,
  onDuplicate,
}: {
  slot: SlotRow;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="text-xs rounded p-1.5 cursor-pointer hover:shadow-sm relative group"
      style={{
        backgroundColor: `${slot.centre_color}15`,
        borderLeft: `3px solid ${slot.centre_color}`,
      }}
      onClick={onClick}
    >
      <div className="font-medium truncate" style={{ color: slot.centre_color }}>
        {slot.title || slot.formation_title}
      </div>
      {slot.start_time && (
        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5" />
          {slot.start_time}–{slot.end_time}
        </div>
      )}
      {slot.modality !== "presential" && (
        <Badge variant="secondary" className="text-[9px] mt-0.5 px-1 py-0">
          {slot.modality === "remote" ? "Distanciel" : "Hybride"}
        </Badge>
      )}
      {/* Menu contextuel */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="h-5 w-5 rounded flex items-center justify-center bg-background/80 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-6 bg-card border border-border rounded-md shadow-lg z-10 py-1 min-w-[120px]">
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
                setShowMenu(false);
              }}
            >
              <Pencil className="h-3 w-3" /> Modifier
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
                setShowMenu(false);
              }}
            >
              <Copy className="h-3 w-3" /> Dupliquer +7j
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted text-destructive flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
            >
              <Trash2 className="h-3 w-3" /> Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Formulaire créneau (dialogue)
// ============================================================

function SlotFormDialog({
  slot,
  prefillDate,
  formations,
  groups,
  onClose,
  onSaved,
}: {
  slot: SlotRow | null;
  prefillDate: string;
  formations: Formation[];
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formationId, setFormationId] = useState(slot?.formation_id ?? (formations[0]?.id ?? ""));
  const [groupId, setGroupId] = useState(slot?.group_id ?? "");
  const [date, setDate] = useState(slot?.date ?? prefillDate);
  const [startTime, setStartTime] = useState(slot?.start_time ?? "09:00");
  const [endTime, setEndTime] = useState(slot?.end_time ?? "12:00");
  const [title, setTitle] = useState(slot?.title ?? "");
  const [description, setDescription] = useState(slot?.description ?? "");
  const [modality, setModality] = useState(slot?.modality ?? "presential");
  const [planningType, setPlanningType] = useState(slot?.planning_type ?? "imposed");
  const [isCoAnimated, setIsCoAnimated] = useState(slot?.is_co_animated ?? false);
  const [coAnimatorName, setCoAnimatorName] = useState(slot?.co_animator_name ?? "");
  const [saving, setSaving] = useState(false);

  const filteredGroups = groups.filter((g) => g.formation_id === formationId);

  const durationHours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
    return Math.max(0, diff / 60);
  }, [startTime, endTime]);

  async function handleSave() {
    if (!formationId || !date) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        formation_id: formationId,
        group_id: groupId || null,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        duration_hours: durationHours || 1,
        planning_type: planningType,
        title: title || null,
        description: description || null,
        modality,
        is_co_animated: isCoAnimated ? 1 : 0,
        co_animator_name: isCoAnimated ? coAnimatorName : null,
      };

      if (slot) {
        const keys = Object.keys(data);
        const sets = keys.map((k) => `${k} = ?`).join(", ");
        const values = keys.map((k) => data[k]);
        await db.execute(
          `UPDATE slots SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
          [...values, slot.id],
        );
      } else {
        await db.createSlot(data);
      }
      onSaved();
    } catch (err) {
      console.error("Erreur sauvegarde créneau:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">
          {slot ? "Modifier le créneau" : "Nouveau créneau"}
        </h2>

        <div className="space-y-4">
          {/* Formation */}
          <div>
            <Label>Formation *</Label>
            <select
              className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
              value={formationId}
              onChange={(e) => {
                setFormationId(e.target.value);
                setGroupId("");
              }}
            >
              <option value="">Sélectionner...</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} {f.rncp_code ? `(${f.rncp_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Groupe */}
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

          {/* Date + horaires */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Début</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          {durationHours > 0 && (
            <p className="text-xs text-muted-foreground">Durée : {durationHours.toFixed(1)}h</p>
          )}

          {/* Titre */}
          <div>
            <Label>Titre (optionnel)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Module 3 — Les bases de la communication"
            />
          </div>

          {/* Modalité + type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modalité</Label>
              <select
                className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
                value={modality}
                onChange={(e) => setModality(e.target.value as "presential" | "remote" | "hybrid")}
              >
                <option value="presential">Présentiel</option>
                <option value="remote">Distanciel</option>
                <option value="hybrid">Hybride</option>
              </select>
            </div>
            <div>
              <Label>Type de planning</Label>
              <select
                className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
                value={planningType}
                onChange={(e) => setPlanningType(e.target.value as "imposed" | "free" | "hybrid")}
              >
                <option value="imposed">Imposé</option>
                <option value="free">Libre</option>
                <option value="hybrid">Hybride</option>
              </select>
            </div>
          </div>

          {/* Co-animation */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isCoAnimated}
                onChange={(e) => setIsCoAnimated(e.target.checked)}
                className="rounded"
              />
              Co-animation
            </label>
            {isCoAnimated && (
              <Input
                className="flex-1"
                placeholder="Nom du co-animateur"
                value={coAnimatorName}
                onChange={(e) => setCoAnimatorName(e.target.value)}
              />
            )}
          </div>

          {/* Description */}
          <div>
            <Label>Notes</Label>
            <textarea
              className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground min-h-[60px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes internes..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!formationId || !date || saving}>
            {saving ? "Enregistrement..." : slot ? "Mettre à jour" : "Créer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dialogue d'import
// ============================================================

function ImportDialog({
  formations,
  onClose,
  onImported,
}: {
  formations: Formation[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [formationId, setFormationId] = useState(formations[0]?.id ?? "");
  const [csvText, setCsvText] = useState("");
  const [format, setFormat] = useState<"csv" | "pdf" | "ics">("pdf");
  const [preview, setPreview] = useState<Array<{ date: string; start: string; end: string; title: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  // Import PDF via IA
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [trainerName, setTrainerName] = useState(() =>
    localStorage.getItem("formassist_trainer_name") ?? "",
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisCost, setAnalysisCost] = useState<number | null>(null);

  function parseCSV() {
    setError("");
    const lines = csvText.trim().split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      setError("Au moins 2 lignes requises (en-tête + données)");
      return;
    }

    // Détection séparateur
    const header = lines[0]!;
    const sep = header.includes(";") ? ";" : ",";
    const cols = header.split(sep).map((c) => c.trim().toLowerCase());

    const dateIdx = cols.findIndex((c) => c.includes("date"));
    const startIdx = cols.findIndex((c) => c.includes("début") || c.includes("debut") || c.includes("start"));
    const endIdx = cols.findIndex((c) => c.includes("fin") || c.includes("end"));
    const titleIdx = cols.findIndex((c) => c.includes("titre") || c.includes("title") || c.includes("sujet"));

    if (dateIdx === -1) {
      setError("Colonne 'date' introuvable dans l'en-tête");
      return;
    }

    const rows: Array<{ date: string; start: string; end: string; title: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i]!.split(sep).map((c) => c.trim());
      const rawDate = cells[dateIdx] ?? "";
      // Tenter de normaliser la date (dd/mm/yyyy -> yyyy-mm-dd)
      let normalizedDate = rawDate;
      if (rawDate.includes("/")) {
        const parts = rawDate.split("/");
        if (parts.length === 3) {
          normalizedDate = `${parts[2]}-${parts[1]!.padStart(2, "0")}-${parts[0]!.padStart(2, "0")}`;
        }
      }

      rows.push({
        date: normalizedDate,
        start: startIdx >= 0 ? (cells[startIdx] ?? "09:00") : "09:00",
        end: endIdx >= 0 ? (cells[endIdx] ?? "17:00") : "17:00",
        title: titleIdx >= 0 ? (cells[titleIdx] ?? "") : "",
      });
    }

    setPreview(rows);
  }

  async function analyzePdf() {
    setError("");
    setPreview([]);
    setAnalysisCost(null);
    if (!pdfFile) {
      setError("Sélectionne d'abord un fichier PDF.");
      return;
    }
    if (!trainerName.trim()) {
      setError("Indique ton nom pour filtrer uniquement tes créneaux.");
      return;
    }

    setAnalyzing(true);
    try {
      // PDF → base64 (chunks pour éviter le RangeError)
      const buffer = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunks: string[] = [];
      for (let i = 0; i < bytes.byteLength; i += 65536) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + 65536)));
      }
      const base64 = btoa(chunks.join(""));

      const name = trainerName.trim();
      localStorage.setItem("formassist_trainer_name", name);

      const content: ClaudeContentBlock[] = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        {
          type: "text",
          text:
            `Ce planning contient plusieurs formateurs. Tu dois EXTRAIRE UNIQUEMENT les créneaux attribués à « ${name} » ` +
            `(colonne Intervenant ou équivalente). Ignore complètement les autres formateurs.\n\n` +
            `Pour chaque créneau retenu, retourne : date (YYYY-MM-DD), start_time (HH:MM), end_time (HH:MM), ` +
            `duration_hours (nombre), planning_type ("imposed"), title (= module), modality ("presential"), ` +
            `assigned_trainer (= « ${name} »).\n\n` +
            `Réponds STRICTEMENT avec le JSON défini dans le prompt système, sans texte autour, sans bloc markdown.`,
        },
      ];

      const resp = await claudeRequest({
        task: "parsing_planning",
        messages: [{ role: "user", content }],
        maxTokens: 16000,
      });

      setAnalysisCost(resp.costEuros);

      // Extrait le JSON (tolère les fences ```json ... ``` au cas où)
      let jsonText = resp.content.trim();
      const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch && fenceMatch[1]) jsonText = fenceMatch[1].trim();

      type RawSlot = {
        date: string;
        start_time?: string;
        end_time?: string;
        title?: string;
      };
      let rawSlots: RawSlot[] = [];

      // 1) Tentative parse normal
      try {
        const parsed = JSON.parse(jsonText) as { slots?: RawSlot[] };
        rawSlots = parsed.slots ?? [];
      } catch {
        // 2) Parser tolérant : extrait chaque objet { ... } bien formé
        // dans le tableau "slots", même si le JSON global est cassé
        // (réponse tronquée, virgule manquante quelque part, etc.)
        rawSlots = extractSlotsFromBrokenJson(jsonText);
        if (rawSlots.length === 0) {
          throw new Error(
            "Impossible de lire la réponse de l'IA. Réessaie — si ça persiste, essaie avec un PDF plus court.",
          );
        }
      }

      const slots = rawSlots
        .filter((s) => s && typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
        .map((s) => ({
          date: s.date,
          start: s.start_time ?? "09:00",
          end: s.end_time ?? "17:00",
          title: s.title ?? "",
        }));

      if (slots.length === 0) {
        setError(
          `Aucun créneau trouvé pour « ${name} » dans ce PDF. Vérifie l'orthographe exacte du nom tel qu'il apparaît dans le document.`,
        );
      }

      setPreview(slots);
    } catch (err) {
      setError(`Erreur analyse : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleImport() {
    if (!formationId || preview.length === 0) return;
    setImporting(true);
    try {
      for (const row of preview) {
        const duration = (timeToMinutes(row.end) - timeToMinutes(row.start)) / 60;
        await db.createSlot({
          formation_id: formationId,
          date: row.date,
          start_time: row.start,
          end_time: row.end,
          duration_hours: Math.max(0, duration),
          title: row.title || null,
          planning_type: "imposed",
          modality: "presential",
          is_co_animated: 0,
        });
      }
      onImported();
    } catch (err) {
      setError(`Erreur import: ${err}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-xl max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload className="h-5 w-5" /> Importer un planning
        </h2>

        <div className="space-y-4">
          {/* Formation cible */}
          <div>
            <Label>Formation cible *</Label>
            <select
              className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
              value={formationId}
              onChange={(e) => setFormationId(e.target.value)}
            >
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div>
            <Label>Format</Label>
            <div className="flex flex-wrap gap-3 mt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={format === "pdf"}
                  onChange={() => {
                    setFormat("pdf");
                    setPreview([]);
                    setError("");
                  }}
                />
                PDF (via IA) — <span className="text-primary font-medium">recommandé</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={format === "csv"}
                  onChange={() => {
                    setFormat("csv");
                    setPreview([]);
                    setError("");
                  }}
                />
                CSV (date;début;fin;titre)
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="radio" checked={format === "ics"} onChange={() => setFormat("ics")} disabled />
                ICS (bientôt)
              </label>
            </div>
          </div>

          {format === "pdf" && (
            <>
              <div>
                <Label>Ton nom (tel qu'il apparaît dans le PDF)</Label>
                <Input
                  className="mt-1"
                  value={trainerName}
                  onChange={(e) => setTrainerName(e.target.value)}
                  placeholder="Ex : CASTRY JO-ANNE"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  L'IA ne gardera que les créneaux où tu es indiquée comme intervenante.
                </p>
              </div>

              <div>
                <Label>Fichier PDF du planning</Label>
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-1"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setPdfFile(f);
                    setPreview([]);
                    setError("");
                    setAnalysisCost(null);
                  }}
                />
                {pdfFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {pdfFile.name} — {(pdfFile.size / 1024).toFixed(0)} Ko
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={analyzePdf}
                disabled={!pdfFile || !trainerName.trim() || analyzing}
              >
                {analyzing ? "Analyse en cours…" : "Analyser avec l'IA"}
              </Button>

              {analysisCost !== null && (
                <p className="text-xs text-muted-foreground">
                  Coût de l'analyse : {analysisCost.toFixed(3)} €
                </p>
              )}
            </>
          )}

          {format === "csv" && (
            <>
              <div>
                <Label>Colle les données CSV ici</Label>
                <textarea
                  className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground min-h-[120px] font-mono resize-y"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={`date;début;fin;titre\n10/03/2025;09:00;12:00;Module 1\n10/03/2025;14:00;17:00;Module 2`}
                />
              </div>

              <Button variant="outline" size="sm" onClick={parseCSV} disabled={!csvText.trim()}>
                Analyser
              </Button>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Prévisualisation */}
          {preview.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{preview.length} créneau{preview.length !== 1 ? "x" : ""} détecté{preview.length !== 1 ? "s" : ""} :</p>
              <div className="max-h-[200px] overflow-y-auto border border-border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1">Date</th>
                      <th className="text-left px-2 py-1">Début</th>
                      <th className="text-left px-2 py-1">Fin</th>
                      <th className="text-left px-2 py-1">Titre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1">{row.date}</td>
                        <td className="px-2 py-1">{row.start}</td>
                        <td className="px-2 py-1">{row.end}</td>
                        <td className="px-2 py-1">{row.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={preview.length === 0 || importing || !formationId}>
            {importing ? "Import en cours..." : `Importer ${preview.length} créneau${preview.length !== 1 ? "x" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
