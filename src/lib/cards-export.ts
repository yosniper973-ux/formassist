import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, VerticalAlign, PageBreak,
} from "docx";
import { decodeHtmlEntities } from "./utils";

/**
 * Saut de page minimal : un paragraphe de taille 1 qui tient dans la réserve
 * laissée sous le tableau. Un paragraphe de taille normale n'y entrait plus et
 * basculait page suivante, y insérant une page blanche.
 */
function saut() {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1 },
    children: [new PageBreak()],
  });
}

/** Un jeu de cartes extrait de la section « matériel à imprimer ». */
export type CardSet = {
  nom: string;
  /** Intitulés de colonnes : la 1re est le recto, les suivantes le verso. */
  colonnes: string[];
  cartes: string[][];
};

const SECTION_RE = /^#{1,4}\s*.*MAT[ÉE]RIEL\s+À\s+IMPRIMER/im;
const AUTRE_TITRE_RE = /^#{1,4}\s+/;

/**
 * Extrait les jeux de cartes de la section « MATÉRIEL À IMPRIMER » d'un contenu
 * généré. Chaque tableau markdown y devient un jeu ; le titre le plus proche
 * au-dessus lui sert de nom.
 */
export function extractCardSets(markdown: string): CardSet[] {
  const md = decodeHtmlEntities(markdown);
  const debut = md.search(SECTION_RE);
  if (debut < 0) return [];

  const apres = md.slice(debut);
  const lignes = apres.split("\n");
  // La section s'arrête au prochain titre de même niveau ou supérieur.
  let fin = lignes.length;
  for (let i = 1; i < lignes.length; i++) {
    const l = lignes[i]!;
    if (AUTRE_TITRE_RE.test(l) && !/MAT[ÉE]RIEL/i.test(l)) {
      const niveau = (l.match(/^#+/) ?? ["#"])[0].length;
      if (niveau <= 2) { fin = i; break; }
    }
  }
  const corps = lignes.slice(1, fin);

  const sets: CardSet[] = [];
  let nomCourant = "";
  for (let i = 0; i < corps.length; i++) {
    const l = corps[i]!.trim();
    if (!l) continue;

    if (/^#{3,4}\s+/.test(l)) { nomCourant = l.replace(/^#+\s*/, "").trim(); continue; }
    if (/^\*\*[^*]+\*\*\s*$/.test(l)) { nomCourant = l.replace(/\*\*/g, "").trim(); continue; }

    // Un tableau markdown : ligne d'en-tête, ligne de séparation, puis les cartes.
    if (l.startsWith("|") && corps[i + 1]?.trim().startsWith("|") &&
        /^\|[\s:|-]+\|$/.test(corps[i + 1]!.trim())) {
      const cell = (row: string) =>
        row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const colonnes = cell(l);
      const cartes: string[][] = [];
      let j = i + 2;
      while (j < corps.length && corps[j]!.trim().startsWith("|")) {
        const c = cell(corps[j]!);
        if (c.some((v) => v.length > 0)) cartes.push(c);
        j++;
      }
      if (cartes.length > 0) {
        sets.push({ nom: nomCourant || "Cartes", colonnes, cartes });
      }
      nomCourant = "";
      i = j - 1;
    }
  }
  return sets;
}

// A4 portrait, marges 0,5 pouce : 6 cartes par page en 2 × 3.
const PAGE_W = 11906, PAGE_H = 16838, MARGE = 720;
const COLS = 2, ROWS = 3;
const CARTE_W = Math.floor((PAGE_W - MARGE * 2) / COLS);
// Les marges internes de cellule (320 dxa) s'ajoutent à la hauteur de rangée :
// sans cette réserve, la troisième rangée dépassait de 14 pt et basculait page
// suivante. Mesuré sur rendu : rangée = CARTE_H + 320 dxa.
const CARTE_H = Math.floor((PAGE_H - MARGE * 2) / ROWS) - 560;
const NAVY = "1A3C5E";

const coupe = { style: BorderStyle.DASHED, size: 4, color: "999999" };
const bords = { top: coupe, bottom: coupe, left: coupe, right: coupe };

function carte(recto: string, verso: string[], colonnes: string[], versoFace: boolean) {
  const kids: Paragraph[] = [];
  if (!versoFace) {
    kids.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 0 },
      children: [new TextRun({ text: recto, bold: true, size: 30, color: NAVY, font: "Arial" })],
    }));
  } else {
    verso.forEach((v, k) => {
      if (!v) return;
      if (colonnes.length > 2) {
        kids.push(new Paragraph({
          spacing: { before: k === 0 ? 120 : 90, after: 20 },
          children: [new TextRun({
            text: (colonnes[k + 1] ?? "").toUpperCase(),
            bold: true, size: 13, color: "888888", font: "Arial",
          })],
        }));
      }
      kids.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: colonnes.length > 2 ? 0 : 120, after: 40, line: 250 },
        children: [new TextRun({ text: v, size: 19, font: "Arial" })],
      }));
    });
  }
  if (kids.length === 0) kids.push(new Paragraph({ children: [] }));
  return new TableCell({
    width: { size: CARTE_W, type: WidthType.DXA },
    margins: { top: 160, bottom: 160, left: 200, right: 200 },
    verticalAlign: VerticalAlign.CENTER,
    borders: bords,
    children: kids,
  });
}

