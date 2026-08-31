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
  /** Cours dispensés avant cette journée — périmètre autorisé d'un ECF. */
  coursAnterieurs: Array<{ title: string; content_markdown: string }>;
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

const TACHES: readonly TaskType[] = [
  "generation_cours", "generation_jeu", "generation_exercice",
  "generation_mise_en_situation", "generation_evaluation",
];

function taskForPhase(phase: DayPhase): TaskType {
  // Une valeur inconnue laisserait getPromptForTask renvoyer undefined, et le
  // prompt système partirait avec « undefined » en tête.
  if (phase.task && (TACHES as readonly string[]).includes(phase.task)) {
    return phase.task as TaskType;
  }
  if (phase.task === "evaluation") return "generation_evaluation";
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

  // Un ECF ne peut porter que sur des notions réellement enseignées : on fournit
  // les cours déjà produits pour cette formation, antérieurs à la journée.
  const coursAnterieurs = await db.query<{ title: string; content_markdown: string }>(
    `SELECT g.title, g.content_markdown
       FROM generated_contents g
       JOIN slots s ON s.id = g.slot_id
      WHERE g.formation_id = ? AND g.archived_at IS NULL
        AND g.content_type = 'course' AND s.date <= ?
      ORDER BY s.date`,
    [slot.formation_id, slot.date],
  );

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
    coursAnterieurs,
  };
}

