import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useOnline } from "@/hooks/useOnline";
import { Download, X, Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingUpdate = { version: string; update: any };

export function AppShell() {
  useAutoLock(15);
  useOnline();

  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Vérifie les mises à jour 3 secondes après le démarrage
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
