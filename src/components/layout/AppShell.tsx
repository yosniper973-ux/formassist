import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { HelpBanner } from "@/components/help/HelpBanner";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useOnline } from "@/hooks/useOnline";
import { useAppStore } from "@/stores/appStore";
import { db } from "@/lib/db";
import { Download, X, Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingUpdate = { version: string; update: any };

// Bandeaux d'aide contextuels par route
const ROUTE_HELP: Record<string, { id: string; title: string; description: string; tip?: string }> = {
  "/": {
    id: "dashboard",
    title: "Tableau de bord pédagogique",
    description: "Ici tu vois en un coup d'œil l'avancement de tes formations, le nombre d'apprenants, et les derniers contenus générés. C'est ta page d'accueil.",
    tip: "Commence par créer un centre (menu Centres), puis une formation, avant d'utiliser les autres sections.",
  },
  "/centres": {
    id: "centres",
    title: "Centres de formation",
    description: "Un centre représente l'organisme pour lequel tu travailles (ex : AFPA Paris, CFA Loire…). Tu peux en avoir plusieurs. Chaque formation est rattachée à un centre.",
    tip: "Remplis bien les coordonnées bancaires (RIB/IBAN) car elles apparaissent automatiquement sur tes factures.",
  },
  "/formations": {
    id: "formations",
    title: "Formations",
    description: "Chaque formation correspond à un titre professionnel que tu dispenses (ex : MSADS, ADVF…). Crée ta formation, puis importe le PDF du REAC pour que l'IA connaisse toutes les compétences.",
    tip: "Le REAC est crucial : c'est lui qui permet à Claude de générer des contenus parfaitement adaptés à ton titre professionnel.",
  },
  "/apprenants": {
    id: "apprenants",
    title: "Apprenants",
    description: "Gère ici tes groupes et la liste de tes apprenants. Tu peux saisir leurs informations manuellement ou importer un fichier CSV.",
    tip: "Note le niveau et le rythme d'apprentissage de chaque apprenant — ces infos seront utilisées pour personnaliser les contenus générés.",
  },
  "/planning": {
    id: "planning",
    title: "Planning",
    description: "Visualise et gère ton calendrier de formation. Crée des créneaux (journées, demi-journées), assigne-les à des groupes, et détecte les conflits automatiquement.",
    tip: "Tu peux importer un planning depuis un fichier Excel ou CSV si ton coordinateur te l'envoie dans ce format.",
  },
  "/style": {
    id: "style",
    title: "Profil de style pédagogique",
    description: "Décris ta façon d'enseigner en quelques phrases, et Claude analysera ton style pour que tous les contenus générés te ressemblent vraiment. C'est comme lui donner ta 'signature pédagogique'.",
    tip: "Plus ta description est précise (exemples concrets, façon de t'adresser aux apprenants), meilleure sera l'analyse.",
  },
  "/generation": {
    id: "generation",
    title: "Génération de contenu",
    description: "Génère en quelques secondes des cours, exercices, jeux pédagogiques ou mises en situation grâce à Claude. Sélectionne une formation et un type de contenu, puis laisse l'IA travailler.",
    tip: "Le bouton 'Estimer le coût' te montre le prix avant de lancer la génération. Pour les textes longs (cours complets), utilise Claude Opus pour la meilleure qualité.",
  },
  "/fiches": {
    id: "fiches",
    title: "Fiches pédagogiques",
    description: "Crée et gère tes fiches de déroulement de séance. Claude peut t'aider à rédiger les phases pédagogiques, les objectifs et les modalités d'évaluation.",
    tip: "Une fiche bien construite te sert de guide le jour J ET de trace écrite pour les contrôles qualité.",
  },
  "/corrections": {
    id: "corrections",
    title: "Corrections",
    description: "Claude corrige les exercices ou productions de tes apprenants selon une grille critériée. Sélectionne la formation, le groupe, l'apprenant, puis cole ou tape le travail à corriger.",
    tip: "Tu peux définir les critères d'évaluation manuellement ou laisser Claude les proposer à partir du REAC.",
  },
  "/documents": {
    id: "documents",
    title: "Documents & Envoi",
    description: "Envoie des emails à tes coordinateurs, apprenants ou centres directement depuis FormAssist. Les modèles de mails peuvent être rédigés par Claude.",
    tip: "Configure d'abord ton compte email dans les Paramètres (section SMTP) pour pouvoir envoyer.",
  },
  "/facturation": {
    id: "facturation",
    title: "Facturation",
    description: "Crée et gère tes factures. Les informations du centre (adresse, RIB) et tes tarifs sont pré-remplis automatiquement. Tu peux passer les factures en 'Envoyée', puis 'Payée'.",
    tip: "Utilise les ajustements (+ ou –) pour ajouter des frais de déplacement ou déduire des absences.",
  },
  "/finances": {
    id: "finances",
    title: "Tableau de bord financier",
    description: "Vue synthétique de tes revenus du mois, des factures en attente, et du coût de l'API Claude consommée ce mois-ci.",
    tip: "Le coût API est mis à jour en temps réel après chaque génération. Ton budget mensuel se configure dans Paramètres.",
  },
  "/statistiques": {
    id: "statistiques",
    title: "Statistiques",
    description: "Retrouve ici les statistiques pédagogiques de tes formations : progression, taux de couverture des compétences, historique des contenus générés.",
  },
};

export function AppShell() {
  useAutoLock(15);
  useOnline();

  const location = useLocation();
  const setMonthlyApiCost = useAppStore((s) => s.setMonthlyApiCost);
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const update = await checkUpdate();
        if (update) setPending({ version: update.version, update });
      } catch {
        // Silencieux si pas de réseau ou endpoint absent
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Synchronise le coût API mensuel (header) depuis la DB à chaque navigation
  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const cost = await db.getMonthlyApiCost(monthStart);
        setMonthlyApiCost(cost);
      } catch {
        // Silencieux si DB pas prête
      }
    })();
  }, [location.pathname, setMonthlyApiCost]);

  async function handleInstall() {
    if (!pending) return;
    setInstalling(true);
    try {
      await pending.update.downloadAndInstall(() => {});
      await relaunch();
    } catch {
      setInstalling(false);
    }
  }

  const routeHelp = ROUTE_HELP[location.pathname];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        {/* Bannière mise à jour */}
        {pending && !dismissed && (
          <div className="flex items-center justify-between border-b bg-primary/10 px-6 py-2 text-sm">
            <span className="font-medium text-primary">
              Nouvelle version disponible : <strong>v{pending.version}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {installing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                {installing ? "Installation…" : "Mettre à jour"}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Ignorer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">
          {/* Bandeau d'aide contextuel (première visite seulement) */}
          {routeHelp && (
            <HelpBanner
              id={routeHelp.id}
              title={routeHelp.title}
              description={routeHelp.description}
              tip={routeHelp.tip}
            />
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
