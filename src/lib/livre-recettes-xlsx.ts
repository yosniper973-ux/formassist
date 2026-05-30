/**
 * Génération du Livre des recettes en XLSX fidèle au template officiel.
 * Utilise exceljs pour la mise en forme complète (couleurs, bordures, fusions).
 */

import ExcelJS from "exceljs";
import type { LivreRecetteRow } from "./db";
import type { ProfessionalInfo } from "@/types/invoice";

// ─── Palette de couleurs (identique au template) ──────────────────────────
const NAVY  = "1F4E78";   // entêtes, labels
const WHITE = "FFFFFFFF"; // texte sur fond marine
const BLUE  = "FF0000FF"; // données saisies utilisateur
const LGREY = "FFF2F2F2"; // lignes paires alternées
const LGREEN = "FFE2EFDA"; // ligne total
const GREY  = "FF595959"; // texte secondaire (notes, subtitles)
const BLACK = "FF000000";

type ARGB = string;

function fill(argb: ARGB): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function border(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = "thin";
  return { top: { style: s }, bottom: { style: s }, left: { style: s }, right: { style: s } };
}

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = border();
}

// ─── Formatage monétaire ──────────────────────────────────────────────────
function fmtEuro(v: number): string {
  return v.toFixed(2).replace(".", ",") + " €";
}

// ─── Feuille 1 — Livre des recettes ──────────────────────────────────────
function buildSheetRecettes(
  ws: ExcelJS.Worksheet,
  year: number,
  entries: LivreRecetteRow[],
  proInfo: ProfessionalInfo,
) {
  // Largeurs de colonnes (A→G)
  ws.columns = [
    { key: "A", width: 6 },
    { key: "B", width: 16 },
    { key: "C", width: 14 },
    { key: "D", width: 26 },
    { key: "E", width: 38 },
    { key: "F", width: 16 },
    { key: "G", width: 14 },
  ];

  // ── Ligne 1-2 : Titre principal ─────────────────────────────────────────
  ws.mergeCells("A1:G2");
  const titleCell = ws.getCell("A1");
  titleCell.value = "LIVRE DES RECETTES";
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: WHITE } };
  titleCell.fill = fill(NAVY);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;

  // ── Ligne 3 : Sous-titre ─────────────────────────────────────────────────
  ws.mergeCells("A3:G3");
  const subCell = ws.getCell("A3");
  subCell.value = "Micro-entrepreneur — Formatrice indépendante (prestations de formation)";
  subCell.font = { name: "Arial", size: 10, italic: true, color: { argb: GREY } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };

  // ── Ligne 4 : séparateur vide ─────────────────────────────────────────────
  ws.getRow(4).height = 8;

  // ── Lignes 5-10 : Infos identité ─────────────────────────────────────────
  const identityRows: [string, string][] = [
    ["Nom / Prénom :", proInfo.full_name ?? ""],
    ["Nom commercial :", ""],
    ["N° SIRET :", proInfo.siret ?? ""],
    ["Activité :", "Formation professionnelle"],
    ["Année :", String(year)],
    ["Régime :", "Micro-BNC — Franchise en base de TVA (art. 293 B du CGI)"],
  ];

  identityRows.forEach(([label, value], i) => {
    const rowNum = 5 + i;
    const labelCell = ws.getCell(`A${rowNum}`);
    labelCell.value = label;
    labelCell.font = { name: "Arial", size: 10, bold: true, color: { argb: NAVY.replace("#", "") } };

    ws.mergeCells(`B${rowNum}:D${rowNum}`);
    const valueCell = ws.getCell(`B${rowNum}`);
    valueCell.value = value;
    valueCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };
    valueCell.alignment = { horizontal: "left" };
  });

  // ── Ligne 11 : séparateur vide ────────────────────────────────────────────
  ws.getRow(11).height = 8;

  // ── Ligne 12 : En-têtes de colonnes ──────────────────────────────────────
  const headers = ["N°", "Date\nd'encaissement", "N° de facture", "Client", "Désignation de la prestation", "Montant\nencaissé (€)", "Mode de\nrèglement"];
  ws.getRow(12).height = 32;
  ["A", "B", "C", "D", "E", "F", "G"].forEach((col, idx) => {
    const cell = ws.getCell(`${col}12`);
    cell.value = headers[idx];
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = fill(NAVY);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(cell);
  });

  // ── Lignes 13-72 : données (60 lignes max) ────────────────────────────────
  for (let i = 0; i < 60; i++) {
    const rowNum = 13 + i;
    const entry = entries[i];
    const isEven = i % 2 === 1;
    const bgArgb = isEven ? LGREY : "FFFFFFFF";
    const row = ws.getRow(rowNum);
    row.height = 15;

    const cols = ["A", "B", "C", "D", "E", "F", "G"];
    cols.forEach((col) => {
      const cell = ws.getCell(`${col}${rowNum}`);
      cell.fill = fill(bgArgb);
      applyBorder(cell);
    });

    if (entry) {
      // N°
      const numCell = ws.getCell(`A${rowNum}`);
      numCell.value = entry.numero;
      numCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };
      numCell.alignment = { horizontal: "center" };

      // Date
      const dateCell = ws.getCell(`B${rowNum}`);
      // Formater la date YYYY-MM-DD → DD/MM/YYYY
      const [y, m, d] = entry.date_encaissement.split("-");
      dateCell.value = `${d}/${m}/${y}`;
      dateCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };
      dateCell.alignment = { horizontal: "center" };

      // N° facture
      const facCell = ws.getCell(`C${rowNum}`);
      facCell.value = entry.numero_facture;
      facCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };

      // Client
      const clientCell = ws.getCell(`D${rowNum}`);
      clientCell.value = entry.client;
      clientCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };

      // Désignation
      const desCell = ws.getCell(`E${rowNum}`);
      desCell.value = entry.designation;
      desCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };

      // Montant
      const montantCell = ws.getCell(`F${rowNum}`);
      montantCell.value = entry.montant_ttc;
      montantCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };
      montantCell.numFmt = '#,##0.00" €"';
      montantCell.alignment = { horizontal: "right" };

      // Mode
      const modeCell = ws.getCell(`G${rowNum}`);
      modeCell.value = entry.mode_reglement;
      modeCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF", "") } };
    } else {
      // Cellule vide — police neutre
      cols.forEach((col) => {
        ws.getCell(`${col}${rowNum}`).font = { name: "Arial", size: 10 };
      });
    }
  }

  // ── Ligne 73 : Total ──────────────────────────────────────────────────────
  ws.mergeCells("A73:E73");
  const totalLabel = ws.getCell("A73");
  totalLabel.value = "TOTAL ENCAISSÉ";
  totalLabel.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY.replace("#","") } };
  totalLabel.fill = fill(LGREEN);
  totalLabel.alignment = { horizontal: "right", vertical: "middle" };
  applyBorder(totalLabel);

  const totalCell = ws.getCell("F73");
  totalCell.value = { formula: "SUM(F13:F72)" };
  totalCell.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY.replace("#","") } };
  totalCell.fill = fill(LGREEN);
  totalCell.numFmt = '#,##0.00" €"';
  totalCell.alignment = { horizontal: "right" };
  applyBorder(totalCell);

  const totalG = ws.getCell("G73");
  totalG.fill = fill(LGREEN);
  applyBorder(totalG);

  // ── Ligne 74 : vide ───────────────────────────────────────────────────────
  ws.getRow(74).height = 8;

  // ── Ligne 75 : Note légale ────────────────────────────────────────────────
  ws.mergeCells("A75:G75");
  ws.getRow(75).height = 42;
  const noteCell = ws.getCell("A75");
  noteCell.value =
    "Rappels : enregistrer chaque encaissement par ordre chronologique (date du paiement reçu, pas de la facture). " +
    "Numérotation continue, sans rature ni blanc. Un paiement en plusieurs fois = plusieurs lignes. À conserver 10 ans.";
  noteCell.font = { name: "Arial", size: 9, italic: true, color: { argb: GREY } };
  noteCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
}

