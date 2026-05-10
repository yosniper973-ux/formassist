import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
  Link,
} from "@react-pdf/renderer";
import React from "react";
import { decodeHtmlEntities } from "./utils";

/**
 * Export PDF natif (texte sélectionnable) avec rendu identique sur tout
 * support : PC, Mac, mobile, navigateur, Google Drive. Reproduit le thème
 * FormAssist (bandeau NAVY, sections BLUE, callouts colorés, tableaux zébrés).
 */

const NAVY = "#1A3C5E";
const BLUE = "#2471A3";
const LIGHT_BLUE = "#EAF2F8";
const GRAY_BORDER = "#B0BEC5";

// NotoSans : police Unicode complète — supporte →, ≠, ☐, flèches, etc.
// Fichiers TTF bundlés dans public/fonts/ pour fonctionnement hors-ligne.
Font.register({
  family: "NotoSans",
  fonts: [
    { src: "/fonts/NotoSans-Regular.ttf" },
    { src: "/fonts/NotoSans-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/NotoSans-Italic.ttf", fontStyle: "italic" },
    { src: "/fonts/NotoSans-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
  ],
});

const FONT = "NotoSans";
const FONT_MONO = "Courier";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: FONT,
    fontSize: 11,
    color: "#1F2937",
    lineHeight: 1.45,
  },
  h1: {
    backgroundColor: NAVY,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: FONT,
    fontWeight: "bold",
    padding: 10,
    marginBottom: 12,
    marginTop: 8,
  },
  h2: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: "bold",
    color: NAVY,
    textTransform: "uppercase",
    borderBottomWidth: 1.5,
    borderBottomColor: BLUE,
    paddingBottom: 3,
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: "bold",
    color: BLUE,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginTop: 4,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 2,
    paddingLeft: 8,
  },
  bullet: {
    width: 12,
    fontFamily: FONT,
    fontWeight: "bold",
    color: NAVY,
  },
  listText: { flex: 1 },
  hr: {
    borderBottomWidth: 0.6,
    borderBottomColor: GRAY_BORDER,
    marginVertical: 8,
  },
  table: {
    width: "100%",
    marginVertical: 8,
    borderWidth: 0.5,
    borderColor: "#CFD8DC",
  },
  tableRow: { flexDirection: "row" },
  tableHeaderCell: {
    backgroundColor: NAVY,
    color: "#FFFFFF",
    fontFamily: FONT,
    fontWeight: "bold",
    padding: 5,
    fontSize: 10,
    flex: 1,
    borderRightWidth: 0.5,
    borderRightColor: "#FFFFFF",
  },
  tableCell: {
    padding: 5,
    fontSize: 10,
    flex: 1,
    borderRightWidth: 0.3,
    borderRightColor: "#CFD8DC",
    borderTopWidth: 0.3,
    borderTopColor: "#CFD8DC",
  },
  callout: {
    flexDirection: "row",
    marginVertical: 6,
  },
  calloutBar: { width: 4 },
  calloutBody: {
    flex: 1,
    padding: 8,
  },
  calloutTitle: {
    fontFamily: FONT,
    fontWeight: "bold",
    marginBottom: 3,
  },
});

const CALLOUT_COLORS: Record<
  string,
  { bg: string; bar: string; fg: string; label: string }
> = {
  info: { bg: "#EAF2F8", bar: "#2471A3", fg: "#1A3C5E", label: "Info" },
  warning: { bg: "#FEF5E7", bar: "#E67E22", fg: "#7E4A12", label: "Attention" },
  success: { bg: "#E8F8F5", bar: "#1E8449", fg: "#0B4F34", label: "À retenir" },
  danger: { bg: "#FDEDEC", bar: "#C0392B", fg: "#7B1A11", label: "Important" },
  note: { bg: "#F2F3F4", bar: "#7F8C8D", fg: "#2C3E50", label: "Note" },
  tip: { bg: "#F4ECF7", bar: "#7D3C98", fg: "#4A1F5E", label: "Astuce" },
};

