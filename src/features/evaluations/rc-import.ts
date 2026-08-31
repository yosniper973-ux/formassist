import { requestStream } from "@/lib/claude";
import { db } from "@/lib/db";
import type { ClaudeContentBlock } from "@/types/api";

export type EpreuveParsee = {
  scope?: string;
  ccp_code?: string | null;
  modalite: string;
  duree_minutes?: number | null;
  detail?: string | null;
  parties?: Array<{ intitule: string; duree_minutes?: number | null; detail?: string | null }>;
};

export type RcParse = {
  titre?: string;
  code_titre?: string;
  millesime?: string;
  epreuves: EpreuveParsee[];
  duree_totale_minutes?: number | null;
  warnings?: string[];
};

/** Extrait le premier objet JSON d'une réponse, par comptage d'accolades. */
function extraitJson(texte: string): string | null {
  const bloc = texte.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (bloc?.[1]?.trim().startsWith("{")) return bloc[1];
  const debut = texte.indexOf("{");
  if (debut === -1) return null;
  let prof = 0, chaine = false, echap = false;
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i]!;
    if (echap) { echap = false; continue; }
    if (chaine && c === "\\") { echap = true; continue; }
    if (c === '"') { chaine = !chaine; continue; }
    if (chaine) continue;
    if (c === "{") prof++;
    else if (c === "}" && --prof === 0) return texte.slice(debut, i + 1);
  }
  return null;   // JSON tronqué
}

/** Lit le PDF du référentiel d'évaluation et en extrait les modalités. */
export async function analyserRc(
  file: File,
  signal: AbortSignal,
  onProgress?: (recu: number) => void,
): Promise<RcParse> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error("Le fichier semble vide. Ouvre-le d'abord pour vérifier.");
  }
  const bytes = new Uint8Array(buffer);
  const morceaux: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    morceaux.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  const contenu: ClaudeContentBlock[] = [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: btoa(morceaux.join("")) },
    },
    {
      type: "text",
      text:
        "Voici le référentiel d'évaluation d'un titre professionnel. Extrais les modalités " +
        "de l'épreuve : durées, parties de la mise en situation, entretiens.",
    },
  ];

  let texte = "";
  let tronque = false;
  for await (const chunk of requestStream(
    { task: "parsing_rc", maxTokens: 32000, messages: [{ role: "user", content: contenu }] },
    signal,
    (meta) => { tronque = meta.stopReason === "max_tokens"; },
  )) {
    texte += chunk;
    onProgress?.(texte.length);
  }

  const brut = extraitJson(texte);
  if (!brut) {
    throw new Error(
      tronque
        ? "La réponse a été coupée avant la fin. Le document est probablement trop volumineux."
        : "La réponse ne contient pas de JSON exploitable. Réessaie.",
    );
  }
  const parse = JSON.parse(brut.replace(/,(\s*[}\]])/g, "$1")) as RcParse;
  if (!Array.isArray(parse.epreuves)) parse.epreuves = [];
  return parse;
}

/** Remplace les modalités d'une formation par celles qu'on vient d'extraire. */
export async function enregistrerRc(formationId: string, parse: RcParse): Promise<number> {
  await db.execute(
    "DELETE FROM certification_epreuves WHERE formation_id = ?",
    [formationId],
  );
  let n = 0;
  for (const [i, ep] of parse.epreuves.entries()) {
    const id = db.generateId();
    await db.execute(
      `INSERT INTO certification_epreuves
         (id, formation_id, scope, ccp_code, modalite, duree_minutes, detail, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, formationId, ep.scope ?? "titre", ep.ccp_code ?? null, ep.modalite,
       ep.duree_minutes ?? null, ep.detail ?? null, i],
    );
    n++;
    for (const [j, p] of (ep.parties ?? []).entries()) {
      await db.execute(
        `INSERT INTO certification_parties
           (id, epreuve_id, intitule, duree_minutes, detail, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [db.generateId(), id, p.intitule, p.duree_minutes ?? null, p.detail ?? null, j],
      );
    }
  }
  await db.execute("UPDATE formations SET rc_parsed = 1 WHERE id = ?", [formationId]);
  return n;
}

const LIBELLE: Record<string, string> = {
  mise_en_situation: "Mise en situation professionnelle",
  entretien_technique: "Entretien technique",
  questionnaire: "Questionnaire professionnel",
  questionnement_production: "Questionnement à partir de productions",
  entretien_final: "Entretien final",
};

/** Résumé textuel des modalités, injecté dans les prompts d'évaluation. */
export async function modalitesPourPrompt(formationId: string): Promise<string> {
  const eps = await db.query<{
    id: string; scope: string; ccp_code: string | null;
    modalite: string; duree_minutes: number | null; detail: string | null;
  }>(
    "SELECT id, scope, ccp_code, modalite, duree_minutes, detail \
     FROM certification_epreuves WHERE formation_id = ? ORDER BY scope DESC, sort_order",
    [formationId],
  );
  if (eps.length === 0) return "";

  const lignes: string[] = [];
  for (const e of eps) {
    const ou = e.scope === "ccp" ? ` (session ${e.ccp_code ?? "CCP"})` : "";
    const d = e.duree_minutes ? ` — ${e.duree_minutes} min` : "";
    lignes.push(`- **${LIBELLE[e.modalite] ?? e.modalite}**${ou}${d}`);
    if (e.detail) lignes.push(`  ${e.detail.replace(/\s+/g, " ").slice(0, 400)}`);
    const parties = await db.query<{ intitule: string; duree_minutes: number | null }>(
      "SELECT intitule, duree_minutes FROM certification_parties \
       WHERE epreuve_id = ? ORDER BY sort_order",
      [e.id],
    );
    for (const p of parties) {
      lignes.push(`  · ${p.intitule}${p.duree_minutes ? ` — ${p.duree_minutes} min` : ""}`);
    }
  }
  return lignes.join("\n");
}
