import { useEffect } from "react";
import { Check, X, FolderOpen, ExternalLink } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

interface DownloadToastProps {
  path: string;
  name: string;
  onClose: () => void;
}

export function DownloadToast({ path, name, onClose }: DownloadToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(t);
  }, [onClose]);

  const openFile = async () => {
    try { await shellOpen(path); } catch (e) { console.error(e); }
  };

  const openFolder = async () => {
    try {
      // Extrait le dossier parent (compatible Windows \ et Unix /)
      const dir = path.replace(/[\\/][^\\/]*$/, "");
      await shellOpen(dir);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 shadow-lg animate-in slide-in-from-bottom-4 max-w-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
        <Check className="h-4 w-4 text-green-700" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-green-900">Fichier téléchargé ✓</p>
        <p className="mt-0.5 truncate text-xs text-green-800/80" title={path}>
          {name}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={openFile}
            className="flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            <ExternalLink className="h-3 w-3" /> Ouvrir
          </button>
          <button
            onClick={openFolder}
            className="flex items-center gap-1 rounded-md border border-green-300 bg-white px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
          >
            <FolderOpen className="h-3 w-3" /> Dossier
          </button>
        </div>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded p-1 text-green-700 hover:bg-green-100"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