// ============================================================
// Inline runs (gras, italique, code) — produit des Text imbriqués.
// ============================================================
function inlineRuns(text: string, baseColor?: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // 1) [texte](url)  2) URL nue  3) ***x***  4) **x**  5) *x*  6) `x`
  const regex =
    /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<>]+)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+?)\*|`([^`]+?)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(
        React.createElement(Text, { key: key++ }, text.slice(last, m.index)),
      );
    }
    if (m[3]) {
      parts.push(
        React.createElement(
          Link,
          {
            key: key++,
            src: m[3]!,
            style: { color: BLUE, textDecoration: "underline" },
          },
          m[2]!,
        ),
      );
    } else if (m[4]) {
      parts.push(
        React.createElement(
          Link,
          {
            key: key++,
            src: m[4]!,
            style: { color: BLUE, textDecoration: "underline" },
          },
          m[4]!,
        ),
      );
    } else if (m[5]) {
      parts.push(
        React.createElement(
          Text,
          { key: key++, style: { fontFamily: FONT, fontWeight: "bold", fontStyle: "italic", color: baseColor } },
          m[5],
        ),
      );
    } else if (m[6]) {
      parts.push(
        React.createElement(
          Text,
          { key: key++, style: { fontFamily: FONT, fontWeight: "bold", color: baseColor } },
          m[6],
        ),
      );
    } else if (m[7]) {
      parts.push(
        React.createElement(
          Text,
          { key: key++, style: { fontFamily: FONT, fontStyle: "italic", color: baseColor } },
          m[7],
        ),
      );
    } else if (m[8]) {
      parts.push(
        React.createElement(
          Text,
          {
            key: key++,
            style: {
              fontFamily: FONT_MONO,
              backgroundColor: "#F1F5F9",
              color: baseColor,
            },
          },
          m[8],
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(
      React.createElement(Text, { key: key++ }, text.slice(last)),
    );
  }
  return parts.length === 0
    ? [React.createElement(Text, { key: 0 }, text)]
    : parts;
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

// ============================================================
// Markdown → blocs React PDF
// ============================================================
function buildBlocks(markdown: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (/^---+$/.test(line.trim())) {
      blocks.push(
        React.createElement(View, { key: key++, style: styles.hr }),
      );
      i++;
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      blocks.push(
        React.createElement(Text, { key: key++, style: styles.h1 }, h1[1]),
      );
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      blocks.push(
        React.createElement(Text, { key: key++, style: styles.h2 }, h2[1]),
      );
      i++;
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      blocks.push(
        React.createElement(Text, { key: key++, style: styles.h3 }, h3[1]),
      );
      i++;
      continue;
    }

    // Tableau
    if (line.trim().startsWith("|") && i + 1 < lines.length) {
      const sep = (lines[i + 1] ?? "").trim();
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(sep)) {
        const headers = splitRow(line);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i]!.trim().startsWith("|")) {
          rows.push(splitRow(lines[i]!));
          i++;
        }
        blocks.push(buildTable(headers, rows, key++));
        continue;
      }
    }

    // Callout
    const callout = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/i);
    if (callout) {
      const kind = callout[1]!.toLowerCase();
      const title = (callout[2] ?? "").trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.startsWith(">")) {
        body.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(buildCallout(kind, title, body, key++));
      continue;
    }

    // Liste à puces
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      items.forEach((it) => {
        blocks.push(
          React.createElement(
            View,
            { key: key++, style: styles.listItem },
            React.createElement(Text, { style: styles.bullet }, "•"),
            React.createElement(
              Text,
              { style: styles.listText },
              ...inlineRuns(it),
            ),
          ),
        );
      });
      continue;
    }

    // Liste numérotée
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      items.forEach((it, idx) => {
        blocks.push(
          React.createElement(
            View,
            { key: key++, style: styles.listItem },
            React.createElement(
              Text,
              { style: styles.bullet },
              `${idx + 1}.`,
            ),
            React.createElement(
              Text,
              { style: styles.listText },
              ...inlineRuns(it),
            ),
          ),
        );
      });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraphe (fusion lignes adjacentes)
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
    const merged = para.join(" ");
    blocks.push(
      React.createElement(
        Text,
        { key: key++, style: styles.paragraph },
        ...inlineRuns(merged),
      ),
    );
  }

  return blocks;
}

