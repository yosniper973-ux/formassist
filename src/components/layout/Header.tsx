import { useEffect, useState } from "react";
import { Lock, Wifi, WifiOff, ExternalLink } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useAppStore } from "@/stores/appStore";
import { db } from "@/lib/db";
import { formatEuros } from "@/lib/utils";
import { CentreSelector } from "./CentreSelector";

const ANTHROPIC_USAGE_URL = "https://console.anthropic.com/settings/usage";
const DEFAULT_BUDGET = 25;

export function Header() {
  const { isOnline, monthlyApiCost, setUnlocked } = useAppStore();
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET);

  // Charger le budget depuis la DB et écouter ses mises à jour
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await db.getConfig("budget_monthly");
        if (cancelled) return;
        const parsed = value ? parseFloat(value) : DEFAULT_BUDGET;
        setBudget(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET);
      } catch {
        // DB pas prête — garde la valeur par défaut
      }
    }
    void load();

    const onUpdate = () => void load();
    window.addEventListener("budget-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("budget-updated", onUpdate);
    };
  }, []);

  const percent = budget > 0 ? Math.min(999, (monthlyApiCost / budget) * 100) : 0;
  const displayPercent = Math.min(100, percent);
  // Vert sous 80%, orange entre 80 et 100%, rouge au-delà
  const status: "ok" | "warn" | "over" =
    percent >= 100 ? "over" : percent >= 80 ? "warn" : "ok";

  const colorByStatus = {
    ok: { bar: "bg-emerald-500", text: "text-emerald-700", hoverBg: "hover:bg-emerald-50" },
    warn: { bar: "bg-amber-500", text: "text-amber-700", hoverBg: "hover:bg-amber-50" },
    over: { bar: "bg-red-500", text: "text-red-700", hoverBg: "hover:bg-red-50" },
  } as const;
  const c = colorByStatus[status];

  async function openConsole() {
    try {
      await openExternal(ANTHROPIC_USAGE_URL);
    } catch {
      window.open(ANTHROPIC_USAGE_URL, "_blank");
    }
  }

  const tooltip =
    status === "over"
      ? `Budget dépassé (${Math.round(percent)} %). Pense à recharger sur console.anthropic.com.`
      : status === "warn"
        ? `Tu as consommé ${Math.round(percent)} % du budget. Surveille la suite.`
        : `Tu as consommé ${Math.round(percent)} % du budget mensuel. Clique pour ouvrir la console Anthropic.`;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      {/* Sélecteur de centre */}
      <CentreSelector />

      {/* Indicateurs à droite */}
      <div className="flex items-center gap-4">
        {/* Coût API du mois + barre de progression budget */}
        <button
          type="button"
          onClick={openConsole}
          title={tooltip}
          aria-label={tooltip}
          className={`group flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors ${c.hoverBg}`}
        >
          <span className="text-muted-foreground">API :</span>
          <span className={`font-medium ${c.text}`}>
            {formatEuros(monthlyApiCost)}
          </span>
          <span className="text-muted-foreground">/ {formatEuros(budget)}</span>
          <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <span
              className={`absolute left-0 top-0 h-full transition-all ${c.bar}`}
              style={{ width: `${displayPercent}%` }}
            />
          </span>
          <span className={`text-xs font-medium tabular-nums ${c.text}`}>
            {Math.round(percent)}%
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>

        {/* Indicateur connexion */}
        {isOnline ? (
          <Wifi className="h-4 w-4 text-green-500" aria-label="Connecté à internet" />
        ) : (
          <WifiOff className="h-4 w-4 text-orange-500" aria-label="Hors ligne" />
        )}

        {/* Bouton verrouiller */}
        <button
          onClick={() => setUnlocked(false)}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Verrouiller l'application"
          title="Verrouiller"
        >
          <Lock className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
