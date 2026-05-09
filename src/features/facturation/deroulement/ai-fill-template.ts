import PizZip from "pizzip";
import { invoke } from "@tauri-apps/api/core";
import { request as claudeRequest } from "@/lib/claude";
import type { DeroulementDraft } from "./types";

/**
 * Remplit un template DOCX dont les cellules ne contiennent pas de balises
 * docxtemplater (`{formation}`, etc.) en utilisant Claude pour mapper les
 * données sur les cellules vides ou à remplir.
 *
 * Préserve la mise en forme : on ne touche QUE au texte des éléments <w:t>,
 * jamais aux balises XML, runs (<w:r>), styles (<w:rPr>), tableaux, etc.
 *
 * Limitation v0.3.0 : un template avec une "ligne phase" répétitive ne sera
 * pas dupliqué automatiquement — seule la première phase sera remplie.
 * À améliorer en v0.3.1 (détection + duplication de la ligne).
 */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

interface CellInfo {
  /** ID stable pour le mapping renvoyé par Claude */
  id: string;
  /** Chemin lisible : "table[2]/row[3]/cell[1]/paragraph[0]" */
  path: string;
  /** Texte concaténé de tous les <w:t> du paragraphe */
  text: string;
  /** Élément <w:p> source (pour appliquer la modification ensuite) */
  paragraph: Element;
  /** Texte du paragraphe précédent (contexte pour Claude) */
  context_before: string;
}

