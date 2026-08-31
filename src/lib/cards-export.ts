import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import React from "react";
import { decodeHtmlEntities } from "./utils";

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
        sets.push(normalise({ nom: nomCourant || "Cartes", colonnes, cartes }));
      }
      nomCourant = "";
      i = j - 1;
    }
  }
  return sets;
}

const REF_RE = /^(r[ée]f\.?|n°|no\.?|num[ée]ro?|id|code)$/i;
const RECTO_RE = /recto|terme|carte|intitul[ée]|mot|question|face/i;

/**
 * Remet les colonnes dans l'ordre attendu : recto d'abord, verso ensuite.
 * Les tableaux générés commencent souvent par une colonne de référence
 * (« Réf. », « A1 ») qui ne doit pas devenir le recto de la carte, et la
 * colonne du recto n'est pas toujours la première.
 */
function normalise(set: CardSet): CardSet {
  const idx = set.colonnes.map((_, i) => i);
  const utiles = idx.filter((i) => !REF_RE.test(set.colonnes[i]?.trim() ?? ""));
  if (utiles.length === 0) return set;

  let rectoIdx = utiles.find((i) => RECTO_RE.test(set.colonnes[i] ?? ""));
  if (rectoIdx === undefined) rectoIdx = utiles[0]!;
  const versoIdx = utiles.filter((i) => i !== rectoIdx);
  const ordre = [rectoIdx, ...versoIdx];

  return {
    nom: set.nom,
    colonnes: ordre.map((i) => set.colonnes[i] ?? ""),
    cartes: set.cartes.map((c) => ordre.map((i) => c[i] ?? "")),
  };
}

// A4 : 595 × 842 pt. Neuf cartes par page, au format d'une carte à jouer.
// Le PDF plutôt que le Word : Pages ignore l'alignement des paragraphes issus
// de docx, mesuré sur rendu — le texte des cartes revenait à gauche. En PDF la
// mise en page est maîtrisée au point près, et une carte à découper ne s'édite
// pas, elle s'imprime.
const COLS = 3, ROWS = 3, PAR_PAGE = COLS * ROWS;
const TEINTES = ["1A3C5E", "0E6B63", "9A5F16", "7E4468", "3F6B2B", "A8402F"];

const st = StyleSheet.create({
  page: { padding: 18, fontFamily: "Helvetica", backgroundColor: "#FFFFFF" },
  grille: { flexDirection: "row", flexWrap: "wrap" },
  carte: {
    width: `${100 / COLS}%`,
    height: 802 / ROWS,
    // Ligne de coupe : les tirets de react-pdf grandissent avec l'épaisseur du
    // trait. À 0,5 pt en gris clair ils étaient invisibles à l'impression.
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#8C8C8C",
    justifyContent: "flex-start",
  },
  bandeau: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bandeauTexte: { fontSize: 5.5, color: "#FFFFFF", letterSpacing: 0.6 },
  corps: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8 },
  recto: { fontSize: 12, textAlign: "center", fontFamily: "Helvetica-Bold" },
  etiquette: {
    fontSize: 5.5, color: "#9A9A9A", textAlign: "center",
    letterSpacing: 0.5, marginBottom: 2, marginTop: 5,
  },
  verso: { fontSize: 8, textAlign: "center", lineHeight: 1.45, color: "#22282B" },
  gardeTitre: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  gardeInfo: { fontSize: 9, color: "#666666", marginBottom: 2 },
  entete: { fontSize: 8, color: "#888888", marginBottom: 14 },
});

const e = React.createElement;

/** Coupe un nom trop long sur un mot entier, plutôt qu'en plein milieu. */
function abrege(t: string, max: number): string {
  if (t.length <= max) return t;
  const court = t.slice(0, max);
  const esp = court.lastIndexOf(" ");
  return (esp > max * 0.6 ? court.slice(0, esp) : court) + "…";
}

