import { useAppStore } from "@/stores/appStore";
import { Building2, ChevronDown } from "lucide-react";

export function CentreSelector() {
  const { activeCentreId } = useAppStore();

  // Pour l'instant, placeholder statique.
  // Sera connecté à la base de données en Phase 3.
  return (
    <button
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
      aria-label="Sélectionner un centre de formation"
    >
      <Building2 className="h-4 w-4 text-primary" />
      <span className="font-medium">
        {activeCentreId ? "Centre sélectionné" : "Tous les centres"}
      </span>
      <ChevronDown className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
