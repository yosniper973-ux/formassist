// Configuration centrale de la navigation : route, emoji, libellé, couleur signature.
// Utilisé par la Sidebar (couleurs de survol/actif) et l'AppShell (dégradé de fond).

export interface NavItem {
  to: string;
  emoji: string;
  label: string;
  /** Section logique pour grouper visuellement la sidebar */
  section: "Pilotage" | "Formation" | "Création" | "Gestion" | "Autre";
  /** Couleur signature pleine (HEX) — utilisée pour bordure active et bouton primaire */
  accent: string;
  /** Fond très clair (HEX) — survol et actif */
  accentSoft: string;
  /** Bordure douce (HEX) — survol et actif */
  accentBorder: string;
  /** Ombre colorée (rgba ou hex+alpha hex) */
  accentGlow: string;
  /** Couleurs du dégradé d'arrière-plan de page */
  grad1: string;
  grad2: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/", emoji: "🏆", label: "Tableau de bord", section: "Pilotage",
    accent: "#7C3AED", accentSoft: "#F1E9FF", accentBorder: "#DDD0F7",
    accentGlow: "rgba(124,58,237,0.25)", grad1: "#F3E8FF", grad2: "#FCE7F3",
  },
  {
    to: "/statistiques", emoji: "📊", label: "Statistiques", section: "Pilotage",
    accent: "#EF4444", accentSoft: "#FEE2E2", accentBorder: "#FCA5A5",
    accentGlow: "rgba(239,68,68,0.25)", grad1: "#FEE2E2", grad2: "#FED7AA",
  },
  {
    to: "/centres", emoji: "🏫", label: "Centres", section: "Formation",
    accent: "#2563EB", accentSoft: "#DBEAFE", accentBorder: "#93C5FD",
    accentGlow: "rgba(37,99,235,0.25)", grad1: "#DBEAFE", grad2: "#E0F2FE",
  },
  {
    to: "/formations", emoji: "🎓", label: "Formations", section: "Formation",
    accent: "#EC4899", accentSoft: "#FCE7F3", accentBorder: "#F9A8D4",
    accentGlow: "rgba(236,72,153,0.25)", grad1: "#FCE7F3", grad2: "#FBCFE8",
  },
  {
    to: "/apprenants", emoji: "👩‍🎓", label: "Apprenants", section: "Formation",
    accent: "#22C55E", accentSoft: "#DCFCE7", accentBorder: "#86EFAC",
    accentGlow: "rgba(34,197,94,0.25)", grad1: "#DCFCE7", grad2: "#D1FAE5",
  },
  {
    to: "/planning", emoji: "📅", label: "Planning", section: "Formation",
    accent: "#F97316", accentSoft: "#FFEDD5", accentBorder: "#FDBA74",
    accentGlow: "rgba(249,115,22,0.25)", grad1: "#FFEDD5", grad2: "#FEF3C7",
  },
  {
    to: "/style", emoji: "🎨", label: "Profil de style", section: "Création",
    accent: "#D946EF", accentSoft: "#FAE8FF", accentBorder: "#F0ABFC",
    accentGlow: "rgba(217,70,239,0.25)", grad1: "#FAE8FF", grad2: "#F5D0FE",
  },
  {
    to: "/generation", emoji: "✨", label: "Génération", section: "Création",
    accent: "#6366F1", accentSoft: "#E0E7FF", accentBorder: "#A5B4FC",
    accentGlow: "rgba(99,102,241,0.25)", grad1: "#E0E7FF", grad2: "#EDE9FE",
  },
  {
    to: "/fiches", emoji: "📝", label: "Fiches pédago", section: "Création",
    accent: "#0EA5E9", accentSoft: "#E0F2FE", accentBorder: "#7DD3FC",
    accentGlow: "rgba(14,165,233,0.25)", grad1: "#E0F2FE", grad2: "#CFFAFE",
  },
  {
    to: "/corrections", emoji: "✅", label: "Corrections", section: "Création",
    accent: "#14B8A6", accentSoft: "#CCFBF1", accentBorder: "#5EEAD4",
    accentGlow: "rgba(20,184,166,0.25)", grad1: "#CCFBF1", grad2: "#D1FAE5",
  },
  {
    to: "/dossiers", emoji: "📂", label: "Dossiers DP / Projet", section: "Création",
    accent: "#F59E0B", accentSoft: "#FEF3C7", accentBorder: "#FCD34D",
    accentGlow: "rgba(245,158,11,0.25)", grad1: "#FEF3C7", grad2: "#FFEDD5",
  },
  {
    to: "/documents", emoji: "📤", label: "Documents & Envoi", section: "Gestion",
    accent: "#8B5CF6", accentSoft: "#EDE9FE", accentBorder: "#C4B5FD",
    accentGlow: "rgba(139,92,246,0.25)", grad1: "#EDE9FE", grad2: "#E0E7FF",
  },
  {
    to: "/facturation", emoji: "🧾", label: "Facturation", section: "Gestion",
    accent: "#CA8A04", accentSoft: "#FEF9C3", accentBorder: "#FDE68A",
    accentGlow: "rgba(202,138,4,0.25)", grad1: "#FEF9C3", grad2: "#FEF3C7",
  },
  {
    to: "/finances", emoji: "💰", label: "Finances", section: "Gestion",
    accent: "#10B981", accentSoft: "#D1FAE5", accentBorder: "#6EE7B7",
    accentGlow: "rgba(16,185,129,0.25)", grad1: "#D1FAE5", grad2: "#CCFBF1",
  },
];

export const FOOTER_NAV_ITEMS: NavItem[] = [
  {
    to: "/aide", emoji: "💡", label: "Aide", section: "Autre",
    accent: "#0891B2", accentSoft: "#CFFAFE", accentBorder: "#67E8F9",
    accentGlow: "rgba(8,145,178,0.25)", grad1: "#CFFAFE", grad2: "#E0F2FE",
  },
  {
    to: "/parametres", emoji: "⚙️", label: "Paramètres", section: "Autre",
    accent: "#64748B", accentSoft: "#F1F5F9", accentBorder: "#CBD5E1",
    accentGlow: "rgba(100,116,139,0.25)", grad1: "#F1F5F9", grad2: "#E2E8F0",
  },
];

const ALL_ITEMS = [...NAV_ITEMS, ...FOOTER_NAV_ITEMS];

export function getNavItemForPath(pathname: string): NavItem {
  // Match exact, sinon match du préfixe le plus long (pour les routes imbriquées)
  const exact = ALL_ITEMS.find((it) => it.to === pathname);
  if (exact) return exact;
  const matches = ALL_ITEMS
    .filter((it) => it.to !== "/" && pathname.startsWith(it.to))
    .sort((a, b) => b.to.length - a.to.length);
  return matches[0] ?? ALL_ITEMS[0]!;
}