function proportionalColWidths(headers: string[], rows: string[][], colCount: number): string[] {
  const weights: number[] = Array(colCount).fill(0);
  for (let ci = 0; ci < colCount; ci++) {
    let max = Math.max(headers[ci]?.length ?? 1, 3);
    const sample = Math.min(rows.length, 8);
    for (let ri = 0; ri < sample; ri++) {
      const len = rows[ri]?.[ci]?.replace(/\*\*/g, "").replace(/\*/g, "").length ?? 0;
      if (len > max) max = len;
    }
    weights[ci] = Math.sqrt(max);
  }
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const norm = weights.map(w => w / total);
  const pcts = norm.map(r => Math.round(r * 100));
  // Fix rounding drift so percentages sum to exactly 100
  const diff = 100 - pcts.reduce((a, b) => a + b, 0);
  pcts[pcts.length - 1] = (pcts[pcts.length - 1] ?? 0) + diff;
  return pcts.map(p => `${p}%`);
}

function buildTable(
  headers: string[],
  rows: string[][],
  key: number,
): React.ReactNode {
  const colCount = Math.max(headers.length, 1);
  const colWidths = proportionalColWidths(headers, rows, colCount);

  return React.createElement(
    View,
    { key, style: styles.table },
    React.createElement(
      View,
      { style: styles.tableRow, wrap: false },
      ...headers.map((h, ci) =>
        React.createElement(
          Text,
          { key: ci, style: { ...styles.tableHeaderCell, flex: 0, flexBasis: colWidths[ci] } },
          h,
        ),
      ),
    ),
    ...rows.map((row, ri) =>
      React.createElement(
        View,
        { key: ri, style: styles.tableRow, wrap: false },
        ...row.map((cell, ci) =>
          React.createElement(
            Text,
            {
              key: ci,
              style: {
                ...styles.tableCell,
                flex: 0,
                flexBasis: colWidths[ci],
                backgroundColor: ri % 2 === 0 ? "#FFFFFF" : LIGHT_BLUE,
              },
            },
            ...inlineRuns(cell),
          ),
        ),
      ),
    ),
  );
}

function buildCallout(
  kind: string,
  title: string,
  body: string[],
  key: number,
): React.ReactNode {
  const s = CALLOUT_COLORS[kind] ?? CALLOUT_COLORS.info!;
  const heading = title || s.label;
  const cleaned = body.filter((l) => l.trim() !== "");

  return React.createElement(
    View,
    { key, style: styles.callout, wrap: false },
    React.createElement(View, {
      style: { ...styles.calloutBar, backgroundColor: s.bar },
    }),
    React.createElement(
      View,
      { style: { ...styles.calloutBody, backgroundColor: s.bg } },
      React.createElement(
        Text,
        { style: { ...styles.calloutTitle, color: s.fg } },
        heading,
      ),
      ...cleaned.map((ln, idx) =>
        React.createElement(
          Text,
          { key: idx, style: { color: s.fg, marginTop: 2 } },
          ...inlineRuns(ln, s.fg),
        ),
      ),
    ),
  );
}

// ============================================================
// API publique
// ============================================================
export async function markdownToPdf(markdown: string): Promise<Blob> {
  // Décode les entités HTML (&nbsp;, &amp;, etc.) que l'IA glisse parfois
  // dans son markdown — sans ça elles apparaissent en clair dans le PDF.
  markdown = decodeHtmlEntities(markdown);
  const blocks = buildBlocks(markdown);
  const doc = React.createElement(
    Document,
    null,
    React.createElement(Page, { size: "A4", style: styles.page }, ...blocks),
  );
  return await pdf(doc).toBlob();
}

/**
 * Sauvegarde un .pdf — Tauri : dossier Téléchargements ; navigateur : download classique.
 * Retourne le chemin (Tauri) ou null (navigateur).
 */
export async function downloadPdf(
  blob: Blob,
  filename: string,
): Promise<string | null> {
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_");
  const finalName = safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    const { downloadDir, join } = await import("@tauri-apps/api/path");
    const { writeFile, exists } = await import("@tauri-apps/plugin-fs");

    const dir = await downloadDir();
    let target = await join(dir, finalName);
    if (await exists(target)) {
      const base = finalName.replace(/\.pdf$/i, "");
      for (let i = 2; i < 1000; i++) {
        const candidate = await join(dir, `${base} (${i}).pdf`);
        if (!(await exists(candidate))) {
          target = candidate;
          break;
        }
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

// Évite un warning d'unused import — Font est exposé pour permettre à terme
// l'enregistrement de polices custom (ex: Inter) si besoin.
export { Font };
