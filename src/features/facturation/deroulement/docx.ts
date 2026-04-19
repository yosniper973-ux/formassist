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
} from "docx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { invoke } from "@tauri-apps/api/core";
import { downloadDocx } from "@/lib/docx-export";
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

function bulletParas(raw: string): Paragraph[] {
  const lines = bulletLines(raw);
  if (lines.length === 0) return [para("", false, 20)];
  return lines.map(
    (t) =>
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: t, size: 20 })],
      }),
  );
}

/** Construction d'un docx "FormAssist" par défaut (pas de template utilisateur) */
async function buildDefaultDocx(data: DeroulementDraft): Promise<Blob> {
  const headerTitle = new Paragraph({
    alignment: AlignmentType.CENTER,
    heading: HeadingLevel.HEADING_1,
    children: [
      new TextRun({
        text: "FICHE DE DEROULEMENT DE SEANCE DE FORMATION",
        bold: true,
        size: 28,
      }),
    ],
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
    children: [
      new TextRun({
        text: `TITRE DE LA SEANCE : ${data.titre_seance}`,
        bold: true,
        size: 24,
      }),
    ],
  });

  // En-tête tableau : durée / objectif général
  const headerMetaRow = new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [
          para(`Date et durée d'intervention :`, true),
          para(`${data.dates_label} — Durée totale : ${data.total_duration_hours} h`),
        ],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [para("Objectif GENERAL :", true), para(data.objectif_general || "")],
      }),
    ],
  });

  const colHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      ["Phases", 12],
      ["Objectifs opérationnels\n(compétences attendues)", 18],
      ["Contenu", 22],
      ["Méthodes pédagogiques (1)", 14],
      ["Outils et techniques (2)", 14],
      ["Evaluation prévue", 20],
    ].map(
      ([label, pct]) =>
        new TableCell({
          width: { size: pct as number, type: WidthType.PERCENTAGE },
          shading: { fill: "E8EAF6" },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: label as string, bold: true, size: 18 }),
              ],
            }),
          ],
        }),
    ),
  });

  const phaseRows = data.phases.map(
    (phase, idx) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 12, type: WidthType.PERCENTAGE },
            children: [
              para(
                `Phase ${idx + 1}${phase.is_ecf ? " (ECF)" : ""} : ${phase.duree_heures} h`,
                true,
              ),
              para(phase.intitule),
            ],
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: bulletParas(phase.objectifs_operationnels),
          }),
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: bulletParas(phase.contenu),
          }),
          new TableCell({
            width: { size: 14, type: WidthType.PERCENTAGE },
            children: bulletParas(phase.methodes),
          }),
          new TableCell({
            width: { size: 14, type: WidthType.PERCENTAGE },
            children: bulletParas(phase.outils),
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: bulletParas(phase.evaluation),
          }),
        ],
      }),
  );

  const border = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerMetaRow, colHeaderRow, ...phaseRows],
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  });

  const legend1 = new Paragraph({
    spacing: { before: 200 },
    children: [
      new TextRun({
        text: "(1) Méthodes pédagogiques : Active, Interrogative, Expositive, Transmissive, Participative, Évaluative, Interactive.",
        size: 16,
        italics: true,
      }),
    ],
  });
  const legend2 = new Paragraph({
    children: [
      new TextRun({
        text: "(2) Outils et techniques : Travail en groupe, étude de cas, questionnaire, questions orales, diaporama, animation-information descendante, etc.",
        size: 16,
        italics: true,
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 500, bottom: 500, left: 500, right: 500 } } },
        children: [headerTitle, metaLine, titleLine, table, legend1, legend2],
      },
    ],
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

  const payload = {
    formation: data.formation_title,
    dates: data.dates_label,
    duree_totale: `${data.total_duration_hours} h`,
    redacteur: data.redacteur,
    titre_seance: data.titre_seance,
    objectif_general: data.objectif_general,
    phases: data.phases.map((p, idx) => ({
      numero: `${idx + 1}${p.is_ecf ? " (ECF)" : ""}`,
      duree: `${p.duree_heures} h`,
      intitule: p.intitule,
      objectifs_operationnels: p.objectifs_operationnels,
      contenu: p.contenu,
      methodes: p.methodes,
      outils: p.outils,
      evaluation: p.evaluation,
    })),
  };

  templater.render(payload);
  const out = templater.getZip().generate({ type: "blob" });
  return out as Blob;
}

/** Génère et télécharge la fiche de déroulement en .docx */
export async function exportDeroulementDocx(params: {
  draft: DeroulementDraft;
  templatePath: string | null;
  fileName: string;
}): Promise<string | null> {
  const blob = params.templatePath
    ? await fillUserTemplate(params.templatePath, params.draft)
    : await buildDefaultDocx(params.draft);

  return downloadDocx(blob, params.fileName);
}
