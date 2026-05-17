/** Applique le thème sur <html> et persiste en DB */
export async function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/** Charge le thème depuis la DB et l'applique au démarrage */
export async function initTheme(getConfig: (key: string) => Promise<string | null>) {
  const saved = await getConfig("theme").catch(() => null);
  const theme = saved === "dark" ? "dark" : "light";
  applyTheme(theme);
  return theme;
}
