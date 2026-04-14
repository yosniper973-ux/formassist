import { MODELS, ESTIMATED_OUTPUT_TOKENS, DEFAULT_TEMPERATURE, PRESETS } from "@/config/models";
import type {
  ModelTier,
  TaskType,
  ClaudeRequest,
  ClaudeResponse,
  CostEstimate,
  ClaudeMessage,
} from "@/types/api";
import { getPromptForTask } from "@/prompts";
import { db } from "@/lib/db";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/** Calcule le coût en euros pour un nombre de tokens */
function computeCost(
  model: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const cfg = MODELS[model];
  return (
    (inputTokens / 1_000_000) * cfg.inputCostPer1M +
    (outputTokens / 1_000_000) * cfg.outputCostPer1M
  );
}

/** Estime grossièrement le nombre de tokens dans un texte */
function estimateTokens(text: string): number {
  // ~4 caractères par token en français (approximation)
  return Math.ceil(text.length / 4);
}

/** Résout le modèle à utiliser pour une tâche donnée */
async function resolveModel(
  task: TaskType,
  override?: ModelTier,
): Promise<ModelTier> {
  if (override) return override;

  const preset = await db.getConfig("model_preset");
  const presetName = preset ?? "quality";

  if (presetName === "custom") {
    const customOverrides = await db.getConfig("model_overrides");
    if (customOverrides) {
      const overrides = JSON.parse(customOverrides) as Record<TaskType, ModelTier>;
      if (overrides[task]) return overrides[task];
    }
  }

  const presetConfig = PRESETS[presetName];
  if (presetConfig?.[task]) return presetConfig[task];

  return "sonnet"; // fallback
}

/** Estimation du coût avant exécution */
export async function estimateCost(
  task: TaskType,
  messages: ClaudeMessage[],
  modelOverride?: ModelTier,
): Promise<CostEstimate> {
  const model = await resolveModel(task, modelOverride);
  const systemPrompt = getPromptForTask(task);

  const inputText = systemPrompt + messages.map((m) => m.content).join(" ");
  const inputTokens = estimateTokens(inputText);
  const outputTokens = ESTIMATED_OUTPUT_TOKENS[task];
  const estimated = computeCost(model, inputTokens, outputTokens);

  const thresholdStr = await db.getConfig("cost_alert_threshold");
  const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.5;

  let alternativeModel: ModelTier | undefined;
  let alternativeCost: number | undefined;

  if (estimated > threshold && model === "opus") {
    alternativeModel = "sonnet";
    alternativeCost = computeCost("sonnet", inputTokens, outputTokens);
  }

  return {
    needsConfirmation: estimated > threshold,
    estimatedCost: Math.round(estimated * 100) / 100,
    model: MODELS[model].id,
    modelDisplayName: MODELS[model].displayName,
    alternativeModel: alternativeModel
      ? MODELS[alternativeModel].id
      : undefined,
    alternativeModelName: alternativeModel
      ? MODELS[alternativeModel].displayName
      : undefined,
    alternativeCost: alternativeCost
      ? Math.round(alternativeCost * 100) / 100
      : undefined,
  };
}

/** Vérifie le budget mensuel avant un appel */
async function checkBudget(estimatedCost: number): Promise<{
  allowed: boolean;
  currentSpent: number;
  budget: number;
}> {
  const budgetStr = await db.getConfig("budget_monthly");
  const budget = budgetStr ? parseFloat(budgetStr) : 25;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const currentSpent = await db.getMonthlyApiCost(monthStart);

  return {
    allowed: currentSpent + estimatedCost <= budget,
    currentSpent,
    budget,
  };
}

/** Appel principal à l'API Claude */
export async function request(req: ClaudeRequest): Promise<ClaudeResponse> {
  const apiKey = await db.getConfig("api_key");
  if (!apiKey) {
    throw new Error("Clé API non configurée. Ouvre les paramètres pour la configurer.");
  }

  const model = await resolveModel(req.task, req.modelOverride);
  const modelId = MODELS[model].id;

  // Build system prompt
  let systemPrompt = req.systemPromptOverride ?? getPromptForTask(req.task);
  if (req.systemPromptAppend) {
    systemPrompt += "\n\n" + req.systemPromptAppend;
  }

  // Inject style profile if relevant
  if (req.context?.styleProfile) {
    systemPrompt += `\n\n## Profil de style pédagogique de la formatrice\n${req.context.styleProfile}`;
  }

  // Inject language
  if (req.context?.language && req.context.language !== "fr") {
    systemPrompt += `\n\nIMPORTANT : Génère le contenu en ${req.context.language === "en" ? "anglais" : req.context.language}.`;
  }

  const temperature = req.temperature ?? DEFAULT_TEMPERATURE[req.task];
  const maxTokens = req.maxTokens ?? ESTIMATED_OUTPUT_TOKENS[req.task] * 2;

  const body = {
    model: modelId,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 || response.status === 529) {
        const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(parseApiError(response.status, errorBody));
      }

      const data = await response.json();
      const content = data.content?.[0]?.text ?? "";
      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const costEuros = computeCost(model, inputTokens, outputTokens);

      // Log usage
      await db.logApiUsage({
        model: modelId,
        task_type: req.task,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_euros: costEuros,
      });

      return {
        content,
        model: modelId,
        inputTokens,
        outputTokens,
        costEuros,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError ?? new Error("Erreur inconnue lors de l'appel à Claude");
}

/** Parse les erreurs API en messages compréhensibles */
function parseApiError(status: number, body: string): string {
  switch (status) {
    case 401:
      return "Clé API invalide. Vérifie ta clé dans les paramètres.";
    case 403:
      return "Accès refusé. Ta clé API n'a peut-être pas les permissions nécessaires.";
    case 400: {
      if (body.includes("credit")) {
        return "Crédit insuffisant sur ton compte Anthropic. Ajoute du crédit sur console.anthropic.com.";
      }
      return `Erreur dans la requête : ${body}`;
    }
    case 429:
      return "Trop de requêtes. Réessaie dans quelques secondes.";
    case 500:
    case 529:
      return "Les serveurs Claude sont temporairement surchargés. Réessaie dans un moment.";
    default:
      return `Erreur inattendue (${status}) : ${body}`;
  }
}

/** Test rapide de connexion API */
export async function testConnection(apiKey: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODELS.haiku.id,
        max_tokens: 50,
        messages: [{ role: "user", content: "Bonjour" }],
      }),
    });

    if (response.ok) {
      return { success: true };
    }

    const body = await response.text();
    return { success: false, error: parseApiError(response.status, body) };
  } catch (err) {
    return {
      success: false,
      error: "Impossible de se connecter à internet. Vérifie ta connexion.",
    };
  }
}