/** Construit la consigne d'une phase. */
export function buildPhaseMessages(ctx: DayContext, phase: DayPhase): ClaudeMessage[] {
  const minutes = Math.round((phase.duration_hours ?? 1) * 60);
  const comps = ctx.competences.map((c) => `- ${c.code} : ${c.title}`).join("\n");
  const savoirs = ctx.savoirs
    .map((s) => `- [${s.competence_code} · ${CAT_LABEL[s.category] ?? s.category}] ${s.content}`)
    .join("\n");

  // Les deux autres phases de la journée : sans elles, chaque génération
  // couvrait l'intégralité des savoirs et les trois documents se recouvraient.
  const autres = ctx.phases
    .filter((p) => p.id !== phase.id)
    .map((p) => `- ${p.phase} (${p.start_time}–${p.end_time}) : ${p.label}`)
    .join("\n");

  const relationnels = ctx.savoirs.some((s) => s.category === "sf_relationnel");

  // Un ECF suit le prompt partagé generation_evaluation : on lui fournit les
  // paramètres, il impose la structure. Même sortie depuis l'onglet ECF et
  // depuis le planning.
  if (taskForPhase(phase) === "generation_evaluation") {
    const OBS = 25, TRANSITION = 5;   // minutes par stagiaire observée
    const passages = Math.floor(minutes / (OBS + TRANSITION));
    const seances = Math.ceil(ctx.groupSize / Math.max(1, passages));
    const cours = ctx.coursAnterieurs
      .map((c) => `### ${c.title}\n${c.content_markdown.slice(0, 2500)}`)
      .join("\n\n");

    return [
      {
        role: "user",
        content: `Génère un sujet d'Évaluation en Cours de Formation (ECF) pour la formation « ${ctx.formationTitle} ».

Journée du ${ctx.date} — ${ctx.slotTitle}

Durée totale de l'épreuve : **${minutes} minutes**. Effectif : **${ctx.groupSize} stagiaires**.

L'ECF est **principalement écrit** : toutes les stagiaires composent sur table en même temps.
S'y ajoute une **part pratique observée individuellement, ${OBS} minutes par stagiaire**, pendant
que les autres poursuivent l'écrit puis le travail en autonomie. Avec ${TRANSITION} minutes de
transition entre deux passages, **${passages} stagiaires peuvent être observées** au cours de
cette épreuve : il faut donc ${seances} ECF pour que l'effectif complet soit passé une fois.
Indique-le dans l'organisation de la séance, et précise quel sous-groupe est observé cette fois.

Compétences évaluées :
${comps || "(aucune)"}

Savoirs et savoir-faire du REAC sur lesquels porte l'évaluation :
${savoirs || "(aucun)"}

${
          cours
            ? `Cours réellement dispensés avant cette date — périmètre autorisé :\n\n${cours}`
            : "Aucun cours n'a encore été généré pour cette formation : reste sur les savoirs du REAC listés ci-dessus."
        }`,
      },
    ];
  }

  const quoi =
    phase.phase === "apport"
      ? "un apport théorique"
      : phase.phase === "jeu"
        ? "un jeu pédagogique"
        : "un atelier pratique";

  return [
    {
      role: "user",
      content: `Conçois ${quoi} pour la formation « ${ctx.formationTitle} ».

Journée du ${ctx.date} — ${ctx.slotTitle}
Phase : ${phase.phase}, de ${phase.start_time ?? ""} à ${phase.end_time ?? ""}

Sujet imposé par le déroulé, à traiter tel quel :
**${phase.label}**

Durée : **${minutes} minutes — contrainte ferme.**
Groupe : ${ctx.groupSize} stagiaires, répartis en trois sous-groupes de quatre.

Les deux autres phases de la même journée, traitées ailleurs :
${autres || "(aucune)"}
Reste strictement dans ta phase. Ne réexplique pas ce que les autres traitent.

Compétences visées :
${comps || "(aucune)"}

Savoirs et savoir-faire du REAC. Ta phase y **contribue sous son angle propre** ;
elle n'a pas à tous les couvrir intégralement, les autres phases y contribuent aussi :
${savoirs || "(aucun)"}

---

## Le produit attendu

Ce document sera **vendu à un centre de formation** et animé par un formateur qui
n'a pas participé à sa conception. Il doit donc être immédiatement exploitable,
et court. Un formateur veut savoir ce qu'il fait à telle heure, avec quoi, et ce
qu'il dit — pas lire un mémoire de pédagogie.

Structure les instruments didactiques d'Henri Boudreault, dans cet ordre exact et
avec ces titres exacts :

## FICHE DE TRAVAIL
Le document remis à la stagiaire. Il lui permet de comprendre seule le travail
demandé. Quatre rubriques, pas une de plus : ce que tu dois faire · les contraintes
· les ressources à ta disposition · à quoi on verra que c'est réussi.
Tutoiement, phrases courtes, aucun jargon non expliqué. Environ 250 mots.

## AIDE À LA TÂCHE
La séquence des opérations à réaliser, dans l'ordre, une ligne par opération, sous
forme de tableau ou de liste numérotée. C'est le modèle que la stagiaire garde sous
les yeux pendant qu'elle travaille. Pas de justification théorique. Environ 200 mots.

## MATÉRIEL À IMPRIMER
Le contenu intégral et prêt à découper de tout support matériel : cartes, étiquettes,
grilles, plateaux. Une carte = une ligne de tableau, avec son recto et son verso s'il
y a lieu. Si la phase n'exige aucun matériel imprimable, écris « Aucun » et passe à
la suite. N'annonce jamais un matériel dont tu ne fournis pas le contenu ici.${
      relationnels
        ? `

Cette phase vise des savoir-faire relationnels : ajoute une courte rubrique
« Aide à se comporter » décrivant les attitudes professionnelles attendues, en
comportements observables.`
        : ""
    }

## 🔒 GUIDE FORMATEUR
Réservé au formateur, retiré de la version remise aux stagiaires.
- Un tableau minuté : horaire · ce que fait le formateur · ce que font les stagiaires · matériel. Le total doit faire exactement ${minutes} minutes.
- Trois à cinq points de vigilance, tirés de ce qui rate réellement dans cette activité.
- Les corrigés et réponses attendues.
Environ 400 mots.

## Ce que tu ne fais pas

- Pas d'emoji, sauf le 🔒 du titre ci-dessus.
- Pas d'objectifs pédagogiques répétés en plusieurs endroits : ils figurent une seule
  fois, en tête de la fiche de travail, sous la forme « à la fin, tu sauras… ».
- Pas de rappel notionnel expliquant le métier au formateur : il est du métier.
- Pas de commentaire sur ta démarche pédagogique.
- Pas de travail à faire entre deux séances.
- N'annonce pas de matériel que tu ne fournis pas.
- **Jamais de schéma en art ASCII ni de bloc de code.** Les documents sont
  imprimés dans une police proportionnelle : un plateau dessiné avec des barres
  et des tirets s'effondre et devient illisible. Un plateau de jeu, un plan ou un
  schéma se décrivent en tableau (une ligne par zone : nom, contenu, emplacement)
  ou en liste numérotée de zones.
`,
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
