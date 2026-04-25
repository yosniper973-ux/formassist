import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, FOOTER_NAV_ITEMS, type NavItem } from "./navConfig";

const SECTIONS = ["Pilotage", "Formation", "Création", "Gestion"] as const;

function NavRow({ item }: { item: NavItem }) {
  // Variables CSS injectées par item — utilisées uniquement par .nav-item via :hover et &.active
  const style: React.CSSProperties = {
    // @ts-expect-error CSS custom properties
    "--accent": item.accent,
    "--accent-soft": item.accentSoft,
    "--accent-border": item.accentBorder,
    "--accent-glow": item.accentGlow,
  };
  return (
    <NavLink
      to={item.to}
      style={style}
      className={({ isActive }) =>
        cn(
          "nav-item flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-all duration-150",
          "border border-transparent text-muted-foreground",
          "hover:[background-color:var(--accent-soft)] hover:[color:var(--accent)] hover:[border-color:var(--accent-border)] hover:translate-x-0.5",
          isActive &&
            "[background-color:var(--accent-soft)] [color:var(--accent)] [border-color:var(--accent-border)] font-semibold shadow-[0_4px_12px_-4px_var(--accent-glow)]",
        )
      }
    >
      <span className="text-[22px] leading-none drop-shadow-sm">{item.emoji}</span>
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside
      className="flex h-full w-60 flex-col border-r"
      style={{ background: "hsl(var(--sidebar))" }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="text-2xl drop-shadow-sm">✨</span>
        <span className="text-lg font-bold text-foreground">FormAssist</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        {SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((i) => i.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-3">
              <div className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {section}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavRow key={item.to} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Aide + Paramètres en bas */}
      <div className="border-t p-3 space-y-0.5">
        {FOOTER_NAV_ITEMS.map((item) => (
          <NavRow key={item.to} item={item} />
        ))}
      </div>
    </aside>
  );
}
