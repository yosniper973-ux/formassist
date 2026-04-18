import { useState, useEffect } from "react";
import { X, GraduationCap, Copy } from "lucide-react";
import { db } from "@/lib/db";
import type { Formation, Centre } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  formation: Formation | null;
  centres: Centre[];
  defaultCentreId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface SourceOption {
  id: string;
  title: string;
  rncp_code: string | null;
  centre_name: string;
}

export function FormationFormDialog({ formation, centres, defaultCentreId, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [rncpCode, setRncpCode] = useState("");
  const [centreId, setCentreId] = useState(defaultCentreId ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (formation) {
      setTitle(formation.title);
      setRncpCode(formation.rncp_code ?? "");
      setCentreId(formation.centre_id);
      setStartDate(formation.start_date ?? "");
      setEndDate(formation.end_date ?? "");
    } else if (defaultCentreId) {
      setCentreId(defaultCentreId);
    }
  }, [formation, defaultCentreId]);

  useEffect(() => {
    if (formation) return;
    (async () => {
      const rows = await db.query<SourceOption>(
        `SELECT f.id, f.title, f.rncp_code, c.name AS centre_name
         FROM formations f
         JOIN centres c ON c.id = f.centre_id
         WHERE f.reac_parsed = 1 AND f.archived_at IS NULL
         ORDER BY f.start_date DESC`,
      );
      setSources(rows);
    })();
  }, [formation]);

  const sortedSources = (() => {
    if (!rncpCode.trim()) return sources;
    const match = rncpCode.trim();
    const head = sources.filter((s) => s.rncp_code === match);
    const tail = sources.filter((s) => s.rncp_code !== match);
    return [...head, ...tail];
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Le titre est obligatoire."); return; }
    if (!centreId) { setError("Choisis un centre."); return; }

    setSaving(true);
    setError("");

    try {
      const data: Record<string, unknown> = {
        centre_id: centreId,
        title: title.trim(),
        rncp_code: rncpCode || null,
        start_date: startDate || null,
        end_date: endDate || null,
        language: "fr",
        scope_mode: "all",
      };

      if (formation) {
        const keys = Object.keys(data);
        const sets = keys.map((k) => `${k} = ?`).join(", ");
        const values = keys.map((k) => data[k]);
        await db.execute(
          `UPDATE formations SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
          [...values, formation.id],
        );
      } else {
        const newId = await db.createFormation(data);
        if (copyFromId) {
          await db.copyReacToFormation(copyFromId, newId);
        }
      }

      onSaved();
    } catch (err) {
      setError("Erreur lors de l'enregistrement.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card shadow-xl">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {formation ? "Modifier la formation" : "Nouvelle formation"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Centre */}
          <div className="space-y-1.5">
            <Label htmlFor="centre">Centre de formation <span className="text-destructive">*</span></Label>
            <Select
              id="centre"
              value={centreId}
              onChange={(e) => setCentreId(e.target.value)}
              disabled={!!formation}
            >
              <option value="">— Choisir un centre —</option>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          {/* Titre */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre de la formation <span className="text-destructive">*</span></Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : TP Médiateur Social Accès aux Droits et Services"
              autoFocus
            />
          </div>

          {/* Code RNCP */}
          <div className="space-y-1.5">
            <Label htmlFor="rncp">Code RNCP (optionnel)</Label>
            <Input
              id="rncp"
              value={rncpCode}
              onChange={(e) => setRncpCode(e.target.value)}
              placeholder="Ex : 36241"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start">Date de début</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Date de fin</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Copier REAC depuis une formation existante (création uniquement) */}
          {!formation && sources.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
              <Label htmlFor="copyFrom" className="flex items-center gap-1.5">
                <Copy className="h-3.5 w-3.5 text-primary" />
                Copier le REAC depuis une formation existante (optionnel)
              </Label>
              <Select
                id="copyFrom"
                value={copyFromId}
                onChange={(e) => setCopyFromId(e.target.value)}
              >
                <option value="">— Aucune copie (parser le REAC manuellement) —</option>
                {sortedSources.map((s) => {
                  const rncp = s.rncp_code ? ` · RNCP ${s.rncp_code}` : "";
                  const match = rncpCode.trim() && s.rncp_code === rncpCode.trim() ? " ✓ même RNCP" : "";
                  return (
                    <option key={s.id} value={s.id}>
                      {s.title} — {s.centre_name}{rncp}{match}
                    </option>
                  );
                })}
              </Select>
              <p className="text-xs text-muted-foreground">
                Les CCP, compétences et critères d'évaluation seront recopiés — pas d'appel à Claude.
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || !title.trim() || !centreId}>
              {saving ? "Enregistrement…" : formation ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
