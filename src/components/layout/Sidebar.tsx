import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Users,
  Calendar,
  Sparkles,
  FileText,
  CheckCircle,
  Send,
  Receipt,
  BarChart3,
  Settings,
  PiggyBank,
  Palette,
  HelpCircle,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Tableau de bord" },
  { to: "/centres", icon: Building2, label: "Centres" },
  { to: "/formations", icon: GraduationCap, label: "Formations" },
  { to: "/apprenants", icon: Users, label: "Apprenants" },
  { to: "/planning", icon: Calendar, label: "Planning" },
  { to: "/style", icon: Palette, label: "Profil de style" },
  { to: "/generation", icon: Sparkles, label: "Génération" },
  { to: "/fiches", icon: FileText, label: "Fiches pédago" },
  { to: "/corrections", icon: CheckCircle, label: "Corrections" },
  { to: "/dossiers", icon: FolderOpen, label: "Dossiers DP / Projet" },
  { to: "/documents", icon: Send, label: "Documents & Envoi" },
  { to: "/facturation", icon: Receipt, label: "Facturation" },
  { to: "/finances", icon: PiggyBank, label: "Finances" },
  { to: "/statistiques", icon: BarChart3, label: "Statistiques" },
] as const;

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 flex-col border-r" style={{ background: "hsl(var(--sidebar))" }}>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Sparkles className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-foreground">FormAssist</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Aide + Paramètres en bas */}
      <div className="border-t p-3 space-y-1">
        <NavLink
          to="/aide"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <HelpCircle className="h-4 w-4" />
          <span>Aide</span>
        </NavLink>
        <NavLink
          to="/parametres"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <Settings className="h-4 w-4" />
          <span>Paramètres</span>
        </NavLink>
      </div>
    </aside>
  );
}
