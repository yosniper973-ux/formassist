import React from "react";
import { Info, AlertTriangle, CheckCircle2, AlertOctagon, StickyNote, Lightbulb } from "lucide-react";

/**
 * Rendu Markdown stylisé pour les documents pédagogiques générés.
 * Supporte : H1 bandeau, H2/H3 colorés, tableaux, callouts GitHub
 * (> [!info], > [!warning], > [!success], > [!danger], > [!note], > [!tip]),
 * listes, gras/italique/code.
 *
 * Police Arial, palette bleu marine #1A3C5E — identique à l'export .docx.
 */

type CalloutKind = "info" | "warning" | "success" | "danger" | "note" | "tip";

const CALLOUT_STYLES: Record<
  CalloutKind,
  { bg: string; border: string; fg: string; Icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  info:    { bg: "#EAF2F8", border: "#2471A3", fg: "#1A3C5E", Icon: Info,          label: "Info" },
  warning: { bg: "#FEF5E7", border: "#E67E22", fg: "#7E4A12", Icon: AlertTriangle, label: "Attention" },
  success: { bg: "#E8F8F5", border: "#1E8449", fg: "#0B4F34", Icon: CheckCircle2,  label: "À retenir" },
  danger:  { bg: "#FDEDEC", border: "#C0392B", fg: "#7B1A11", Icon: AlertOctagon,  label: "Important" },
  note:    { bg: "#F2F3F4", border: "#7F8C8D", fg: "#2C3E50", Icon: StickyNote,    label: "Note" },
  tip:     { bg: "#F4ECF7", border: "#7D3C98", fg: "#4A1F5E", Icon: Lightbulb,     label: "Astuce" },
};

export function RichMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="rich-markdown" style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#1B1F23" }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

// ============================================================
// Parsing en blocs
// ============================================================

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "hr" }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][]; align: ("left" | "center" | "right")[] }
  | { kind: "callout"; variant: CalloutKind; title: string | null; lines: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.replace(/\r$/, "");

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Heading
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { blocks.push({ kind: "h1", text: h1[1]!.trim() }); i++; continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { blocks.push({ kind: "h2", text: h2[1]!.trim() }); i++; continue; }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { blocks.push({ kind: "h3", text: h3[1]!.trim() }); i++; continue; }

    // Table: detect `| col | col |` followed by separator `|---|---|`
    if (line.trim().startsWith("|") && i + 1 < lines.length) {
      const sep = (lines[i + 1] ?? "").trim();
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(sep)) {
        const headers = splitTableRow(line);
        const aligns = splitTableRow(sep).map(toAlign);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i]!.trim().startsWith("|")) {
          rows.push(splitTableRow(lines[i]!));
          i++;
        }
        blocks.push({ kind: "table", headers, rows, align: aligns });
        continue;
      }
    }

    // Callout: > [!type] optional title
    const calloutStart = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/i);
    if (calloutStart) {
      const kind = calloutStart[1]!.toLowerCase() as CalloutKind;
      const variant: CalloutKind = kind in CALLOUT_STYLES ? kind : "info";
      const title = (calloutStart[2] ?? "").trim() || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.startsWith(">")) {
        body.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "callout", variant, title, lines: body });
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Empty
    if (line.trim() === "") { i++; continue; }

    // Paragraph (accumule les lignes adjacentes)
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
    blocks.push({ kind: "p", text: para.join(" ") });
  }

  return blocks;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function toAlign(cell: string): "left" | "center" | "right" {
  const c = cell.trim();
  if (c.startsWith(":") && c.endsWith(":")) return "center";
  if (c.endsWith(":")) return "right";
  return "left";
}

// ============================================================
// Rendu
// ============================================================

function renderBlock(b: Block, key: number): React.ReactNode {
  switch (b.kind) {
    case "h1":
      return (
        <h1
          key={key}
          style={{
            background: "#1A3C5E",
            color: "#FFFFFF",
            padding: "12px 18px",
            margin: "0 0 18px 0",
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            borderRadius: "4px",
          }}
        >
          {renderInline(b.text)}
        </h1>
      );
    case "h2":
      return (
        <h2
          key={key}
          style={{
            color: "#1A3C5E",
            borderBottom: "2px solid #2471A3",
            padding: "0 0 4px 0",
            margin: "22px 0 10px 0",
            fontSize: "15px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}
        >
          {renderInline(b.text)}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={key}
          style={{
            color: "#2471A3",
            margin: "14px 0 6px 0",
            fontSize: "13.5px",
            fontWeight: 700,
          }}
        >
          {renderInline(b.text)}
        </h3>
      );
    case "hr":
      return <hr key={key} style={{ border: 0, borderTop: "1px dashed #B0BEC5", margin: "18px 0" }} />;
    case "p":
      return (
        <p key={key} style={{ margin: "8px 0", lineHeight: 1.55, fontSize: "12.5px" }}>
          {renderInline(b.text)}
        </p>
      );
    case "ul":
      return (
        <ul key={key} style={{ margin: "8px 0 8px 22px", padding: 0, fontSize: "12.5px", lineHeight: 1.55 }}>
          {b.items.map((it, i) => (
            <li key={i} style={{ marginBottom: 3 }}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} style={{ margin: "8px 0 8px 22px", padding: 0, fontSize: "12.5px", lineHeight: 1.55 }}>
          {b.items.map((it, i) => (
            <li key={i} style={{ marginBottom: 3 }}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "table": {
      return (
        <div key={key} style={{ overflowX: "auto", margin: "10px 0" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "12px",
              border: "1px solid #1A3C5E",
            }}
          >
            <thead>
              <tr>
                {b.headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      background: "#1A3C5E",
                      color: "#FFFFFF",
                      border: "1px solid #1A3C5E",
                      padding: "6px 8px",
                      textAlign: b.align[i] ?? "left",
                      fontWeight: 700,
                    }}
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#FFFFFF" : "#EAF2F8" }}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: "1px solid #B0BEC5",
                        padding: "5px 8px",
                        textAlign: b.align[ci] ?? "left",
                        verticalAlign: "top",
                      }}
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "callout": {
      const s = CALLOUT_STYLES[b.variant];
      const Icon = s.Icon;
      return (
        <div
          key={key}
          style={{
            background: s.bg,
            borderLeft: `4px solid ${s.border}`,
            color: s.fg,
            padding: "10px 14px",
            margin: "10px 0",
            borderRadius: "3px",
            fontSize: "12.5px",
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, marginBottom: 4 }}>
            <Icon className="h-4 w-4" />
            <span>{b.title ?? s.label}</span>
          </div>
          {b.lines.map((ln, i) =>
            ln.trim() === "" ? (
              <div key={i} style={{ height: 4 }} />
            ) : (
              <div key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>{renderInline(ln)}</div>
            ),
          )}
        </div>
      );
    }
  }
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+?)\*|`([^`]+?)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={k++} style={{ fontWeight: 700, fontStyle: "italic" }}>{m[2]}</strong>);
    else if (m[3]) parts.push(<strong key={k++} style={{ fontWeight: 700 }}>{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={k++} style={{ fontStyle: "italic" }}>{m[4]}</em>);
    else if (m[5]) parts.push(
      <code key={k++} style={{ background: "#F2F3F4", padding: "1px 5px", borderRadius: 3, fontFamily: "Consolas, Menlo, monospace", fontSize: "0.9em" }}>
        {m[5]}
      </code>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : parts;
}
