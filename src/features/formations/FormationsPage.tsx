import { useState, useEffect } from "react";
import {
  Plus,
  GraduationCap,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Calendar,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Formation, Centre } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateShort } from "@/lib/utils";
import { FormationFormDialog } from "./FormationFormDialog";
import { FormationDetail } from "./FormationDetail";

export function FormationsPage() {
  const { activeCentreId } = useAppStore();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editFormation, setEditFormation] = useState<Formation | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Formation | null>(null);

  async function loadFormations() {
    setLoading(true);
    try {
      const allCentres = (await db.getCentres(false)) as unknown as Centre[];
      setCentres(allCentres);

      if (activeCentreId) {
        const rows = (await db.getFormations(activeCentreId)) as unknown as Formation[];
        setFormations(rows);
      } else {
        // Vue globale : toutes les formations de tous les centres actifs
        const all: Formation[] = [];
        for (const centre of allCentres) {
          const rows = (await db.getFormations(centre.id)) as unknown as Formation[];
          all.push(...rows);
        }
        setFormations(all);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFormations();
  }, [activeCentreId]);

  useEffect(() => {
    function handleClick() {
      setMenuOpen(null);
    }
    if (menuOpen) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [menuOpen]);

  function getCentreName(centreId: string): string {
    return centres.find((c) => c.id === centreId)?.name ?? "Centre inconnu";
  }

  function getCentreColor(centreId: string): string {
    return centres.find((c) => c.id === centreId)?.color ?? "#888";
  }

  const filtered = formations.filter(
    (f) =>
      f.title.toLowerCase().includes(search.toLowerCase()) ||
      (f.rncp_code && f.rncp_code.includes(search)),
  );

  // Si on affiche le détail d'une formation
  if (selectedFormation) {
    return (
      <FormationDetail
        formation={selectedFormation}
        onBack={() => {
          setSelectedFormation(null);
          loadFormations();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Formations</h1>
          <p className="text-sm text-muted-foreground">
            {formations.length} formation(s)
            {activeCentreId ? "" : " — tous centres confondus"}
          </p>
        </div>
        <Button onClick={() => { setEditFormation(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" />
          Nouvelle formation
        </Button>
      </div>

      {/* Recherche */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par titre ou code RNCP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">
              {search ? "Aucun résultat" : "Aucune formation"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Essaie un autre terme de recherche."
                : "Crée ta première formation pour commencer."}
            </p>
          </div>
          {!search && (
            <Button onClick={() => { setEditFormation(null); setShowForm(true); }}>
              <Plus className="h-4 w-4" />
              Créer une formation
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="group relative flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
              onClick={() => setSelectedFormation(f)}
            >
              {/* Couleur du centre */}
              <div
                className="h-12 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: getCentreColor(f.centre_id) }}
              />

              {/* Infos */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold text-foreground">{f.title}</h3>
                  {f.rncp_code && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      RNCP {f.rncp_code}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                  {!activeCentreId && (
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: getCentreColor(f.centre_id) }}
                      />
                      {getCentreName(f.centre_id)}
                    </span>
                  )}
                  {f.start_date && f.end_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateShort(f.start_date)} → {formatDateShort(f.end_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Indicateurs */}
              <div className="flex items-center gap-3">
                {f.reac_parsed ? (
                  <Badge variant="default" className="text-xs">
                    <BookOpen className="mr-1 h-3 w-3" />
                    REAC
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Pas de REAC
                  </Badge>
                )}

                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>

              {/* Menu contextuel */}
              <div
                className="absolute right-3 top-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === f.id ? null : f.id);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen === f.id && (
                  <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-lg border bg-card shadow-lg">
                    <button
                      onClick={() => { setEditFormation(f); setShowForm(true); setMenuOpen(null); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => { setMenuOpen(null); setToDelete(f); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <FormationFormDialog
          formation={editFormation}
          centres={centres}
          defaultCentreId={activeCentreId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadFormations(); }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`Supprimer la formation "${toDelete?.title ?? ""}" ?`}
        message={
          "Cette action supprime définitivement la formation ET tout ce qui y est rattaché : REAC (CCP, compétences, critères), groupes, apprenants, plannings, contenus générés, fiches pédagogiques, corrections et factures.\n\nCette action est irréversible."
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (!toDelete) return;
          await db.deleteFormation(toDelete.id);
          setToDelete(null);
          loadFormations();
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
