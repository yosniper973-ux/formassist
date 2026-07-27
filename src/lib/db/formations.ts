import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function getFormations(centreId: string, includeArchived = false): Promise<Row[]> {
  const where = includeArchived
    ? "WHERE centre_id = ?"
    : "WHERE centre_id = ? AND archived_at IS NULL";
  return query(`SELECT * FROM formations ${where} ORDER BY start_date DESC`, [centreId]);
}

export async function createFormation(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO formations (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

export async function saveParsedReac(
  formationId: string,
  ccps: Array<{
    code: string;
    title: string;
    competences: Array<{
      code: string;
      title: string;
      description?: string;
      criteria: string[];
      savoirs?: {
        sf_techniques?: string[];
        sf_organisationnels?: string[];
        sf_relationnels?: string[];
        savoirs?: string[];
      };
    }>;
  }>,
): Promise<void> {
  await execute("BEGIN");
  try {
    // ON DELETE CASCADE supprime automatiquement competences et evaluation_criteria
    await execute("DELETE FROM ccps WHERE formation_id = ?", [formationId]);

    for (let i = 0; i < ccps.length; i++) {
      const ccp = ccps[i]!;
      const ccpId = generateId();
      await execute(
        "INSERT INTO ccps (id, formation_id, code, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [ccpId, formationId, ccp.code, ccp.title, i, now()],
      );

      for (let j = 0; j < ccp.competences.length; j++) {
        const comp = ccp.competences[j]!;
        const compId = generateId();
        await execute(
          "INSERT INTO competences (id, ccp_id, code, title, description, sort_order, in_scope, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
          [compId, ccpId, comp.code, comp.title, comp.description ?? null, j, now()],
        );

        for (let k = 0; k < comp.criteria.length; k++) {
          await execute(
            "INSERT INTO evaluation_criteria (id, competence_id, description, sort_order) VALUES (?, ?, ?, ?)",
            [generateId(), compId, comp.criteria[k], k],
          );
        }

        // Savoirs
        if (comp.savoirs) {
          const categoryMap: Array<['sf_technique' | 'sf_organisationnel' | 'sf_relationnel' | 'savoir', string[]]> = [
            ['sf_technique', comp.savoirs.sf_techniques ?? []],
            ['sf_organisationnel', comp.savoirs.sf_organisationnels ?? []],
            ['sf_relationnel', comp.savoirs.sf_relationnels ?? []],
            ['savoir', comp.savoirs.savoirs ?? []],
          ];
          let savoirOrder = 0;
          for (const [cat, items] of categoryMap) {
            for (const item of items) {
              await execute(
                "INSERT INTO competence_savoirs (id, competence_id, category, content, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [generateId(), compId, cat, item, savoirOrder++, now()],
              );
            }
          }
        }
      }
    }

    await execute("UPDATE formations SET reac_parsed = 1, updated_at = ? WHERE id = ?", [
      now(),
      formationId,
    ]);
    await execute("COMMIT");
  } catch (err) {
    await execute("ROLLBACK").catch(() => {});
    throw err;
  }
}

export async function copyReacToFormation(
  sourceFormationId: string,
  targetFormationId: string,
): Promise<void> {
  // Purge cible
  const existingCcps = await query<{ id: string }>(
    "SELECT id FROM ccps WHERE formation_id = ?",
    [targetFormationId],
  );
  for (const ccp of existingCcps) {
    const comps = await query<{ id: string }>(
      "SELECT id FROM competences WHERE ccp_id = ?",
      [ccp.id],
    );
    for (const comp of comps) {
      await execute("DELETE FROM evaluation_criteria WHERE competence_id = ?", [comp.id]);
    }
    await execute("DELETE FROM competences WHERE ccp_id = ?", [ccp.id]);
  }
  await execute("DELETE FROM ccps WHERE formation_id = ?", [targetFormationId]);

  // Lecture source
  const srcCcps = await query<{
    id: string;
    code: string;
    title: string;
    sort_order: number;
  }>(
    "SELECT id, code, title, sort_order FROM ccps WHERE formation_id = ? ORDER BY sort_order",
    [sourceFormationId],
  );

  for (const srcCcp of srcCcps) {
    const newCcpId = generateId();
    await execute(
      "INSERT INTO ccps (id, formation_id, code, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [newCcpId, targetFormationId, srcCcp.code, srcCcp.title, srcCcp.sort_order, now()],
    );

    const srcComps = await query<{
      id: string;
      code: string;
      title: string;
      description: string | null;
      sort_order: number;
      in_scope: number;
    }>(
      "SELECT id, code, title, description, sort_order, in_scope FROM competences WHERE ccp_id = ? ORDER BY sort_order",
      [srcCcp.id],
    );

    for (const srcComp of srcComps) {
      const newCompId = generateId();
      await execute(
        "INSERT INTO competences (id, ccp_id, code, title, description, sort_order, in_scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          newCompId,
          newCcpId,
          srcComp.code,
          srcComp.title,
          srcComp.description,
          srcComp.sort_order,
          srcComp.in_scope,
          now(),
        ],
      );

      const srcCriteria = await query<{ description: string; sort_order: number }>(
        "SELECT description, sort_order FROM evaluation_criteria WHERE competence_id = ? ORDER BY sort_order",
        [srcComp.id],
      );
      for (const crit of srcCriteria) {
        await execute(
          "INSERT INTO evaluation_criteria (id, competence_id, description, sort_order) VALUES (?, ?, ?, ?)",
          [generateId(), newCompId, crit.description, crit.sort_order],
        );
      }
    }
  }

  await execute("UPDATE formations SET reac_parsed = 1, updated_at = ? WHERE id = ?", [
    now(),
    targetFormationId,
  ]);
}

export type Savoir = {
  id: string;
  competence_id: string;
  category: 'sf_technique' | 'sf_organisationnel' | 'sf_relationnel' | 'savoir';
  content: string;
  sort_order: number;
};

export async function getSavoirsForFormation(formationId: string): Promise<Savoir[]> {
  return query<Savoir>(
    `SELECT cs.* FROM competence_savoirs cs
     JOIN competences c ON cs.competence_id = c.id
     JOIN ccps ON c.ccp_id = ccps.id
     WHERE ccps.formation_id = ?
     ORDER BY c.sort_order, cs.category, cs.sort_order`,
    [formationId],
  );
}

export async function saveRcre(
  formationId: string,
  data: { text?: string; pdfB64?: string },
): Promise<void> {
  await execute(
    `UPDATE formations SET rcre_text = ?, rcre_pdf_b64 = ?, updated_at = ? WHERE id = ?`,
    [data.text ?? null, data.pdfB64 ?? null, now(), formationId],
  );
}

export async function getRcre(
  formationId: string,
): Promise<{ rcre_text: string | null; rcre_pdf_b64: string | null } | null> {
  const rows = await query<{ rcre_text: string | null; rcre_pdf_b64: string | null }>(
    "SELECT rcre_text, rcre_pdf_b64 FROM formations WHERE id = ?",
    [formationId],
  );
  return rows[0] ?? null;
}

/**
 * Critères d'évaluation du référentiel (REAC) pour un ensemble de compétences.
 * Utilisé par la page Évaluations pour injecter les critères verbatim dans la trame.
 */
export async function getCriteriaForCompetences(competenceIds: string[]): Promise<Row[]> {
  if (competenceIds.length === 0) return [];
  const placeholders = competenceIds.map(() => "?").join(", ");
  return query(
    `SELECT ec.*, c.code AS competence_code, c.title AS competence_title
       FROM evaluation_criteria ec
       JOIN competences c ON c.id = ec.competence_id
      WHERE ec.competence_id IN (${placeholders})
      ORDER BY c.sort_order, ec.sort_order`,
    competenceIds,
  );
}
