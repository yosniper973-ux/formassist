import { query, execute, generateId, now } from "./core";
import { getConfig, setConfig } from "./config";

export async function logApiUsage(entry: {
  model: string;
  task_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_euros: number;
  related_entity?: string;
  related_type?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO api_usage_log (id, model, task_type, input_tokens, output_tokens, cost_euros, related_entity, related_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      entry.model,
      entry.task_type,
      entry.input_tokens,
      entry.output_tokens,
      entry.cost_euros,
      entry.related_entity ?? null,
      entry.related_type ?? null,
      now(),
    ],
  );
}

export async function getMonthlyApiCost(monthStart: string): Promise<number> {
  const rows = await query<{ total: number }>(
    "SELECT COALESCE(SUM(cost_euros), 0) as total FROM api_usage_log WHERE created_at >= ?",
    [monthStart],
  );
  return rows[0]?.total ?? 0;
}

export async function getApiCredit(): Promise<{ amount: number; since: string }> {
  const [amountStr, since] = await Promise.all([
    getConfig("api_credit_amount"),
    getConfig("api_credit_since"),
  ]);
  if (!since) {
    // Migration depuis budget_monthly : on part du début du mois courant
    const budgetStr = await getConfig("budget_monthly");
    const parsed = budgetStr ? parseFloat(budgetStr) : NaN;
    const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
    const d = new Date();
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
    return { amount, since: monthStart };
  }
  const parsed = amountStr ? parseFloat(amountStr) : NaN;
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
  return { amount, since };
}

export async function setApiCredit(amount: number, since: string): Promise<void> {
  await setConfig("api_credit_amount", String(amount));
  await setConfig("api_credit_since", since);
}