function Carte({ set, teinte, item, idx, face }: {
  set: CardSet; teinte: string; item?: string[]; idx: number; face: boolean;
}) {
  if (!item) return e(View, { style: { ...st.carte, borderColor: "#D0D0D0" } });

  const contenu = face
    ? item.slice(1).flatMap((v, k) =>
        v
          ? [
              ...(set.colonnes.length > 2
                ? [e(Text, { key: `l${k}`, style: st.etiquette }, (set.colonnes[k + 1] ?? "").toUpperCase())]
                : []),
              e(Text, { key: `v${k}`, style: st.verso }, v),
            ]
          : [],
      )
    : [e(Text, { key: "r", style: { ...st.recto, color: `#${teinte}` } }, item[0] ?? "")];

  return e(View, { style: st.carte }, [
    e(View, { key: "b", style: { ...st.bandeau, backgroundColor: `#${teinte}` } }, [
      e(Text, { key: "n", style: st.bandeauTexte }, abrege(set.nom.toUpperCase(), 30)),
      e(Text, { key: "c", style: st.bandeauTexte }, `${idx}/${set.cartes.length}`),
    ]),
    e(View, { key: "c", style: st.corps }, contenu),
  ]);
}

function Planche({ set, teinte, debut, face }: {
  set: CardSet; teinte: string; debut: number; face: boolean;
}) {
  const lot = set.cartes.slice(debut, debut + PAR_PAGE);
  const cases = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // Verso : colonnes inversées, pour que le recto-verso avec retournement
      // sur le bord long fasse coïncider les deux faces.
      const col = face ? COLS - 1 - c : c;
      const i = r * COLS + col;
      cases.push(
        e(Carte, { key: `${r}-${c}`, set, teinte, item: lot[i], idx: debut + i + 1, face }),
      );
    }
  }
  return e(Page, { size: "A4", style: st.page }, e(View, { style: st.grille }, cases));
}

/**
 * Assemble les planches à découper d'une journée.
 * `exemplaires` : nombre de jeux à imprimer, un par sous-groupe en principe.
 */
export async function cardsToPdf(
  sets: CardSet[],
  titre: string,
  exemplaires = 3,
): Promise<Blob> {
  const pages: React.ReactElement[] = [];

  sets.forEach((set, i) => {
    const teinte = TEINTES[i % TEINTES.length]!;
    const aVerso = set.colonnes.length > 1 && set.cartes.some((c) => c.slice(1).some(Boolean));
    const nbPlanches = Math.ceil(set.cartes.length / PAR_PAGE);

    pages.push(
      e(Page, { key: `g${i}`, size: "A4", style: st.page }, [
        e(Text, { key: "t", style: st.entete }, titre),
        e(Text, { key: "n", style: { ...st.gardeTitre, color: `#${teinte}` } }, set.nom),
        e(Text, { key: "i1", style: st.gardeInfo },
          `${set.cartes.length} cartes · ${nbPlanches} planche${nbPlanches > 1 ? "s" : ""} · ` +
          `${exemplaires} exemplaire${exemplaires > 1 ? "s" : ""} à imprimer`),
        e(Text, { key: "i2", style: st.gardeInfo },
          aVerso
            ? "Recto-verso — impression avec retournement sur le bord long."
            : "Recto seul."),
        e(Text, { key: "i3", style: st.gardeInfo },
          "Les traits pointillés sont les lignes de coupe."),
      ]),
    );

    for (let d = 0; d < set.cartes.length; d += PAR_PAGE) {
      pages.push(e(Planche, { key: `r${i}-${d}`, set, teinte, debut: d, face: false }));
      if (aVerso) pages.push(e(Planche, { key: `v${i}-${d}`, set, teinte, debut: d, face: true }));
    }
  });

  const doc = e(Document, { title: titre }, pages) as React.ReactElement<
    React.ComponentProps<typeof Document>
  >;
  return pdf(doc).toBlob();
}
