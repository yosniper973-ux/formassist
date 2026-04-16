import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";

// Chargement paresseux des pages pour réduire le bundle initial
const CentresPage = lazy(() =>
  import("@/features/centres/CentresPage").then((m) => ({ default: m.CentresPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
      <p className="text-muted-foreground">Cette section sera disponible prochainement.</p>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function Router() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Placeholder name="Tableau de bord" />} />
        <Route
          path="/centres"
          element={
            <Suspense fallback={<PageLoader />}>
              <CentresPage />
            </Suspense>
          }
        />
        <Route path="/formations" element={<Placeholder name="Formations" />} />
        <Route path="/apprenants" element={<Placeholder name="Apprenants" />} />
        <Route path="/planning" element={<Placeholder name="Planning" />} />
        <Route path="/generation" element={<Placeholder name="Génération de contenus" />} />
        <Route path="/fiches" element={<Placeholder name="Fiches pédagogiques" />} />
        <Route path="/corrections" element={<Placeholder name="Corrections" />} />
        <Route path="/facturation" element={<Placeholder name="Facturation" />} />
        <Route path="/finances" element={<Placeholder name="Tableau financier" />} />
        <Route path="/statistiques" element={<Placeholder name="Statistiques pédagogiques" />} />
        <Route
          path="/parametres"
          element={
            <Suspense fallback={<PageLoader />}>
              <SettingsPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
