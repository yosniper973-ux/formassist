import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  PageOrientation,
  TableLayoutType,
} from "docx";

// Largeurs de colonnes FIXES en twips (A4 paysage 16838 − marges 2×720 = 15398).
// Les largeurs en pourcentage ne sont pas respectées par Word → colonnes
// effondrées (texte empilé verticalement). On impose donc des DXA fixes.
const META_COL_WIDTHS = [5389, 10009]; // 35% / 65%
//                        Phases Obj.  Contenu Méth. Outils Éval.
const PHASE_COL_WIDTHS = [2464, 2772, 3388, 1848, 2156, 2770];
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { invoke } from "@tauri-apps/api/core";
import { downloadDocx } from "@/lib/docx-export";
import { fillTemplateWithAI, fillTemplateByStructure, templateHasPlaceholders } from "./ai-fill-template";
import type { DeroulementDraft } from "./types";

function bulletLines(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-•·●◦]+/, "").trim())
    .filter(Boolean);
}

function para(text: string, bold = false, size = 20): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold, size })],
  });
}

/** Une ligne = un paragraphe en texte simple (sans puce ni tiret). */
function lineParas(raw: string): Paragraph[] {
  const lines = bulletLines(raw);
  if (lines.length === 0) return [para("", false, 20)];
  return lines.map((t) => para(t, false, 20));
}

/**
 * Rendu du champ « Contenu » structuré en Savoirs / Savoir-faire / Savoir-être :
 * - les lignes qui se terminent par ":" (sous-titres) restent en texte gras,
 * - les autres lignes sont du texte simple (sans puce ni tiret).
 */
function contenuParas(raw: string): Paragraph[] {
  if (!raw?.trim()) return [para("", false, 20)];
  const out: Paragraph[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/:$/.test(line)) {
      out.push(para(line, true, 20));
    } else {
      out.push(para(line.replace(/^[\s\-•·●◦]+/, "").trim(), false, 20));
    }
  }
  return out.length > 0 ? out : [para("", false, 20)];
}

