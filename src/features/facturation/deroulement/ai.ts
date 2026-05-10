import { request as claudeRequest } from "@/lib/claude";
import { getContentFullMarkdown } from "./queries";
import type { PhaseDraft } from "./types";

interface PrefillInput {
  formation_title: string;
  ccp_title: string;
  dates_label: string;
  total_duration_hours: number;
  phases: Array<{
    competence_id: string;
    code: string;
    intitule: string;
    duree_heures: number;
    is_ecf: boolean;
    critere_descriptions: string[];
    selected_content_ids: string[];
  }>;
}

interface PrefillOutput {
  objectif_general: string;
  phases: Array<{
    competence_id: string;
    objectifs_operationnels: string;
    contenu: string;
    methodes: string;
    outils: string;
    evaluation: string;
  }>;
}

/** Essaie de parser la réponse JSON de Claude, en gérant un éventuel fence ```json ... ``` */
function parseJsonResponse(raw: string): PrefillOutput {
  let txt = raw.trim();
  // Retirer fences markdown
  const fenceMatch = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) txt = fenceMatch[1].trim();
  // Extraire le premier objet JSON brut si du texte parasite encadre
  const firstBrace = txt.indexOf("{");
  const lastBrace = txt.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    txt = txt.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(txt) as PrefillOutput;
}

/** Appelle Claude pour rédiger objectif général + colonnes des phases */
export async function prefillDeroulement(input: PrefillInput): Promise<PrefillOutput> {
  // Construire le payload : pour chaque phase, inclure un extrait markdown des exercices cochés
  const phasesWithContents = await Promise.all(
    input.phases.map(async (p) => {
      const contents = await Promise.all(
        p.selected_content_ids.map((cid) => getContentFullMarkdown(cid)),
      );
      return {
        competence_id: p.competence_id,
        code: p.code,
        intitule: p.intitule,
        duree_heures: p.duree_heures,
        is_ecf: p.is_ecf,
        critere_descriptions: p.critere_descriptions,
        exercices: contents
          .filter((c): c is NonNullable<typeof c> => c !== null)
          .map((c) => ({
            title: c.title,
            content_type: c.content_type,
            extrait: c.content_markdown.substring(0, 1800),
          })),
      };
    }),
  );

  const userPayload = {
    formation: input.formation_title,
    titre_seance: input.ccp_title,
    dates: input.dates_label,
    duree_totale_heures: input.total_duration_hours,
    phases: phasesWithContents,
  };

  const response = await claudeRequest({
    task: "prefill_deroulement",
    messages: [
      {
        role: "user",
        content: `Voici les données pour pré-remplir la fiche de déroulement :\n\n${JSON.stringify(
          userPayload,
          null,
          2,
        )}\n\nRéponds UNIQUEMENT avec le JSON demandé.`,
      },
    ],
  });

  const parsed = parseJsonResponse(response.content);

  // Remap : garantir l'ordre et les competence_id attendus
  const byId = new Map(parsed.phases.map((p) => [p.competence_id, p]));
  return {
    objectif_general: parsed.objectif_general ?? "",
    phases: input.phases.map((p) => {
      const filled = byId.get(p.competence_id);
      return {
        competence_id: p.competence_id,
        objectifs_operationnels: filled?.objectifs_operationnels ?? "",
        contenu: filled?.contenu ?? "",
        methodes: filled?.methodes ?? "",
        outils: filled?.outils ?? "",
        evaluation: filled?.evaluation ?? "",
      };
    }),
  };
}

/** Merge le résultat IA dans les phases existantes sans écraser les champs déjà saisis */
export function mergePrefillResult(
  phases: PhaseDraft[],
  result: PrefillOutput,
): { phases: PhaseDraft[]; objectif_general: string } {
  const byId = new Map(result.phases.map((p) => [p.competence_id, p]));
  return {
    objectif_general: result.objectif_general,
    phases: phases.map((p) => {
      const r = byId.get(p.competence_id);
      if (!r) return p;
      return {
        ...p,
        objectifs_operationnels:
          r.objectifs_operationnels || p.objectifs_operationnels,
        contenu: r.contenu || p.contenu,
        methodes: r.methodes || p.methodes,
        outils: r.outils || p.outils,
        evaluation: r.evaluation || p.evaluation,
      };
    }),
  };
}
