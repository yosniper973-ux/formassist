import PizZip from "pizzip";
import { invoke } from "@tauri-apps/api/core";

/**
 * Primitives génériques de lecture/écriture du XML d'un document Word (.docx),
 * pour remplir n'importe quelle trame en préservant sa mise en forme.
 *
 * Copiées depuis features/facturation/deroulement/ai-fill-template.ts (v0.3.45),
 * sans la logique spécifique aux fiches de déroulement (phases, colonnes).
 * Le déroulement garde sa propre copie pour ne pas risquer de régression ;
 * un refactor commun est envisageable plus tard.
 *
 * Limitation v1 : seul word/document.xml est traité (pas les en-têtes/pieds
 * de page word/header*.xml — extension possible si une trame l'exige).
 */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export interface DocxCell {
  /** ID stable pour le mapping renvoyé par Claude ("c0", "c1"…) */
  id: string;
  /** Chemin lisible : "table[2]/row[3]/cell[1]/p[7]" ou "p[4]" hors tableau */
  path: string;
  /** Texte concaténé de tous les <w:t> du paragraphe */
  text: string;
  /** Élément <w:p> source (pour appliquer la modification ensuite) */
  paragraph: Element;
  /** Texte du paragraphe précédent (contexte pour Claude) */
  context_before: string;
  /** Indice de colonne dans le tableau, ou null hors tableau */
  col_index: number | null;
}

export async function openDocxXml(
  path: string,
): Promise<{ zip: PizZip; xmlDoc: Document }> {
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  const zip = new PizZip(new Uint8Array(bytes));
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Fichier DOCX invalide : word/document.xml introuvable.");
  }
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docFile.asText(), "application/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Le fichier DOCX est corrompu (XML invalide).");
  }
  return { zip, xmlDoc };
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
export function extractDocxCells(xmlDoc: Document): DocxCell[] {
  const paragraphs = xmlDoc.getElementsByTagNameNS(W_NS, "p");
  const cells: DocxCell[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    const text = getParagraphText(p).trim();

    // Construction du path lisible
    let path = "p[" + i + "]";
    let parent: Element | null = p.parentElement;
    const segments: string[] = [];
    let colIndex: number | null = null;
    while (parent && parent.localName !== "body") {
      if (parent.localName === "tc") {
        const row = parent.parentElement;
        if (row) {
          const tcs = Array.from(row.children).filter(
            (c) => (c as Element).localName === "tc",
          );
          const idx = tcs.indexOf(parent);
          segments.unshift(`cell[${idx}]`);
          // La 1re cellule rencontrée (la plus proche du paragraphe) = sa colonne.
          if (colIndex === null) colIndex = idx;
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
      col_index: colIndex,
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
export function replaceParagraphText(
  p: Element,
  newText: string,
  doc: Document,
): void {
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

  // Premier run conservé : on vide son texte puis on y met le nouveau contenu
  const firstRun = runs[0]!;
  const firstRunChildren = Array.from(firstRun.children);
  for (const child of firstRunChildren) {
    const name = child.localName;
    if (name === "t" || name === "br" || name === "tab") {
      firstRun.removeChild(child);
    }
  }
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

/** Sérialise le XML modifié et reconstruit le blob .docx. */
export function serializeDocx(zip: PizZip, xmlDoc: Document): Blob {
  const newXml = new XMLSerializer().serializeToString(xmlDoc);
  zip.file("word/document.xml", newXml);
  return zip.generate({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }) as Blob;
}

/**
 * Convertit du markdown en texte brut lisible pour injection dans une cellule
 * Word (le style vient du run conservé, pas du markdown).
 */
export function markdownToPlainText(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine;

    // Lignes séparatrices de tableau : |---|---| → supprimées
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-")) continue;
    // Séparateurs horizontaux
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) continue;

    // Lignes de tableau : | a | b | c | → "a — b — c"
    if (/^\s*\|.*\|\s*$/.test(line)) {
      line = line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim())
        .join(" — ");
    }

    // Titres : garder le texte, sans les #
    line = line.replace(/^\s*#{1,6}\s+/, "");
    // Callouts GitHub : > [!info] Titre → Titre
    line = line.replace(/^\s*>\s*\[!\w+\]\s*/, "");
    // Citations simples
    line = line.replace(/^\s*>\s?/, "");
    // Gras / italique / code
    line = line.replace(/\*\*([^*]+)\*\*/g, "$1");
    line = line.replace(/\*([^*]+)\*/g, "$1");
    line = line.replace(/__([^_]+)__/g, "$1");
    line = line.replace(/`([^`]+)`/g, "$1");
    // Liens [texte](url) → texte
    line = line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    // Cases à cocher markdown
    line = line.replace(/^(\s*)-\s+\[[ x]\]\s+/i, "$1- ");

    out.push(line);
  }

  // Compacte les lignes vides multiples
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
