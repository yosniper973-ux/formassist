import { useState, useEffect } from "react";
import {
  Plus,
  Building2,
  Archive,
  Pin,
  PinOff,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import type { Centre } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CentreFormDialog } from "./CentreFormDialog";

export function CentresPage() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCentre, setEditCentre] = useState<Centre | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Centre | null>(null);

  async function loadCentres() {
    setLoading(true);
    try {
      const rows = await db.getCentres(showArchived);
      setCentres(rows as unknown as Centre[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCentres();
  }, [showArchived]);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    function handleClick() {
      setMenuOpen(null);
    }
    if (menuOpen) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [menuOpen]);

  const filtered = centres.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const pinned = filtered.filter((c) => c.pinned);
  const unpinned = filtered.filter((c) => !c.pinned);

  async function togglePin(centre: Centre) {
    await db.updateCentre(centre.id, { pinned: !centre.pinned ? 1 : 0 });
    loadCentres();
  }

  async function archiveCentre(centre: Centre) {
    if (!confirm(`Archiver "${centre.name}" ? Tu pourras le réactiver plus tard.`)) return;
    await db.archiveCentre(centre.id);
    loadCentres();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await db.deleteCentre(toDelete.id);
    setToDelete(null);
    loadCentres();
  }

  function openCreate() {
    setEditCentre(null);
    setShowForm(true);
  }

  function openEdit(centre: Centre) {
    setEditCentre(centre);
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centres de formation</h1>
          <p className="text-sm text-muted-foreground">
            {centres.filter((c) => !c.archived_at).length} centre(s) actif(s)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouveau centre
        </Button>
      </div>

      {/* Barre de recherche + filtres */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un centre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="h-3.5 w-3.5" />
          Archivés
        </Button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={openCreate} hasSearch={!!search} />
      ) : (
        <div className="space-y-6">
          {/* Centres épinglés */}
          {pinned.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Épinglés
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((c) => (
                  <CentreCard
                    key={c.id}
                    centre={c}
                    menuOpen={menuOpen === c.id}
                    onMenuToggle={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === c.id ? null : c.id);
                    }}
                    onEdit={() => openEdit(c)}
                    onTogglePin={() => togglePin(c)}
                    onArchive={() => archiveCentre(c)}
                    onDelete={() => {
                      setMenuOpen(null);
                      setToDelete(c);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Autres centres */}
          {unpinned.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tous les centres
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unpinned.map((c) => (
                  <CentreCard
                    key={c.id}
                    centre={c}
                    menuOpen={menuOpen === c.id}
                    onMenuToggle={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === c.id ? null : c.id);
                    }}
                    onEdit={() => openEdit(c)}
                    onTogglePin={() => togglePin(c)}
                    onArchive={() => archiveCentre(c)}
                    onDelete={() => {
                      setMenuOpen(null);
                      setToDelete(c);
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Formulaire création/édition */}
      {showForm && (
        <CentreFormDialog
          centre={editCentre}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadCentres();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`Supprimer "${toDelete?.name ?? ""}" ?`}
        message={
          "Cette action supprime définitivement le centre ET toutes les formations, groupes, apprenants, plannings, contenus générés, corrections et factures liés.\n\n" +
          "Si tu veux juste le masquer, utilise plutôt « Archiver »."
        }
        confirmLabel="Supprimer définitivement"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte centre
// ─────────────────────────────────────────────────────────────────────────────

interface CentreCardProps {
  centre: Centre;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function CentreCard({
  centre,
  menuOpen,
  onMenuToggle,
  onEdit,
  onTogglePin,
  onArchive,
  onDelete,
}: CentreCardProps) {
  return (
    <div className="relative rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Couleur + nom */}
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: centre.color + "20" }}
        >
          <Building2 className="h-5 w-5" style={{ color: centre.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-foreground">{centre.name}</h3>
            {centre.pinned && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {centre.archived_at && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                Archivé
              </Badge>
            )}
          </div>
          {centre.referent_name && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {centre.referent_name}
            </p>
          )}
          {centre.hourly_rate && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {centre.hourly_rate} €/h
            </p>
          )}
        </div>
      </div>

      {/* Menu contextuel */}
      <div className="absolute right-3 top-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-lg border bg-card shadow-lg">
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </button>
            <button
              type="button"
              onClick={onTogglePin}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              {centre.pinned ? (
                <>
                  <PinOff className="h-3.5 w-3.5" />
                  Désépingler
                </>
              ) : (
                <>
                  <Pin className="h-3.5 w-3.5" />
                  Épingler
                </>
              )}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={onArchive}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <Archive className="h-3.5 w-3.5" />
              Archiver
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// État vide
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  onCreate,
  hasSearch,
}: {
  onCreate: () => void;
  hasSearch: boolean;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Search className="h-10 w-10 opacity-30" />
        <p>Aucun centre ne correspond à ta recherche.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Building2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground">Aucun centre de formation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Commence par ajouter le premier centre pour lequel tu travailles.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" />
        Ajouter mon premier centre
      </Button>
    </div>
  );
}