function vide() {
  return new TableCell({
    width: { size: CARTE_W, type: WidthType.DXA },
    borders: bords,
    children: [new Paragraph({ children: [] })],
  });
}

/**
 * Construit les planches d'un jeu : une page de rectos, puis une page de versos
 * dont les colonnes sont inversées pour que l'impression recto-verso (retournement
 * sur le bord long) fasse coïncider les deux faces.
 */
function planches(set: CardSet): (Table | Paragraph)[] {
  const out: (Table | Paragraph)[] = [];
  const aVerso = set.colonnes.length > 1 && set.cartes.some((c) => c.slice(1).some(Boolean));
  const parPage = COLS * ROWS;

  for (let p = 0; p < set.cartes.length; p += parPage) {
    const lot = set.cartes.slice(p, p + parPage);
    for (const face of aVerso ? [false, true] : [false]) {
      if (out.length > 0) out.push(saut());
      const rows: TableRow[] = [];
      for (let r = 0; r < ROWS; r++) {
        const cells: TableCell[] = [];
        for (let c = 0; c < COLS; c++) {
          // Verso : on inverse l'ordre des colonnes pour le recto-verso.
          const col = face ? COLS - 1 - c : c;
          const item = lot[r * COLS + col];
          cells.push(item ? carte(item[0] ?? "", item.slice(1), set.colonnes, face) : vide());
        }
        rows.push(new TableRow({ height: { value: CARTE_H, rule: "atLeast" }, children: cells }));
      }
      out.push(new Table({
        columnWidths: Array(COLS).fill(CARTE_W),
        width: { size: CARTE_W * COLS, type: WidthType.DXA },
        rows,
      }));
    }
  }
  return out;
}

/** Page de garde d'un jeu : quoi imprimer, en combien d'exemplaires. */
function garde(set: CardSet, exemplaires: number): Paragraph[] {
  const pages = Math.ceil(set.cartes.length / (COLS * ROWS));
  const aVerso = set.colonnes.length > 1 && set.cartes.some((c) => c.slice(1).some(Boolean));
  return [
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({ text: set.nom, bold: true, size: 32, color: NAVY, font: "Arial" })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({
        text: `${set.cartes.length} cartes · ${pages} planche${pages > 1 ? "s" : ""}` +
          (aVerso ? " recto-verso — imprimer en retournement sur le bord long" : " (recto seul)") +
          ` · ${exemplaires} exemplaire${exemplaires > 1 ? "s" : ""} à imprimer`,
        size: 19, color: "555555", font: "Arial",
      })],
    }),
  ];
}

/**
 * Assemble les planches à découper d'une journée.
 * `exemplaires` : nombre de jeux à imprimer, un par sous-groupe en principe.
 */
export async function cardsToDocx(
  sets: CardSet[],
  titre: string,
  exemplaires = 3,
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: titre, bold: true, size: 26, color: NAVY, font: "Arial" })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 6 } },
      children: [new TextRun({
        text: "Planches à découper — les traits pointillés sont les lignes de coupe.",
        size: 18, color: "555555", font: "Arial",
      })],
    }),
  ];

  sets.forEach((set, i) => {
    if (i > 0) children.push(saut());
    children.push(...garde(set, exemplaires));
    // La garde tient sa page : chaque planche démarre ainsi en haut de feuille,
    // seule façon d'y loger les trois rangées.
    children.push(saut());
    children.push(...planches(set));
  });

  const doc = new Document({
    creator: "FormAssist",
    title: titre,
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGE, right: MARGE, bottom: MARGE, left: MARGE },
        },
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
