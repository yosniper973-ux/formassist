import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  LevelFormat,
  ExternalHyperlink,
} from "docx";

/**
 * Exporte un document pédagogique Markdown en fichier .docx stylisé
 * (Arial, bandeau bleu marine, sections colorées, tableaux, encadrés).
 *
 * Renvoie un Blob prêt à être téléchargé.
 */
export async function markdownToDocx(markdown: string): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      children.push(hrParagraph());
      i++;
      continue;
    }

    // Headings
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { children.push(h1Paragraph(h1[1]!)); i++; continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { children.push(h2Paragraph(h2[1]!)); i++; continue; }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { children.push(h3Paragraph(h3[1]!)); i++; continue; }

    // Table
    if (line.trim().startsWith("|") && i + 1 < lines.length) {
      const sep = (lines[i + 1] ?? "").trim();
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(sep)) {
        const headers = splitRow(line);
        const aligns = splitRow(sep).map(toAlign);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i]!.trim().startsWith("|")) {
          rows.push(splitRow(lines[i]!));
          i++;
        }
        children.push(buildTable(headers, rows, aligns));
        continue;
      }
    }

    // Callout
    const callout = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/i);
    if (!callout && line.startsWith(">")) {
      if (isMac) {
        children.push(blockquoteParagraph(line.replace(/^>\s?/, "")));
      } else {
        children.push(bodyParagraph(line));
      }
      i++;
      continue;
    }
    if (callout) {
      const kind = callout[1]!.toLowerCase();
      const title = (callout[2] ?? "").trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.startsWith(">")) {
        body.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      children.push(calloutTable(kind, title, body));
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        children.push(bulletParagraph(lines[i]!.replace(/^\s*[-*]\s+/, "")));
        i++;
      }
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        children.push(numberedParagraph(lines[i]!.replace(/^\s*\d+\.\s+/, "")));
        i++;
      }
      continue;
    }

    // Empty line
    if (line.trim() === "") { i++; continue; }

    // Paragraph (merge adjacent)
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.match(/^#{1,3}\s+/) &&
      !lines[i]!.trim().startsWith("|") &&
      !lines[i]!.trim().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!) &&
      !/^---+$/.test(lines[i]!.trim())
    ) {
      para.push(lines[i]!);
      i++;
    }
    children.push(bodyParagraph(para.join(" ")));
  }

  const doc = new Document({
    creator: "FormAssist",
    title: "Document pédagogique",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT },
          ],
        },
        {
          reference: "decimals",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT },
          ],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_PAGE_WIDTH, height: 16838 },
          margin: { top: MARGIN_DXA, right: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

// ============================================================
// Helpers
// ============================================================

const NAVY = "1A3C5E";
const BLUE = "2471A3";

const A4_PAGE_WIDTH = 11906;
const MARGIN_DXA = 1418;
const CONTENT_WIDTH = A4_PAGE_WIDTH - MARGIN_DXA * 2;

// Fix rendu Mac : navigator.platform est déprécié et peut être vide sur macOS récent.
// On utilise userAgent ("Macintosh") qui est toujours fiable. Windows contient "Windows NT".
const isMac = typeof navigator !== "undefined" && /Macintosh|Mac OS X/i.test(navigator.userAgent);

type Run = TextRun | ExternalHyperlink;

function hyperlinkRun(label: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text: label,
        font: "Arial",
        color: "2471A3",
        underline: {},
      }),
    ],
  });
}

function runs(text: string, color?: string): Run[] {
  const parts: Run[] = [];
  // 1) [texte](url)  2) URL nue  3) ***x***  4) **x**  5) *x*  6) `x`
  const regex =
    /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<>]+)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+?)\*|`([^`]+?)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const c = color ? { color } : {};
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(new TextRun({ text: text.slice(last, m.index), font: "Arial", ...c }));
    if (m[3]) parts.push(hyperlinkRun(m[2]!, m[3]!));
    else if (m[4]) parts.push(hyperlinkRun(m[4]!, m[4]!));
    else if (m[5]) parts.push(new TextRun({ text: m[5]!, bold: true, italics: true, font: "Arial", ...c }));
    else if (m[6]) parts.push(new TextRun({ text: m[6]!, bold: true, font: "Arial", ...c }));
    else if (m[7]) parts.push(new TextRun({ text: m[7]!, italics: true, font: "Arial", ...c }));
    else if (m[8]) parts.push(new TextRun({ text: m[8]!, font: "Consolas", ...c }));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(new TextRun({ text: text.slice(last), font: "Arial", ...c }));
  return parts.length === 0 ? [new TextRun({ text, font: "Arial", ...c })] : parts;
}

function h1Paragraph(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.LEFT,
    shading: { type: ShadingType.CLEAR, color: "auto", fill: NAVY },
    spacing: { before: 200, after: 240 },
    children: [
      new TextRun({ text, bold: true, size: 32, color: "FFFFFF", font: "Arial" }),
    ],
  });
}

function h2Paragraph(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 26, color: NAVY, font: "Arial" }),
    ],
  });
}

function h3Paragraph(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 23, color: BLUE, font: "Arial" }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({ spacing: { before: 80, after: 80, line: 300 }, children: runs(text) });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40, line: 280 },
    children: runs(text),
  });
}

function numberedParagraph(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: "decimals", level: 0 },
    spacing: { before: 40, after: 40, line: 280 },
    children: runs(text),
  });
}