interface ClaudeReplacement {
  id: string;
  /** Nouveau texte (ou "KEEP" pour ne pas modifier) */
  new_text: string;
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Parsing XML                                                                */
/* ───────────────────────────────────────────────────────────────────────── */

function getParagraphText(p: Element): string {
  const ts = p.getElementsByTagNameNS(W_NS, "t");
  let out = "";
  for (let i = 0; i < ts.length; i++) {
    out += ts[i]!.textContent ?? "";
  }
  return out;
}

/** Extrait la liste des paragraphes avec contexte pour analyse IA. */
function extractCells(documentXml: Document): CellInfo[] {
  const paragraphs = documentXml.getElementsByTagNameNS(W_NS, "p");
  const cells: CellInfo[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    const text = getParagraphText(p).trim();
    // On garde même les paragraphes vides : ils sont les meilleurs candidats
    // pour insérer le texte de la séance.

    // Construction du path lisible
    let path = "p[" + i + "]";
    let parent: Element | null = p.parentElement;
    const segments: string[] = [];
    while (parent && parent.localName !== "body") {
      if (parent.localName === "tc") {
        // index dans la ligne
        const row = parent.parentElement;
        if (row) {
          const cells = Array.from(row.children).filter(
            (c) => (c as Element).localName === "tc",
          );
          const idx = cells.indexOf(parent);
          segments.unshift(`cell[${idx}]`);
        }
      } else if (parent.localName === "tr") {
        const tbl = parent.parentElement;
        if (tbl) {
          const rows = Array.from(tbl.children).filter(
            (c) => (c as Element).localName === "tr",
          );
          const idx = rows.indexOf(parent);
          segments.unshift(`row[${idx}]`);
        }
      } else if (parent.localName === "tbl") {
        const body = parent.parentElement;
        if (body) {
          const tables = Array.from(body.children).filter(
            (c) => (c as Element).localName === "tbl",
          );
          const idx = tables.indexOf(parent);
          segments.unshift(`table[${idx}]`);
        }
      }
      parent = parent.parentElement;
    }
    segments.push(path);
    path = segments.join("/");

    // Contexte = texte du paragraphe juste avant
    const context_before = i > 0 ? getParagraphText(paragraphs[i - 1]!).trim() : "";

    cells.push({
      id: `c${i}`,
      path,
      text,
      paragraph: p,
      context_before,
    });
  }

  return cells;
}

/**
 * Remplace le texte d'un paragraphe :
 * - Garde le tout premier <w:r><w:t> (avec son style)
 * - Met le nouveau texte (multilignes → <w:br/>) dans ce <w:t>
 * - Supprime tous les autres <w:r> du paragraphe
 * Cela préserve la police/taille/couleur/gras du premier run.
 */
function replaceParagraphText(p: Element, newText: string, doc: Document): void {
  const runs = Array.from(p.getElementsByTagNameNS(W_NS, "r"));

  // Si le paragraphe est totalement vide (pas de <w:r>), on en crée un.
  if (runs.length === 0) {
    const r = doc.createElementNS(W_NS, "w:r");
    const t = doc.createElementNS(W_NS, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.textContent = newText;
    r.appendChild(t);
    p.appendChild(r);
    return;
  }

  // Premier run conservé
  const firstRun = runs[0]!;
  // Supprime tous les <w:t> et <w:br> existants dans le premier run
  const firstRunChildren = Array.from(firstRun.children);
  for (const child of firstRunChildren) {
    const name = child.localName;
    if (name === "t" || name === "br" || name === "tab") {
      firstRun.removeChild(child);
    }
  }
  // Ajoute le nouveau texte avec gestion des sauts de ligne
  const lines = newText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      const br = doc.createElementNS(W_NS, "w:br");
      firstRun.appendChild(br);
    }
    const t = doc.createElementNS(W_NS, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.textContent = lines[i] ?? "";
    firstRun.appendChild(t);
  }

  // Supprime les autres runs
  for (let i = 1; i < runs.length; i++) {
    p.removeChild(runs[i]!);
  }
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Claude prompt                                                              */
/* ───────────────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `Tu es un expert en bureautique pédagogique. Tu reçois la liste des paragraphes d'un template Word de fiche de déroulement de séance, et les données réelles de la séance à insérer.

Pour chaque paragraphe, identifie s'il doit être :
- **Remplacé** : par une donnée précise de la séance (titre, date, durée, objectif, contenu d'une phase, etc.)
- **Conservé** (KEEP) : c'est un libellé / titre / consigne du template (ex : "Phase 1 :", "Objectifs opérationnels", "Date :", légendes, etc.)

Règles strictes :
1. Ne remplace JAMAIS les libellés (ex : "Date :", "Phase 1 :", "Méthodes pédagogiques", titres de colonnes).
2. Si le paragraphe est vide ou contient juste un placeholder vague et qu'il est dans un contexte clair (ex : à droite d'une cellule "Date :"), remplis-le.
3. Si tu n'es pas sûr, mets "KEEP".
4. Pour les listes (ex : objectifs opérationnels), utilise des sauts de ligne entre items.
5. Si le template a une seule "ligne phase" pour plusieurs phases, mets uniquement les données de la PREMIÈRE phase (les phases suivantes seront ignorées dans cette version).

Format de sortie : UN BLOC JSON unique, pas de texte autour :

\`\`\`json
{
  "replacements": [
    { "id": "c0", "new_text": "KEEP" },
    { "id": "c1", "new_text": "Communication non-violente" },
    ...
  ]
}
\`\`\``;

/* ───────────────────────────────────────────────────────────────────────── */
/* API publique                                                               */
/* ───────────────────────────────────────────────────────────────────────── */

export async function fillTemplateWithAI(
  templatePath: string,
  data: DeroulementDraft,
): Promise<{ blob: Blob; cost: number }> {
  // 1. Lecture du DOCX
  const bytes = await invoke<number[]>("read_file_bytes", { path: templatePath });
  const zip = new PizZip(new Uint8Array(bytes));
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Template DOCX invalide : word/document.xml introuvable.");
  }
  const xmlText = docFile.asText();

  // 2. Parsing
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");
  const errs = xmlDoc.getElementsByTagName("parsererror");
  if (errs.length > 0) {
    throw new Error("Le template DOCX est corrompu (XML invalide).");
  }

  // 3. Extraction des cellules
  const cells = extractCells(xmlDoc);
  if (cells.length === 0) {
    throw new Error("Le template ne contient aucun paragraphe exploitable.");
  }

  // 4. Préparation des données pour Claude
  const cellsForClaude = cells.map((c) => ({
    id: c.id,
    path: c.path,
    text: c.text,
    context_before: c.context_before,
  }));

  const seanceData = {
    formation: data.formation_title,
    titre_seance: data.titre_seance,
    redacteur: data.redacteur,
    dates: data.dates_label,
    duree_totale: `${data.total_duration_hours} h`,
    objectif_general: data.objectif_general,
    phases: data.phases.map((p, i) => ({
      numero: i + 1,
      duree: `${p.duree_heures} h`,
      intitule: p.intitule,
      is_ecf: p.is_ecf,
      objectifs_operationnels: p.objectifs_operationnels,
      contenu: p.contenu,
      methodes: p.methodes,
      outils: p.outils,
      evaluation: p.evaluation,
    })),
  };

  // 5. Appel Claude
  const userMessage = `Voici les paragraphes du template :\n\n` +
    JSON.stringify({ cells: cellsForClaude }, null, 2) +
    `\n\nVoici les données réelles de la séance :\n\n` +
    JSON.stringify(seanceData, null, 2) +
    `\n\nRenvoie UNIQUEMENT le JSON décrivant les remplacements à appliquer.`;

  const result = await claudeRequest({
    task: "prefill_deroulement",
    systemPromptOverride: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // 6. Parse la réponse
  const codeBlock = result.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const rawJson =
    codeBlock?.[1] ??
    result.content.match(/\{[\s\S]*\}/)?.[0] ??
    null;
  if (!rawJson) {
    throw new Error("Claude n'a pas renvoyé de JSON valide.");
  }

  let parsed: { replacements: ClaudeReplacement[] };
  try {
    parsed = JSON.parse(rawJson) as { replacements: ClaudeReplacement[] };
  } catch (e) {
    throw new Error(
      `JSON invalide dans la réponse de Claude : ${e instanceof Error ? e.message : e}`,
    );
  }

  // 7. Application des remplacements
  const cellMap = new Map(cells.map((c) => [c.id, c]));
  for (const r of parsed.replacements) {
    if (r.new_text === "KEEP" || r.new_text === undefined) continue;
    const cell = cellMap.get(r.id);
    if (!cell) continue;
    replaceParagraphText(cell.paragraph, r.new_text, xmlDoc);
  }

  // 8. Sérialisation + reconstruction du ZIP
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(xmlDoc);
  zip.file("word/document.xml", newXml);

  const blob = zip.generate({ type: "blob", mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

  return { blob, cost: result.costEuros };
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Détection : le template contient-il déjà des balises docxtemplater ?       */
/* ───────────────────────────────────────────────────────────────────────── */

const DOCXTEMPLATER_PLACEHOLDERS = [
  "{formation}",
  "{dates}",
  "{titre_seance}",
  "{objectif_general}",
  "{redacteur}",
  "{duree_totale}",
  "{#phases}",
];

export async function templateHasPlaceholders(
  templatePath: string,
): Promise<boolean> {
  try {
    const bytes = await invoke<number[]>("read_file_bytes", { path: templatePath });
    const zip = new PizZip(new Uint8Array(bytes));
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    return DOCXTEMPLATER_PLACEHOLDERS.some((p) => xml.includes(p));
  } catch {
    return false;
  }
}