// ─── Feuille 2 — Synthèse mensuelle ──────────────────────────────────────
function buildSheetSynthese(
  ws: ExcelJS.Worksheet,
  year: number,
  entries: LivreRecetteRow[],
) {
  ws.columns = [
    { key: "A", width: 24 },
    { key: "B", width: 20 },
    { key: "C", width: 20 },
  ];

  // ── Lignes 1-2 : Titre ────────────────────────────────────────────────────
  ws.mergeCells("A1:C2");
  const titleCell = ws.getCell("A1");
  titleCell.value = `SYNTHÈSE MENSUELLE ${year}`;
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: WHITE } };
  titleCell.fill = fill(NAVY);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;

  // ── Ligne 3 : Sous-titre ──────────────────────────────────────────────────
  ws.mergeCells("A3:C3");
  const subCell = ws.getCell("A3");
  subCell.value = "Pour préparer la déclaration de CA à l'URSSAF";
  subCell.font = { name: "Arial", size: 10, italic: true, color: { argb: GREY } };
  subCell.alignment = { horizontal: "center" };

  ws.getRow(4).height = 8;

  // ── Ligne 5 : En-têtes ────────────────────────────────────────────────────
  ws.getRow(5).height = 24;
  ([ ["A5", "Mois"], ["B5", "CA encaissé (€)"], ["C5", "Cumul annuel (€)"] ] as [string, string][]).forEach(([addr, label]) => {
    const cell = ws.getCell(addr);
    cell.value = label;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = fill(NAVY);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    applyBorder(cell);
  });

  // Calcul du CA par mois depuis les entrées
  const monthlyCA = new Array<number>(12).fill(0) as number[];
  for (const e of entries) {
    const parts = e.date_encaissement.split("-");
    const monthPart = parts.length > 1 ? parts[1] : "0";
    const m = parseInt(monthPart!, 10) - 1;
    if (m >= 0 && m < 12) monthlyCA[m] = (monthlyCA[m] ?? 0) + e.montant_ttc;
  }

  const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  for (let i = 0; i < 12; i++) {
    const rowNum = 6 + i;
    const isEven = i % 2 === 1;
    const bg = isEven ? LGREY : "FFFFFFFF";
    ws.getRow(rowNum).height = 15;

    const moisCell = ws.getCell(`A${rowNum}`);
    moisCell.value = MOIS[i];
    moisCell.font = { name: "Arial", size: 10 };
    moisCell.fill = fill(bg);
    applyBorder(moisCell);

    const caCell = ws.getCell(`B${rowNum}`);
    caCell.value = monthlyCA[i];
    caCell.font = { name: "Arial", size: 10, color: { argb: BLUE.replace("FF","") } };
    caCell.fill = fill(bg);
    caCell.numFmt = '#,##0.00" €"';
    caCell.alignment = { horizontal: "right" };
    applyBorder(caCell);

    const cumulCell = ws.getCell(`C${rowNum}`);
    if (i === 0) {
      cumulCell.value = { formula: "B6" };
    } else {
      cumulCell.value = { formula: `C${rowNum - 1}+B${rowNum}` };
    }
    cumulCell.font = { name: "Arial", size: 10, color: { argb: BLACK } };
    cumulCell.fill = fill(bg);
    cumulCell.numFmt = '#,##0.00" €"';
    cumulCell.alignment = { horizontal: "right" };
    applyBorder(cumulCell);
  }

  // ── Ligne 18 : Total annuel ───────────────────────────────────────────────
  const totA = ws.getCell("A18");
  totA.value = "TOTAL ANNUEL";
  totA.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY.replace("#","") } };
  totA.fill = fill(LGREEN);
  totA.alignment = { horizontal: "right" };
  applyBorder(totA);

  const totB = ws.getCell("B18");
  totB.value = { formula: "SUM(B6:B17)" };
  totB.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY.replace("#","") } };
  totB.fill = fill(LGREEN);
  totB.numFmt = '#,##0.00" €"';
  totB.alignment = { horizontal: "right" };
  applyBorder(totB);

  const totC = ws.getCell("C18");
  totC.fill = fill(LGREEN);
  applyBorder(totC);

  ws.getRow(19).height = 8;

  // ── Lignes 20-21 : Seuils réglementaires ─────────────────────────────────
  const seuilData: [string, string, string][] = [
    ["A20", "Seuil micro-BNC :", "77 700 € (seuil de chiffre d'affaires)"],
    ["A21", "Seuil franchise TVA :", "37 500 € (au-delà : TVA applicable)"],
  ];
  seuilData.forEach(([_addr, label, val], i) => {
    const rn = 20 + i;
    const la = ws.getCell(`A${rn}`);
    la.value = label;
    la.font = { name: "Arial", size: 10, bold: true, color: { argb: NAVY.replace("#","") } };

    ws.mergeCells(`B${rn}:C${rn}`);
    const va = ws.getCell(`B${rn}`);
    va.value = val;
    va.font = { name: "Arial", size: 10 };
  });

  ws.getRow(22).height = 8;

  // ── Ligne 23 : Note légale ────────────────────────────────────────────────
  ws.mergeCells("A23:C23");
  ws.getRow(23).height = 42;
  const noteCell = ws.getCell("A23");
  noteCell.value =
    "À vérifier chaque année : les seuils de CA et de franchise de TVA sont révisés régulièrement. " +
    "Confirmez les montants en vigueur sur autoentrepreneur.urssaf.fr ou impots.gouv.fr.";
  noteCell.font = { name: "Arial", size: 9, italic: true, color: { argb: GREY } };
  noteCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
}

