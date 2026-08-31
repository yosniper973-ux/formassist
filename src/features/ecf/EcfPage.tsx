import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Formation } from "@/types";

/**
 * Évaluations en cours de formation.
 *
 * L'ECF est l'évaluation écrite conduite par le centre pendant la formation.
 * Elle est distincte de la session de validation devant jury, qui repose sur
 * une mise en situation professionnelle — les deux ne se conçoivent pas de la
 * même façon et ne se rédigent pas dans les mêmes documents.
 */
export function EcfPage() {
  const activeCentreId = useAppStore((s) => s.activeCentreId);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [formationId, setFormationId] = useState("");
  const [ccps, setCcps] = useState<Array<{ id: string; code: string; title: string }>>([]);

  useEffect(() => {
    (async () => {
      const rows = await db.query<Formation>(
        `SELECT f.* FROM formations f
          WHERE f.archived_at IS NULL
            AND (? IS NULL OR f.centre_id = ?)
          ORDER BY f.title`,
        [activeCentreId, activeCentreId],
      );
      setFormations(rows);
      if (rows[0] && !formationId) setFormationId(rows[0].id);
    })().catch(() => setFormations([]));
  }, [activeCentreId]);

  useEffect(() => {
    if (!formationId) {
      setCcps([]);
      return;
    }
    db.query<{ id: string; code: string; title: string }>(
      "SELECT id, code, title FROM ccps WHERE formation_id = ? ORDER BY sort_order",
      [formationId],
    )
      .then(setCcps)
      .catch(() => setCcps([]));
  }, [formationId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Évaluations en cours de formation
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          L'ECF est l'évaluation écrite conduite par le centre pendant la formation. Elle ne se
          confond pas avec la session de validation devant jury, qui repose sur une mise en
          situation professionnelle.
        </p>
      </div>

      <div className="max-w-md">
        <Label htmlFor="formation">Formation</Label>
        <select
          id="formation"
          className="w-full mt-1 rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
          value={formationId}
          onChange={(e) => setFormationId(e.target.value)}
        >
          {formations.length === 0 && <option value="">Aucune formation</option>}
          {formations.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Structure de la formation</CardTitle>
        </CardHeader>
        <CardContent>
          {ccps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun CCP dans cette formation. Importe d'abord le REAC depuis la fiche formation.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {ccps.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium text-foreground">{c.code}</span>
                  <span className="text-muted-foreground"> — {c.title}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Génération des ECF</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            En attente des trames d'ECF utilisées par le centre : nombre d'épreuves, forme écrite
            retenue, durée, et grille de correction. La génération sera calée dessus plutôt que
            reconstruite.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
