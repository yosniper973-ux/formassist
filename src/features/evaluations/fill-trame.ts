import { request as claudeRequest } from "@/lib/claude";
import {
  openDocxXml,
  extractDocxCells,
  replaceParagraphText,
  serializeDocx,
} from "@/lib/docx-template";

/**
 * Remplissage de la trame ECF d'un centre de formation.
 *
 * L'IA ne fait que du PLACEMENT (quel champ va dans quelle cellule) : tout le
 * contenu — blocs réglementaires REAC calculés depuis la BDD et sujet généré —
 * est fourni dans le payload. Un post-contrôle re-substitue le texte exact du
 * payload si l'IA a reformulé un bloc réglementaire.
 */

export interface TramePayload {
  titre_professionnel: string;
  code_rncp: string;
  duree: string;
  date_epreuve: string;
  /** Ex. "Compétences n°10, 11, 12 – CCP3" */
  competences_header: string;
  /** Descriptions REAC verbatim, groupées par compétence */
  description_competences_reac: string;
  /** Un bloc "Rappel des compétences évaluées" par CCP couvert */
  rappels_ccp: { ccp_code: string; texte: string }[];
  /** Critères d'évaluation du référentiel, verbatim */
  criteres_evaluation: string;
  /** Le sujet complet en texte brut (consignes, mise en situation, questions, barème) */
  sujet_texte: string;
  consignes: string;
}

interface Replacement {
  id: string;
  new_text: string;
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Post-contrôle verbatim des blocs réglementaires                            */
/* ───────────────────────────────────────────────────────────────────────── */

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Similarité de Dice sur bigrammes de mots (0 → rien en commun, 1 → identique). */
function diceSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const words = normalize(s).split(" ");
    const set = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      set.add(words[i] + " " + words[i + 1]);
    }
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * Si un texte renvoyé par l'IA ressemble fortement à un bloc réglementaire du
 * payload sans lui être identique (reformulation, coupure…), on lui substitue
 * le texte exact du payload. Les blocs réglementaires doivent rester verbatim.
 */
function enforceVerbatim(newText: string, payload: TramePayload): string {
  const regulatoryBlocks = [
    payload.description_competences_reac,
    payload.criteres_evaluation,
    ...payload.rappels_ccp.map((r) => r.texte),
  ].filter((b) => b.trim().length > 40);

  for (const block of regulatoryBlocks) {
    if (normalize(newText) === normalize(block)) return block;
    if (diceSimilarity(newText, block) > 0.7) return block;
  }
  return newText;
}

/* ───────────────────────────────────────────────────────────────────────── */
/* API publique                                                               */
/* ───────────────────────────────────────────────────────────────────────── */

export async function fillEvaluationTrame(
  templatePath: string,
  payload: TramePayload,
): Promise<{ blob: Blob; cost: number }> {
  const { zip, xmlDoc } = await openDocxXml(templatePath);

  const cells = extractDocxCells(xmlDoc);
  if (cells.length === 0) {
    throw new Error("La trame ne contient aucun paragraphe exploitable.");
  }

  const cellsForClaude = cells.map((c) => ({
    id: c.id,
    path: c.path,
    text: c.text,
    context_before: c.context_before,
    col_index: c.col_index,
  }));

  const userMessage =
    `Voici les paragraphes de la trame ECF du centre :\n\n` +
    JSON.stringify({ paragraphes: cellsForClaude }, null, 2) +
    `\n\nVoici les champs à placer :\n\n` +
    JSON.stringify({ champs: payload }, null, 2) +
    `\n\nRenvoie UNIQUEMENT le JSON des remplacements ("KEEP" pour les paragraphes à conserver).`;

  const result = await claudeRequest({
    task: "remplissage_trame",
    messages: [{ role: "user", content: userMessage }],
  });

  const codeBlock = result.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const rawJson =
    codeBlock?.[1] ?? result.content.match(/\{[\s\S]*\}/)?.[0] ?? null;
  if (!rawJson) {
    throw new Error("L'IA n'a pas renvoyé de JSON valide pour le remplissage de la trame.");
  }

  let parsed: { replacements: Replacement[] };
  try {
    parsed = JSON.parse(rawJson) as { replacements: Replacement[] };
  } catch (e) {
    throw new Error(
      `JSON invalide dans la réponse de remplissage : ${e instanceof Error ? e.message : e}`,
    );
  }

  const cellMap = new Map(cells.map((c) => [c.id, c]));
  for (const r of parsed.replacements ?? []) {
    if (r.new_text === "KEEP" || r.new_text === undefined) continue;
    const cell = cellMap.get(r.id);
    if (!cell) continue;
    const finalText = enforceVerbatim(r.new_text, payload);
    replaceParagraphText(cell.paragraph, finalText, xmlDoc);
  }

  return { blob: serializeDocx(zip, xmlDoc), cost: result.costEuros };
}
