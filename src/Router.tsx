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
const FormationsPage = lazy(() =>
  import("@/features/formations/FormationsPage").then((m) => ({ default: m.FormationsPage })),
);
const ApprenantsPage = lazy(() =>
  import("@/features/apprenants/ApprenantsPage").then((m) => ({ default: m.ApprenantsPage })),
);
const PlanningPage = lazy(() =>
  import("@/features/planning/PlanningPage").then((m) => ({ default: m.PlanningPage })),
);
const StylePage = lazy(() =>
  import("@/features/style/StylePage").then((m) => ({ default: m.StylePage })),
);
const GenerationPage = lazy(() =>
  import("@/features/generation/GenerationPage").then((m) => ({ default: m.GenerationPage })),
);
const FichesPedagoPage = lazy(() =>
  import("@/features/fiches-pedago/FichesPedagoPage").then((m) => ({ default: m.FichesPedagoPage })),
);
const CorrectionsPage = lazy(() =>
  import("@/features/correction/CorrectionsPage").then((m) => ({ default: m.CorrectionsPage })),
);
const DossiersPage = lazy(() =>
  import("@/features/dossiers/DossiersPage").then((m) => ({ default: m.DossiersPage })),
);
const FacturationPage = lazy(() =>
  import("@/features/facturation/FacturationPage").then((m) => ({ default: m.FacturationPage })),
);
const DocumentsPage = lazy(() =>
  import("@/features/documents/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const DashboardPedagoPage = lazy(() =>
  import("@/features/dashboard/DashboardPedagoPage").then((m) => ({ default: m.DashboardPedagoPage })),
);
const DashboardFinancePage = lazy(() =>
  import("@/features/dashboard/DashboardFinancePage").then((m) => ({ default: m.DashboardFinancePage })),
);
const StatistiquesPage = lazy(() =>
  import("@/features/dashboard/StatistiquesPage").then((m) => ({ default: m.StatistiquesPage })),
);
const HelpPage = lazy(() =>
  import("@/features/help/HelpPage").then((m) => ({ default: m.HelpPage })),
);

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export function Router() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            <LazyRoute>
              <DashboardPedagoPage />
            </LazyRoute>
          }
        />
        <Route
          path="/centres"
          element={<LazyRoute><CentresPage /></LazyRoute>}
        />
        <Route
          path="/formations"
          element={<LazyRoute><FormationsPage /></LazyRoute>}
        />
        <Route
          path="/apprenants"
          element={<LazyRoute><ApprenantsPage /></LazyRoute>}
        />
        <Route
          path="/planning"
          element={<LazyRoute><PlanningPage /></LazyRoute>}
        />
        <Route
          path="/style"
          element={<LazyRoute><StylePage /></LazyRoute>}
        />
        <Route
          path="/generation"
          element={<LazyRoute><GenerationPage /></LazyRoute>}
        />
        <Route
          path="/fiches"
          element={<LazyRoute><FichesPedagoPage /></LazyRoute>}
        />
        <Route
          path="/corrections"
          element={<LazyRoute><CorrectionsPage /></LazyRoute>}
        />
        <Route
          path="/dossiers"
          element={<LazyRoute><DossiersPage /></LazyRoute>}
        />
        <Route
          path="/documents"
          element={<LazyRoute><DocumentsPage /></LazyRoute>}
        />
        <Route
          path="/facturation"
          element={<LazyRoute><FacturationPage /></LazyRoute>}
        />
        <Route
          path="/finances"
          element={<LazyRoute><DashboardFinancePage /></LazyRoute>}
        />
        <Route
          path="/statistiques"
          element={<LazyRoute><StatistiquesPage /></LazyRoute>}
        />
        <Route
          path="/parametres"
          element={<LazyRoute><SettingsPage /></LazyRoute>}
        />
        <Route
          path="/aide"
          element={<LazyRoute><HelpPage /></LazyRoute>}
        />
      </Route>
    </Routes>
  );
}
