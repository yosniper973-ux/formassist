import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { Cloud, HardDrive, RefreshCw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { restoreFromCloud } from "@/lib/cloud-backup";
import type { OtherDeviceBackup } from "@/lib/cloud-backup";

interface Props {
  backups: OtherDeviceBackup[];
  onSkip: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function CloudRestoreScreen({ backups, onSkip }: Props) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  async function handleRestore(backup: OtherDeviceBackup) {
    setRestoring(true);
    setError(null);
    try {
      await restoreFromCloud(backup.keyHash, backup.deviceHash);
      setRestored(true);
      // Relancer l'app pour charger la nouvelle base
      setTimeout(() => void relaunch(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRestoring(false);
    }
  }

  if (restored) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Cloud className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-lg font-semibold">Restauration réussie !</p>
          <p className="text-sm text-muted-foreground">FormAssist redémarre…</p>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* En-tête */}
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Cloud className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Données trouvées dans le cloud</h1>
          <p className="text-sm text-muted-foreground">
            Une sauvegarde FormAssist existe pour ta licence sur un autre appareil.
            Tu peux la restaurer sur ce PC maintenant.
          </p>
        </div>

        {/* Liste des sauvegardes disponibles */}
        <div className="space-y-3">
          {backups.map((b) => (
            <Card key={b.deviceHash}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  Sauvegarde du {formatDate(b.updatedAt)}
                </CardTitle>
                {b.size > 0 && (
                  <CardDescription>{formatSize(b.size)}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => void handleRestore(b)}
                  disabled={restoring}
                >
                  {restoring ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Restauration en cours…
                    </>
                  ) : (
                    "Restaurer sur ce PC"
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Erreur */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Avertissement */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠️ La restauration remplacera toutes les données actuelles de ce PC par celles de
          la sauvegarde. Une copie de sécurité est créée automatiquement avant la restauration.
          <br />
          <strong>Après le redémarrage, connecte-toi avec ton ancien mot de passe.</strong>
        </div>

        {/* Ignorer */}
        <div className="text-center">
          <Button
            variant="ghost"
            onClick={onSkip}
            disabled={restoring}
            className="text-muted-foreground"
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Ignorer et démarrer sans restaurer
          </Button>
        </div>
      </div>
    </div>
  );
}
