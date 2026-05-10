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
  /** Numéro de bloc de phase auquel appartient cette cellule (1, 2, 3…) ou null */
  phase_block: number | null;
}

interface ClaudeReplacement {
  id: string;
  /** Nouveau texte (ou "KEEP" pour ne pas modifier) */
  new_text: string;
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Parsing XML                                                                */
/* ───────────────────────────────────────────────────────────────────────── */

const PHASE_LABEL_RE_GLOBAL =
  /^(?:phase|s[ée]quence|module|[ée]tape|partie|activit[ée]|bloc|s[ée]ance|unit[ée]|section)\s+(\d+)\s*[:：\s]/i;

/** Récupère tout le texte concaténé d'un élément (paragraphes, runs…). */
function getElementText(el: Element): string {
  const ts = el.getElementsByTagNameNS(W_NS, "t");
  let out = "";
  for (let i = 0; i < ts.length; i++) {
    out += ts[i]!.textContent ?? "";
  }
  return out;
}

/**
 * Trouve les lignes de tableau (<w:tr>) qui sont des "lignes de phase"
 * (contiennent un libellé "Phase N", "Séquence N", etc.) et renvoie un
 * mapping numéro → élément <w:tr>.
 */
function findPhaseRows(documentXml: Document): Map<number, Element> {
  const rows = documentXml.getElementsByTagNameNS(W_NS, "tr");
  const map = new Map<number, Element>();
  for (let i = 0; i < rows.length; i++) {
    const tr = rows[i]!;
    const text = getElementText(tr).trim();
    const m = text.match(PHASE_LABEL_RE_GLOBAL);
    if (m) {
      const num = parseInt(m[1]!, 10);
      // On garde la PREMIÈRE occurrence de chaque numéro (au cas où le
      // template a des doublons étranges)
      if (!map.has(num)) map.set(num, tr);
    }
  }
  return map;
}

/**
 * Si le template a moins de lignes "Phase N" que requiredPhases, on
 * duplique la dernière ligne de phase autant de fois que nécessaire pour
 * atteindre le nombre requis. Le numéro "Phase N" du label est mis à jour
 * dans les copies, le reste du texte est conservé tel quel (Claude le
 * remplacera ensuite par les vraies données).
 */
function ensureEnoughPhaseRows(
  documentXml: Document,
  requiredPhases: number,
): void {
  const phaseRows = findPhaseRows(documentXml);
  if (phaseRows.size === 0) return;

  const existingNumbers = Array.from(phaseRows.keys()).sort((a, b) => a - b);
  const maxExisting = existingNumbers[existingNumbers.length - 1]!;
  if (maxExisting >= requiredPhases) return;

  const lastRow = phaseRows.get(maxExisting)!;
  const parent = lastRow.parentNode;
  if (!parent) return;

  let previous = lastRow;
  for (let n = maxExisting + 1; n <= requiredPhases; n++) {
    const cloned = lastRow.cloneNode(true) as Element;
    // Remplace le numéro de phase dans le label cloné (ex : "Phase 3 :" → "Phase 4 :")
    const ts = cloned.getElementsByTagNameNS(W_NS, "t");
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]!;
      const txt = t.textContent ?? "";
      if (PHASE_LABEL_RE_GLOBAL.test(txt)) {
        t.textContent = txt.replace(/\d+/, String(n));
      }
    }
    // Insertion juste après la ligne précédente
    if (previous.nextSibling) {
      parent.insertBefore(cloned, previous.nextSibling);
    } else {
      parent.appendChild(cloned);
    }
    previous = cloned;
  }
}

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

    // Construction du path lisible
    let path = "p[" + i + "]";
    let parent: Element | null = p.parentElement;
    const segments: string[] = [];
    while (parent && parent.localName !== "body") {
      if (parent.localName === "tc") {
        const row = parent.parentElement;
        if (row) {
          const tcs = Array.from(row.children).filter(
            (c) => (c as Element).localName === "tc",
          );
          const idx = tcs.indexOf(parent);
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

    const context_before = i > 0 ? getParagraphText(paragraphs[i - 1]!).trim() : "";

    cells.push({
      id: `c${i}`,
      path,
      text,
      paragraph: p,
      context_before,
      phase_block: null,
    });
  }

  // Deuxième passe : détecte les blocs de phase et propage le numéro.
  // Gère les variantes : "Phase 1", "Séquence 2", "Module 3", "Étape 4",
  // "Partie 5", "Activité 6", "Bloc 7", "Séance 8", "Unité 9", etc.
  let currentPhase: number | null = null;
  for (const cell of cells) {
    const m = cell.text.match(PHASE_LABEL_RE_GLOBAL);
    if (m) {
      currentPhase = parseInt(m[1]!, 10);
    }
    cell.phase_block = currentPhase;
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

const SYSTEM_PROMPT = `Tu es un expert en bureautique pédagogique. Tu reçois :
1. La liste des paragraphes d'un template Word de fiche de déroulement de séance (avec pour chaque cellule son texte actuel, son chemin XML, son contexte et son numéro de bloc de phase détecté).
2. Les données réelles de la séance à insérer, avec N phases numérotées.

Pour chaque paragraphe, décide :
- **Remplacer** : mettre une donnée précise de la séance à la place du texte actuel
- **"KEEP"** : conserver le texte tel quel (libellés, titres de colonnes, légendes)

Règles strictes :
1. Ne remplace JAMAIS les libellés fixes : titres de colonnes (ex : "Phases", "Objectifs opérationnels (compétences attendues)", "Contenu", "Méthodes pédagogiques (1)", "Outils et techniques (2)", "Evaluation prévue"), légendes en bas de page, en-têtes de section.
2. Remplis les zones vides ou placeholders : paragraphes vides, "……", "XXXXXX", "x heures", "Intitulé", "durée", "00/00/XXXX", "Prénom NOM", etc.
3. Correspondance des phases — chaque cellule a un champ "phase_block" (1, 2, 3… ou null). Utilise-le pour associer la bonne phase :
   - phase_block = 1 → utilise les données de la phase numéro 1
   - phase_block = 2 → utilise les données de la phase numéro 2
   - phase_block = N → utilise les données de la phase numéro N
   - Si phase_block > nombre de phases dans les données → laisse en "KEEP"
4. Dans chaque bloc de phase, identifie et remplis :
   - La cellule contenant "Phase N : durée" ou juste "durée" → "Phase N : X h" (durée de la phase correspondante)
   - La cellule contenant "Intitulé" → intitulé de la phase
   - La cellule vide à côté / en dessous de "Objectifs opérationnels" → objectifs_operationnels
   - La cellule vide à côté / en dessous de "Contenu" → contenu
   - La cellule vide à côté / en dessous de "Méthodes pédagogiques" → methodes
   - La cellule vide à côté / en dessous de "Outils et techniques" → outils
   - La cellule vide à côté / en dessous de "Evaluation prévue" → evaluation
5. Remplis aussi les cellules globales :
   - "Durée totale : x heures" → "Durée totale : X heures" (duree_totale)
   - Zone formation/titre/dates/rédacteur dans l'en-tête du document
   - Zone objectif général
6. Pour les listes (objectifs, critères), utilise des sauts de ligne \\n entre items.
7. En cas de doute, mets "KEEP".

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

  // 3. Si les données contiennent plus de phases que le template n'a de
  // lignes "Phase N", on duplique la dernière ligne de phase pour ajouter
  // les lignes manquantes (préserve mise en forme, polices, bordures).
  ensureEnoughPhaseRows(xmlDoc, data.phases.length);

  // 4. Extraction des cellules
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
    phase_block: c.phase_block,
  }));

  const seanceData = {
    formation: data.formation_title,
    titre_seance: data.titre_seance,
    redacteur: data.redacteur,
    dates: data.dates_label,
    duree_totale: `${data.total_duration_hours} h`,
    objectif_general: data.objectif_general,
    nb_phases: data.phases.length,
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
  const userMessage =
    `Le template a ${data.phases.length} phase(s) à remplir.\n\n` +
    `Voici les paragraphes du template :\n\n` +
    JSON.stringify({ cells: cellsForClaude }, null, 2) +
    `\n\nVoici les données réelles de la séance :\n\n` +
    JSON.stringify(seanceData, null, 2) +
    `\n\nRenvoie UNIQUEMENT le JSON décrivant les remplacements à appliquer. Remplis TOUTES les phases présentes dans les données (${data.phases.length} phase(s)).`;

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