// ─── Export public ────────────────────────────────────────────────────────

/**
 * Génère le XLSX et le sauvegarde dans le dossier Téléchargements.
 * Retourne le chemin du fichier sauvegardé.
 */
export async function exportLivreRecettesXlsx(
  year: number,
  entries: LivreRecetteRow[],
  proInfo: ProfessionalInfo,
): Promise<string> {
  const ExcelJSModule = await import("exceljs");
  const workbook = new ExcelJSModule.default.Workbook();
  workbook.creator = "FormAssist";
  workbook.created = new Date();

  const ws1 = workbook.addWorksheet("Livre des recettes");
  buildSheetRecettes(ws1, year, entries, proInfo);

  const ws2 = workbook.addWorksheet("Synthèse mensuelle");
  buildSheetSynthese(ws2, year, entries);

  // Générer le buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const uint8 = new Uint8Array(buffer as ArrayBuffer);

  // Sauvegarder via Tauri FS
  const { downloadDir, join } = await import("@tauri-apps/api/path");
  const { writeFile } = await import("@tauri-apps/plugin-fs");

  const dir = await downloadDir();
  const filename = `Livre_des_recettes_${year}.xlsx`;
  const target = await join(dir, filename);

  await writeFile(target, uint8);
  return target;
}

/**
 * Formate un montant en chaîne lisible pour l'affichage dans l'app.
 */
export function formatMontant(v: number): string {
  return fmtEuro(v);
}
