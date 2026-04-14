import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
      <p className="text-muted-foreground">Cette section sera disponible prochainement.</p>
    </div>
  );
}

export function Router() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Placeholder name="Tableau de bord" />} />
        <Route path="/centres" element={<Placeholder name="Centres de formation" />} />
        <Route path="/formations" element={<Placeholder name="Formations" />} />
        <Route path="/apprenants" element={<Placeholder name="Apprenants" />} />
        <Route path="/planning" element={<Placeholder name="Planning" />} />
        <Route path="/generation" element={<Placeholder name="Génération de contenus" />} />
        <Route path="/fiches" element={<Placeholder name="Fiches pédagogiques" />} />
        <Route path="/corrections" element={<Placeholder name="Corrections" />} />
        <Route path="/facturation" element={<Placeholder name="Facturation" />} />
        <Route path="/finances" element={<Placeholder name="Tableau financier" />} />
        <Route path="/statistiques" element={<Placeholder name="Statistiques pédagogiques" />} />
        <Route path="/parametres" element={<Placeholder name="Paramètres" />} />
      </Route>
    </Routes>
  );
}
