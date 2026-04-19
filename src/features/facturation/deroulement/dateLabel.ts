const FR_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Formate une liste de dates ISO (YYYY-MM-DD) en un label français compact.
 *
 * - "03-04 mars 2026" si 2 dates du même mois
 * - "03-04-17-18-24-25 et 31 mars 2026" si plusieurs dates du même mois
 * - "28 février au 05 mars 2026" si deux mois consécutifs
 * - sinon fallback "liste de dates complètes"
 */
export function formatDatesLabel(isoDates: string[]): string {
  if (isoDates.length === 0) return "";

  const parsed = isoDates
    .map((d) => {
      const parts = d.split("-");
      const y = parseInt(parts[0] ?? "0", 10);
      const m = parseInt(parts[1] ?? "0", 10);
      const dd = parseInt(parts[2] ?? "0", 10);
      return { y, m, d: dd, raw: d };
    })
    .sort((a, b) => a.raw.localeCompare(b.raw));

  const head0 = parsed[0]!;
  const allSameMonth = parsed.every((p) => p.m === head0.m && p.y === head0.y);
  if (allSameMonth) {
    const days = Array.from(new Set(parsed.map((p) => pad2(p.d))));
    const month = FR_MONTHS[head0.m - 1] ?? "";
    if (days.length === 1) return `${days[0]} ${month} ${head0.y}`;
    if (days.length === 2) return `${days[0]} et ${days[1]} ${month} ${head0.y}`;
    const h = days.slice(0, -1).join("-");
    const tail = days[days.length - 1];
    return `${h} et ${tail} ${month} ${head0.y}`;
  }

  // Multi-mois : juste borne début → fin
  const first = head0;
  const last = parsed[parsed.length - 1]!;
  const mFirst = FR_MONTHS[first.m - 1] ?? "";
  const mLast = FR_MONTHS[last.m - 1] ?? "";
  return `du ${pad2(first.d)} ${mFirst} ${first.y} au ${pad2(last.d)} ${mLast} ${last.y}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
