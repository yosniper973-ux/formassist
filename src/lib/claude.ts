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
import { decryptValue } from "@/lib/crypto";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

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
export async function checkBudget(estimatedCost: number): Promise<{
  allowed: boolean;
  currentSpent: number;
  budget: number;
}> {
  const budgetStr = await db.getConfig("budget_monthly");
  const parsedBudget = budgetStr ? parseFloat(budgetStr) : NaN;
  const budget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 25;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const currentSpent = await db.getMonthlyApiCost(monthStart);

  return {
    allowed: currentSpent + estimatedCost <= budget,
    currentSpent,
    budget,
  };
}

/** Nettoie une clé API : enlève TOUS les whitespace (début, fin, et au milieu).
 *  Les vraies clés Anthropic ne contiennent jamais d'espaces ni de newlines. */
function sanitizeKey(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** Récupère et déchiffre la clé API stockée en base */
async function loadApiKey(): Promise<string> {
  const stored = await db.getConfig("api_key");
  if (!stored) {
    throw new Error("Clé API non configurée. Ouvre les paramètres pour la configurer.");
  }

  // La clé est chiffrée AES-256-GCM au moment du save (Settings + SetupPassword).
  // Fallback : si le déchiffrement échoue, on ne tombe sur la valeur brute QUE
  // si elle ressemble à une vraie clé Anthropic (évite d'envoyer le ciphertext
  // base64 à Anthropic, ce qui produit un 401 mystérieux).
  let apiKey: string;
  try {
    apiKey = await decryptValue(stored);
  } catch {
    const looksLikeAnthropicKey = stored.trim().startsWith("sk-ant-");
    if (looksLikeAnthropicKey) {
      apiKey = stored;
    } else {
      throw new Error(
        "Impossible de déchiffrer la clé API (ciphertext en base). Ouvre Paramètres → Clé API, recolle ta clé et clique « Enregistrer la clé ».",
      );
    }
  }

  apiKey = sanitizeKey(apiKey);

  if (!apiKey) {
    throw new Error("Clé API vide. Reconfigure-la dans les paramètres.");
  }
  if (!apiKey.startsWith("sk-ant-")) {
    throw new Error(
      `Format de clé invalide : commence par « ${apiKey.slice(0, 8)}… » au lieu de « sk-ant- ». Reconfigure la clé dans Paramètres.`,
    );
  }
  return apiKey;
}

/** Appel principal à l'API Claude */
export async function request(req: ClaudeRequest): Promise<ClaudeResponse> {
  const apiKey = await loadApiKey();

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

  // Certains nouveaux modèles (Opus 4.7+) rejettent `temperature` avec un 400.
  // On retire le champ si on a déjà reçu cette erreur.
  let omitTemperature = false;

  function buildBody() {
    const b: Record<string, unknown> = {
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content) ? m.content : m.content,
      })),
    };
    if (!omitTemperature) b.temperature = temperature;
    return b;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await tauriFetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
          "anthropic-beta": "pdfs-2024-09-25",
        },
        body: JSON.stringify(buildBody()),
      });

      if (response.status === 429 || response.status === 529) {
        lastError = new Error(
          response.status === 429
            ? "Trop de requêtes envoyées à Claude. Réessaie dans quelques secondes."
            : "Les serveurs Claude sont temporairement surchargés. Réessaie dans un moment.",
        );
        const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        // Retry sans temperature si le modèle ne l'accepte plus
        if (
          response.status === 400 &&
          !omitTemperature &&
          /temperature.*deprecated|unsupported.*temperature/i.test(errorBody)
        ) {
          omitTemperature = true;
          continue;
        }
        throw new Error(parseApiError(response.status, errorBody));
      }

      // response.json() de tauri-plugin-http peut silencieusement échouer
      // sur certaines versions → on parse manuellement via .text()
      const responseText = await response.text();
      let data: { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      try {
        data = JSON.parse(responseText) as typeof data;
      } catch {
        throw new Error("Réponse API illisible (JSON invalide). Réessaie.");
      }
      const content = data.content?.[0]?.text ?? "";
      const inputTokens = Number(data.usage?.input_tokens ?? 0);
      const outputTokens = Number(data.usage?.output_tokens ?? 0);
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

/** Extrait le message d'erreur humain depuis le corps JSON renvoyé par Anthropic */
function extractAnthropicMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    // Format Anthropic : { "type": "error", "error": { "type": "...", "message": "..." } }
    const msg = parsed?.error?.message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  } catch {
    /* body pas JSON, on retourne la version brute tronquée */
  }
  return body.length > 300 ? body.slice(0, 300) + "…" : body;
}

/** Parse les erreurs API en messages compréhensibles, en incluant le détail d'Anthropic */
function parseApiError(status: number, body: string): string {
  const detail = extractAnthropicMessage(body);
  switch (status) {
    case 401:
      return `Clé API refusée par Anthropic (401). Message exact : « ${detail} »`;
    case 403:
      return `Accès refusé (403). Message Anthropic : « ${detail} »`;
    case 400: {
      if (body.toLowerCase().includes("credit")) {
        return "Crédit insuffisant sur ton compte Anthropic. Ajoute du crédit sur console.anthropic.com.";
      }
      return `Erreur dans la requête (400) : « ${detail} »`;
    }
    case 404:
      return `Modèle introuvable (404) : « ${detail} »`;
    case 429:
      return "Trop de requêtes. Réessaie dans quelques secondes.";
    case 500:
    case 529:
      return "Les serveurs Claude sont temporairement surchargés. Réessaie dans un moment.";
    default:
      return `Erreur inattendue (${status}) : « ${detail} »`;
  }
}

/** Test rapide de connexion API */
export async function testConnection(apiKey: string): Promise<{
  success: boolean;
  error?: string;
  debug?: { length: number; prefix: string; suffix: string };
}> {
  const cleanedKey = sanitizeKey(apiKey);
  const debug = {
    length: cleanedKey.length,
    prefix: cleanedKey.slice(0, 14),
    suffix: cleanedKey.slice(-4),
  };
  if (!cleanedKey.startsWith("sk-ant-")) {
    return {
      success: false,
      error: `La clé ne commence pas par « sk-ant- » (commence par « ${cleanedKey.slice(0, 8)} », longueur ${cleanedKey.length}). Copie-la à nouveau depuis console.anthropic.com.`,
      debug,
    };
  }
  try {
    const response = await tauriFetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cleanedKey,
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
      return { success: true, debug };
    }

    const body = await response.text();
    const baseError = parseApiError(response.status, body);
    // Sur 401, on ajoute le diagnostic de longueur pour détecter caractères parasites
    const errorWithDebug =
      response.status === 401
        ? `${baseError} [Debug clé envoyée : longueur=${debug.length}, début=« ${debug.prefix} », fin=« …${debug.suffix} »]`
        : baseError;
    return { success: false, error: errorWithDebug, debug };
  } catch (err) {
    return {
      success: false,
      error: "Impossible de se connecter à internet. Vérifie ta connexion.",
      debug,
    };
  }
}