function blockquoteParagraph(text: string): Paragraph {
  return new Paragraph({
    indent: { left: 400, hanging: 0 },
    spacing: { before: 40, after: 40, line: 280 },
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: BLUE } },
    children: runs(text),
  });
}

function hrParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "B0BEC5" } },
    children: [new TextRun({ text: "" })],
  });
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

function toAlign(cell: string): "left" | "center" | "right" {
  const c = cell.trim();
  if (c.startsWith(":") && c.endsWith(":")) return "center";
  if (c.endsWith(":")) return "right";
  return "left";
}

function buildTable(headers: string[], rows: string[][], aligns: ("left" | "center" | "right")[]): Table {
  const colCount = Math.max(headers.length, 1);
  const colW = Math.floor(CONTENT_WIDTH / colCount);
  const colWidths = Array.from({ length: colCount }, (_, i) =>
    i === colCount - 1 ? CONTENT_WIDTH - colW * (colCount - 1) : colW,
  );

  const cellWidth = (i: number) => isMac
    ? { size: colWidths[i]!, type: WidthType.DXA }
    : { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: cellWidth(i),
        shading: { type: ShadingType.CLEAR, color: "auto", fill: NAVY },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            alignment: alignmentOf(aligns[i] ?? "left"),
            children: [new TextRun({ text: h, bold: true, color: "FFFFFF", font: "Arial", size: 22 })],
          }),
        ],
      }),
    ),
  });

  const bodyRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          width: cellWidth(ci),
          shading: { type: ShadingType.CLEAR, color: "auto", fill: ri % 2 === 0 ? "FFFFFF" : "EAF2F8" },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              alignment: alignmentOf(aligns[ci] ?? "left"),
              children: runs(cell),
            }),
          ],
        }),
      ),
    }),
  );

  return new Table({
    width: isMac
      ? { size: CONTENT_WIDTH, type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE },
    ...(isMac ? { columnWidths: colWidths } : {}),
    rows: [headerRow, ...bodyRows],
  });
}

const CALLOUT_COLORS: Record<string, { bg: string; border: string; fg: string; label: string }> = {
  info:    { bg: "EAF2F8", border: "2471A3", fg: "1A3C5E", label: "Info" },
  warning: { bg: "FEF5E7", border: "E67E22", fg: "7E4A12", label: "Attention" },
  success: { bg: "E8F8F5", border: "1E8449", fg: "0B4F34", label: "À retenir" },
  danger:  { bg: "FDEDEC", border: "C0392B", fg: "7B1A11", label: "Important" },
  note:    { bg: "F2F3F4", border: "7F8C8D", fg: "2C3E50", label: "Note" },
  tip:     { bg: "F4ECF7", border: "7D3C98", fg: "4A1F5E", label: "Astuce" },
};

function calloutTable(kind: string, title: string, lines: string[]): Table {
  const s = CALLOUT_COLORS[kind] ?? CALLOUT_COLORS.info!;
  const heading = title || s.label;

  const titlePara = new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: heading, bold: true, color: s.fg, font: "Arial", size: 22 })],
  });

  const bodyParas = lines
    .filter((l) => l.trim() !== "")
    .map((ln) =>
      new Paragraph({
        spacing: { before: 30, after: 30, line: 280 },
        children: isMac
          ? runs(ln, s.fg)
          : [new TextRun({ text: ln, color: s.fg, font: "Arial", size: 22 })],
      }),
    );

  return new Table({
    width: isMac
      ? { size: CONTENT_WIDTH, type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE },
    ...(isMac ? { columnWidths: [CONTENT_WIDTH] } : {}),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: isMac
              ? { size: CONTENT_WIDTH, type: WidthType.DXA }
              : { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: s.bg },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "auto" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
              right: { style: BorderStyle.NONE, size: 0, color: "auto" },
              left: { style: BorderStyle.SINGLE, size: 32, color: s.border },
            },
            children: [titlePara, ...bodyParas],
          }),
        ],
      }),
    ],
  });
}

function alignmentOf(a: "left" | "center" | "right"): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === "center") return AlignmentType.CENTER;
  if (a === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

/**
 * Sauvegarde un .docx directement dans le dossier Téléchargements de l'utilisateur
 * (Tauri desktop). Ajoute un suffixe numérique si un fichier du même nom existe déjà.
 * En environnement navigateur, déclenche un téléchargement classique.
 *
 * Retourne le chemin final du fichier sauvegardé (Tauri) ou null (navigateur).
 */
export async function downloadDocx(blob: Blob, filename: string): Promise<string | null> {
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_");
  const finalName = safe.endsWith(".docx") ? safe : `${safe}.docx`;

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    const { downloadDir, join } = await import("@tauri-apps/api/path");
    const { writeFile, exists } = await import("@tauri-apps/plugin-fs");

    const dir = await downloadDir();
    let target = await join(dir, finalName);
    if (await exists(target)) {
      const base = finalName.replace(/\.docx$/i, "");
      for (let i = 2; i < 1000; i++) {
        const candidate = await join(dir, `${base} (${i}).docx`);
        if (!(await exists(candidate))) { target = candidate; break; }
      }
    }

    const buffer = new Uint8Array(await blob.arrayBuffer());
    await writeFile(target, buffer);
    return target;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return null;
}
