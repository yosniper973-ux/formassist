import { Lock, Wifi, WifiOff } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { formatEuros } from "@/lib/utils";
import { CentreSelector } from "./CentreSelector";

export function Header() {
  const { isOnline, monthlyApiCost, setUnlocked } = useAppStore();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      {/* Sélecteur de centre */}
      <CentreSelector />

      {/* Indicateurs à droite */}
      <div className="flex items-center gap-4">
        {/* Coût API du mois */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>API :</span>
          <span className="font-medium">{formatEuros(monthlyApiCost)}</span>
        </div>

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