/** Construction d'un docx "FormAssist" par défaut (pas de template utilisateur) */
async function buildDefaultDocx(data: DeroulementDraft): Promise<Blob> {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  const headerTitle = new Paragraph({
    alignment: AlignmentType.CENTER,
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: "FICHE DE DEROULEMENT DE SEANCE DE FORMATION", bold: true, size: 28 })],
  });

  const metaLine = new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [
      new TextRun({ text: "FORMATION : ", bold: true }),
      new TextRun({ text: data.formation_title }),
      new TextRun({ text: "     DATE : ", bold: true }),
      new TextRun({ text: data.dates_label }),
      new TextRun({ text: "     REDACTEUR : ", bold: true }),
      new TextRun({ text: data.redacteur }),
    ],
  });

  const titleLine = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 200 },
    children: [new TextRun({ text: `TITRE DE LA SEANCE : ${data.titre_seance}`, bold: true, size: 24 })],
  });

  // En-tête méta (dates + objectif général) — commun à toutes les tables
  const headerMetaRow = new TableRow({
    children: [
      new TableCell({
        width: { size: META_COL_WIDTHS[0]!, type: WidthType.DXA },
        children: [
          para("Date et durée d'intervention :", true),
          para(`${data.dates_label} — Durée totale : ${data.total_duration_hours} h`),
        ],
      }),
      new TableCell({
        width: { size: META_COL_WIDTHS[1]!, type: WidthType.DXA },
        children: [para("Objectif GENERAL :", true), para(data.objectif_general || "")],
      }),
    ],
  });

  function colHeader(): TableRow {
    const labels = [
      "Phases", "Objectifs opérationnels\n(compétences attendues)",
      "Contenu", "Méthodes pédagogiques (1)",
      "Outils et techniques (2)", "Evaluation prévue",
    ];
    return new TableRow({
      tableHeader: true,
      children: labels.map((label, i) =>
        new TableCell({
          width: { size: PHASE_COL_WIDTHS[i]!, type: WidthType.DXA },
          shading: { fill: "E8EAF6" },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, size: 18 })] })],
        }),
      ),
    });
  }

  function phaseRow(phase: (typeof data.phases)[number], idx: number): TableRow {
    // Colonne « Phases » : intitulé + Activité formateur + Activité apprenants
    const phaseCellChildren: Paragraph[] = [
      para(`Phase ${idx + 1}${phase.is_ecf ? " (ECF)" : ""} : ${phase.duree_heures} h`, true),
      para(phase.intitule, true),
    ];
    if (phase.activite_formateur?.trim()) {
      phaseCellChildren.push(para("Activité FORMATEUR :", true, 18));
      phaseCellChildren.push(...lineParas(phase.activite_formateur));
    }
    if (phase.activite_apprenants?.trim()) {
      phaseCellChildren.push(para("Activité APPRENANTS :", true, 18));
      phaseCellChildren.push(...lineParas(phase.activite_apprenants));
    }

    // Contenu : conserve les sous-titres Savoirs/Savoir-faire/Savoir-être en
    // texte (les lignes se terminant par ":" ne sont pas mises en puce).
    const contenuChildren = contenuParas(phase.contenu);

    return new TableRow({
      children: [
        new TableCell({ width: { size: PHASE_COL_WIDTHS[0]!, type: WidthType.DXA }, children: phaseCellChildren }),
        new TableCell({ width: { size: PHASE_COL_WIDTHS[1]!, type: WidthType.DXA }, children: lineParas(phase.objectifs_operationnels) }),
        new TableCell({ width: { size: PHASE_COL_WIDTHS[2]!, type: WidthType.DXA }, children: contenuChildren }),
        new TableCell({ width: { size: PHASE_COL_WIDTHS[3]!, type: WidthType.DXA }, children: lineParas(phase.methodes) }),
        new TableCell({ width: { size: PHASE_COL_WIDTHS[4]!, type: WidthType.DXA }, children: lineParas(phase.outils) }),
        new TableCell({ width: { size: PHASE_COL_WIDTHS[5]!, type: WidthType.DXA }, children: lineParas(phase.evaluation) }),
      ],
    });
  }

  // Grouper les phases par compétence (dans l'ordre d'apparition)
  const groups = new Map<string, { code: string; phases: typeof data.phases }>();
  const groupOrder: string[] = [];
  for (const phase of data.phases) {
    if (!groups.has(phase.competence_id)) {
      groups.set(phase.competence_id, { code: phase.code, phases: [] });
      groupOrder.push(phase.competence_id);
    }
    groups.get(phase.competence_id)!.phases.push(phase);
  }

  const multipleGroups = groupOrder.length > 1;
  const docChildren: Array<Paragraph | Table> = [headerTitle, metaLine, titleLine];

  // En-tête méta une seule fois en haut (dates + objectif général)
  docChildren.push(new Table({
    width: { size: 15398, type: WidthType.DXA },
    columnWidths: META_COL_WIDTHS,
    layout: TableLayoutType.FIXED,
    rows: [headerMetaRow],
    borders,
  }));

  for (let i = 0; i < groupOrder.length; i++) {
    const cid = groupOrder[i]!;
    const group = groups.get(cid)!;

    // Titre de la compétence si plusieurs groupes
    if (multipleGroups) {
      docChildren.push(new Paragraph({
        spacing: { before: 300, after: 80 },
        children: [new TextRun({ text: `Compétence : ${group.code}`, bold: true, size: 22 })],
      }));
    }

    // Table de déroulement pour cette compétence
    docChildren.push(new Table({
      width: { size: 15398, type: WidthType.DXA },
      columnWidths: PHASE_COL_WIDTHS,
      layout: TableLayoutType.FIXED,
      rows: [colHeader(), ...group.phases.map((p, idx) => phaseRow(p, idx))],
      borders,
    }));

    if (i < groupOrder.length - 1) {
      docChildren.push(new Paragraph({ spacing: { before: 200 } }));
    }
  }

  docChildren.push(
    new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: "(1) Méthodes pédagogiques : Active, Interrogative, Expositive, Transmissive, Participative, Évaluative, Interactive.", size: 16, italics: true })],
    }),
    new Paragraph({
      children: [new TextRun({ text: "(2) Outils et techniques : Travail en groupe, étude de cas, questionnaire, questions orales, diaporama, animation-information descendante, etc.", size: 16, italics: true })],
    }),
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          // A4 paysage (29,7 × 21 cm) — indispensable pour un tableau à 6 colonnes lisible.
          // La lib docx swappe width/height quand orientation = LANDSCAPE : on passe
          // donc les dimensions portrait pour obtenir w=16838 h=11906 en sortie.
          size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: docChildren,
    }],
  });

  return Packer.toBlob(doc);
}

