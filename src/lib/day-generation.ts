import { requestStream } from "@/lib/claude";
import { db } from "@/lib/db";
import type { TaskType, ClaudeMessage } from "@/types/api";

/** Une phase de la journée, telle qu'importée depuis le déroulé. */
export type DayPhase = {
  id: string;
  phase: string;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  label: string;
  task: string | null;
  sort_order: number;
};

export type DaySavoir = {
  category: string;
  content: string;
  competence_code: string;
};

export type DayContext = {
  slotId: string;
  formationId: string;
  formationTitle: string;
  date: string;
  slotTitle: string;
  phases: DayPhase[];
  savoirs: DaySavoir[];
  competences: Array<{ code: string; title: string }>;
  styleProfile: string;
  deliveryContext: string;
  groupSize: number;
  /** Phases déjà générées, par id de phase. */
  existing: Map<string, { id: string; title: string }>;
};

const CAT_LABEL: Record<string, string> = {
  sf_technique: "Savoir-faire technique",
  sf_organisationnel: "Savoir-faire organisationnel",
  sf_relationnel: "Savoir-faire relationnel",
  savoir: "Savoir",
};

/** Type de contenu enregistré, dérivé de la phase. */
export function contentTypeForPhase(phase: DayPhase): string {
  if (phase.phase === "apport") return "course";
  if (phase.phase === "jeu") return "game";
  return phase.task === "generation_mise_en_situation" ? "role_play" : "exercise";
}

function taskForPhase(phase: DayPhase): TaskType {
  if (phase.task) return phase.task as TaskType;
  if (phase.phase === "apport") return "generation_cours";
  if (phase.phase === "jeu") return "generation_jeu";
  return "generation_exercice";
}

/** Charge tout ce qu'il faut pour générer une journée. */
export async function loadDayContext(slotId: string): Promise<DayContext | null> {
  const slots = await db.query<{
    id: string;
    formation_id: string;
    date: string;
    title: string | null;
    formation_title: string;
    delivery_body: string | null;
  }>(
    `SELECT s.id, s.formation_id, s.date, s.title,
            f.title AS formation_title,
            dc.body AS delivery_body
       FROM slots s
       JOIN formations f ON f.id = s.formation_id
       LEFT JOIN delivery_contexts dc ON dc.id = f.delivery_context_id
      WHERE s.id = ?`,
    [slotId],
  );
  const slot = slots[0];
  if (!slot) return null;

  const [phases, savoirs, competences, contents, prof] = await Promise.all([
    db.query<DayPhase>(
      "SELECT id, phase, start_time, end_time, duration_hours, label, task, sort_order \
       FROM slot_phases WHERE slot_id = ? ORDER BY sort_order",
      [slotId],
    ),
    db.query<DaySavoir>(
      `SELECT cs.category, cs.content, c.code AS competence_code
         FROM slot_savoirs ss
         JOIN competence_savoirs cs ON cs.id = ss.savoir_id
         JOIN competences c ON c.id = cs.competence_id
        WHERE ss.slot_id = ? ORDER BY c.code, cs.sort_order`,
      [slotId],
    ),
    db.query<{ code: string; title: string }>(
      `SELECT c.code, c.title FROM slot_competences sc
         JOIN competences c ON c.id = sc.competence_id
        WHERE sc.slot_id = ? ORDER BY c.code`,
      [slotId],
    ),
    db.query<{ id: string; title: string; phase_id: string | null }>(
      "SELECT id, title, slot_phase_id AS phase_id FROM generated_contents \
       WHERE slot_id = ? AND archived_at IS NULL",
      [slotId],
    ),
    db.getStyleProfile(),
  ]);

  const existing = new Map<string, { id: string; title: string }>();
  for (const c of contents) if (c.phase_id) existing.set(c.phase_id, { id: c.id, title: c.title });

  const styleTxt =
    (prof?.analyzed_profile as string | null) ?? (prof?.self_description as string | null) ?? "";

  return {
    slotId,
    formationId: slot.formation_id,
    formationTitle: slot.formation_title,
    date: slot.date,
    slotTitle: slot.title ?? "",
    phases,
    savoirs,
    competences,
    styleProfile: prof?.confirmed ? styleTxt : "",
    deliveryContext: slot.delivery_body ?? "",
    groupSize: 12,
    existing,
  };
}

/** Construit la consigne d'une phase. */
export function buildPhaseMessages(ctx: DayContext, phase: DayPhase): ClaudeMessage[] {
  const minutes = Math.round((phase.duration_hours ?? 1) * 60);
  const comps = ctx.competences.map((c) => `- ${c.code} : ${c.title}`).join("\n");
  const savoirs = ctx.savoirs
    .map((s) => `- [${s.competence_code} · ${CAT_LABEL[s.category] ?? s.category}] ${s.content}`)
    .join("\n");

  const quoi =
    phase.phase === "apport"
      ? "un apport théorique"
      : phase.phase === "jeu"
        ? "un jeu pédagogique"
        : "un atelier pratique";

  return [
    {
      role: "user",
      content: `Génère ${quoi} pour la formation « ${ctx.formationTitle} ».

Journée du ${ctx.date} — ${ctx.slotTitle}
Phase : ${phase.phase} de ${phase.start_time ?? ""} à ${phase.end_time ?? ""}

Sujet imposé par le déroulé pédagogique, à traiter tel quel :
**${phase.label}**

Durée : **${minutes} minutes — contrainte ferme, non négociable.**
Groupe : ${ctx.groupSize} apprenants.

Compétences visées :
${comps || "(aucune)"}

Savoirs et savoir-faire du REAC à couvrir, au libellé exact du référentiel :
${savoirs || "(aucun)"}

Le contenu produit doit couvrir ces savoirs et rester dans la durée impartie. \
N'aborde pas les autres phases de la journée : une autre génération s'en charge.`,
    },
  ];
}

/**
 * Génère une phase et l'enregistre, rattachée au créneau et à la phase.
 * Retourne l'identifiant du contenu créé.
 */
export async function generatePhase(
  ctx: DayContext,
  phase: DayPhase,
  signal: AbortSignal,
  onChunk: (text: string) => void,
  onCost?: (euros: number) => void,
): Promise<string> {
  let full = "";
  let model = "";
  let cost = 0;

  for await (const chunk of requestStream(
    {
      task: taskForPhase(phase),
      messages: buildPhaseMessages(ctx, phase),
      maxTokens: 16000,
      context: {
        formationId: ctx.formationId,
        groupSize: ctx.groupSize,
        styleProfile: ctx.styleProfile || undefined,
        deliveryContext: ctx.deliveryContext || undefined,
      },
    },
    signal,
    (meta) => {
      model = meta.model;
      cost = meta.costEuros;
      onCost?.(meta.costEuros);
    },
  )) {
    full += chunk;
    onChunk(full);
  }

  const titre = `${ctx.slotTitle || ctx.date} — ${phase.label}`.slice(0, 200);
  return db.createContent({
    slot_id: ctx.slotId,
    slot_phase_id: phase.id,
    formation_id: ctx.formationId,
    content_type: contentTypeForPhase(phase),
    title: titre,
    content_markdown: full,
    model_used: model || "inconnu",
    generation_cost: cost,
    estimated_duration: Math.round((phase.duration_hours ?? 1) * 60),
  });
}
