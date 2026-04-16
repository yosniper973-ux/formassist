import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Pin, Layers } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { db } from "@/lib/db";
import type { Centre } from "@/types";

export function CentreSelector() {
  const { activeCentreId, setActiveCentreId } = useAppStore();
  const [open, setOpen] = useState(false);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [activeCentre, setActiveCentre] = useState<Centre | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCentres();
  }, []);

  useEffect(() => {
    if (activeCentreId && centres.length > 0) {
      setActiveCentre(centres.find((c) => c.id === activeCentreId) ?? null);
    } else {
      setActiveCentre(null);
    }
  }, [activeCentreId, centres]);

  // Fermer au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function loadCentres() {
    try {
      const rows = await db.getCentres(false);
      setCentres(rows as unknown as Centre[]);
    } catch {
      // Silencieux en dev sans Tauri
    }
  }

  function select(id: string | null) {
    setActiveCentreId(id);
    setOpen(false);
  }

  const pinned = centres.filter((c) => c.pinned);
  const unpinned = centres.filter((c) => !c.pinned);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        aria-label="Sélectionner un centre de formation"
        aria-expanded={open}
      >
        {activeCentre ? (
          <>
            <div
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ backgroundColor: activeCentre.color }}
            />
            <span className="max-w-[160px] truncate font-medium">{activeCentre.name}</span>
          </>
        ) : (
          <>
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-medium">Tous les centres</span>
          </>
        )}
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] max-w-xs rounded-lg border bg-card shadow-lg">
          <div className="p-1">
            {/* Vue globale */}
            <button
              onClick={() => select(null)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left font-medium">Tous les centres</span>
              {!activeCentreId && <Check className="h-4 w-4 text-primary" />}
            </button>

            {centres.length > 0 && <div className="my-1 h-px bg-border" />}

            {/* Épinglés */}
            {pinned.map((c) => (
              <CentreOption
                key={c.id}
                centre={c}
                selected={activeCentreId === c.id}
                onSelect={() => select(c.id)}
              />
            ))}

            {/* Autres */}
            {pinned.length > 0 && unpinned.length > 0 && (
              <div className="my-1 h-px bg-border" />
            )}
            {unpinned.map((c) => (
              <CentreOption
                key={c.id}
                centre={c}
                selected={activeCentreId === c.id}
                onSelect={() => select(c.id)}
              />
            ))}

            {centres.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Aucun centre — crée-en un dans "Centres".
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CentreOption({
  centre,
  selected,
  onSelect,
}: {
  centre: Centre;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent"
    >
      <div
        className="h-3.5 w-3.5 shrink-0 rounded-full"
        style={{ backgroundColor: centre.color }}
      />
      <span className="flex-1 truncate text-left font-medium">{centre.name}</span>
      <div className="flex items-center gap-1">
        {centre.pinned && <Pin className="h-3 w-3 text-muted-foreground" />}
        {selected && <Check className="h-4 w-4 text-primary" />}
      </div>
    </button>
  );
}