/** Remplit un template utilisateur via docxtemplater */
async function fillUserTemplate(
  templatePath: string,
  data: DeroulementDraft,
): Promise<Blob> {
  const bytes = await invoke<number[]>("read_file_bytes", { path: templatePath });
  const zip = new PizZip(new Uint8Array(bytes));
  const templater = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Grouper les phases par compétence pour le template
  const compGroups = new Map<string, { code: string; phases: typeof data.phases }>();
  const compOrder: string[] = [];
  for (const phase of data.phases) {
    if (!compGroups.has(phase.competence_id)) {
      compGroups.set(phase.competence_id, { code: phase.code, phases: [] });
      compOrder.push(phase.competence_id);
    }
    compGroups.get(phase.competence_id)!.phases.push(phase);
  }

  const payload = {
    formation: data.formation_title,
    dates: data.dates_label,
    duree_totale: `${data.total_duration_hours} h`,
    redacteur: data.redacteur,
    titre_seance: data.titre_seance,
    objectif_general: data.objectif_general,
    // Rétrocompatibilité : phases à plat (anciens templates)
    phases: data.phases.map((p, idx) => ({
      numero: `${idx + 1}${p.is_ecf ? " (ECF)" : ""}`,
      duree: `${p.duree_heures} h`,
      intitule: p.intitule,
      objectifs_operationnels: p.objectifs_operationnels,
      contenu: p.contenu,
      activite_formateur: p.activite_formateur,
      activite_apprenants: p.activite_apprenants,
      methodes: p.methodes,
      outils: p.outils,
      evaluation: p.evaluation,
    })),
    // Nouveau : phases groupées par compétence — {#competences}...{/competences}
    competences: compOrder.map((cid) => {
      const g = compGroups.get(cid)!;
      return {
        code: g.code,
        phases: g.phases.map((p, i) => ({
          numero: `${i + 1}${p.is_ecf ? " (ECF)" : ""}`,
          duree: `${p.duree_heures} h`,
          intitule: p.intitule,
          objectifs_operationnels: p.objectifs_operationnels,
          contenu: p.contenu,
          activite_formateur: p.activite_formateur,
          activite_apprenants: p.activite_apprenants,
          methodes: p.methodes,
          outils: p.outils,
          evaluation: p.evaluation,
        })),
      };
    }),
  };

  templater.render(payload);
  const out = templater.getZip().generate({ type: "blob" });
  return out as Blob;
}

/** Génère et télécharge la fiche de déroulement en .docx
 *
 * Stratégie :
 * 1. Pas de template → format FormAssist par défaut.
 * 2. Template avec balises {formation}, {phases}... → docxtemplater (rapide, fiable).
 * 3. Template sans balises → Claude analyse les cellules et remplit
 *    intelligemment en préservant la mise en forme (police, couleurs, tableaux).
 */
/**
 * Résout le blob DOCX selon la stratégie :
 *  1. Pas de template → modèle FormAssist par défaut.
 *  2. Template avec balises {…} → docxtemplater (déterministe).
 *  3. Template tabulaire (lignes de phase détectées) → remplissage DÉTERMINISTE
 *     par structure (placement par colonne + n° de phase, sans IA, gratuit).
 *  4. Template irrégulier (aucune ligne de phase) → repli sur le remplissage IA.
 */
async function resolveTemplateBlob(
  templatePath: string | null,
  draft: DeroulementDraft,
): Promise<Blob> {
  if (!templatePath) return buildDefaultDocx(draft);

  if (await templateHasPlaceholders(templatePath)) {
    return fillUserTemplate(templatePath, draft);
  }

  // Placement déterministe par structure (cas courant : trame tabulaire).
  const structured = await fillTemplateByStructure(templatePath, draft);
  if (structured.filled) return structured.blob;

  // Repli : template sans structure de phase reconnaissable → IA.
  const result = await fillTemplateWithAI(templatePath, draft);
  return result.blob;
}

export async function exportDeroulementDocx(params: {
  draft: DeroulementDraft;
  templatePath: string | null;
  fileName: string;
}): Promise<string | null> {
  const blob = await resolveTemplateBlob(params.templatePath, params.draft);
  return downloadDocx(blob, params.fileName);
}

/** Comme exportDeroulementDocx, mais renvoie aussi le blob pour conversion PDF. */
export async function generateDeroulementBlob(params: {
  draft: DeroulementDraft;
  templatePath: string | null;
}): Promise<Blob> {
  return resolveTemplateBlob(params.templatePath, params.draft);
}
