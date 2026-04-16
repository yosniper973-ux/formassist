import { useState, useEffect } from "react";
import { AlertTriangle, X, Copy, ChevronDown, ChevronUp, Bug } from "lucide-react";
import { onError, getErrorLog, generateErrorReport } from "@/lib/errorHandler";
import type { AppError } from "@/lib/errorHandler";
import { Button } from "@/components/ui/button";

/**
 * Composant toast d'erreur — s'affiche en bas à droite de l'écran
 * quand une erreur est capturée par le errorHandler.
 */
export function ErrorToast() {
  const [currentError, setCurrentError] = useState<AppError | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = onError((error) => {
      setCurrentError(error);
      setShowDetails(false);
      // Auto-dismiss after 15 seconds
      setTimeout(() => setCurrentError(null), 15000);
    });
    return unsubscribe;
  }, []);

  async function copyErrorCode() {
    if (!currentError) return;
    const text = `Code: ${currentError.code}\nMessage: ${currentError.message}\nDétails: ${currentError.details}\nModule: ${currentError.module}\nHeure: ${currentError.timestamp}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyFullReport() {
    const report = generateErrorReport();
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!currentError && !showLog) return null;

  return (
    <>
      {/* Toast d'erreur individuelle */}
      {currentError && (
        <div className="fixed bottom-4 right-4 z-[100] w-96 max-w-[90vw] animate-in slide-in-from-bottom-2">
          <div className="rounded-lg border border-red-200 bg-red-50 shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                    {currentError.code}
                  </span>
                  <button
                    className="ml-auto text-red-400 hover:text-red-600"
                    onClick={() => setCurrentError(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-medium text-red-800 mt-1">
                  {currentError.message}
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  Module : {currentError.module}
                </p>
              </div>
            </div>

            {/* Toggle details */}
            <button
              className="w-full flex items-center justify-center gap-1 text-xs text-red-500 hover:text-red-700 py-1.5 border-t border-red-200 hover:bg-red-100/50"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showDetails ? "Masquer les détails" : "Voir les détails"}
            </button>

            {/* Details */}
            {showDetails && (
              <div className="px-4 pb-3 border-t border-red-200 bg-red-100/30">
                <pre className="text-[11px] text-red-700 whitespace-pre-wrap break-all mt-2 font-mono">
                  {currentError.details}
                </pre>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-red-200 text-red-700 hover:bg-red-100"
                    onClick={copyErrorCode}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {copied ? "Copié !" : "Copier le code"}
                  </Button>
                </div>
                <p className="text-[10px] text-red-500 mt-2">
                  💡 Copie ce code et donne-le à Claude pour qu'il corrige le problème.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bouton log (en bas à gauche, toujours visible s'il y a des erreurs) */}
      {getErrorLog().length > 0 && (
        <ErrorLogButton
          showLog={showLog}
          onToggle={() => setShowLog(!showLog)}
          onCopyReport={copyFullReport}
          copied={copied}
        />
      )}
    </>
  );
}

function ErrorLogButton({
  showLog,
  onToggle,
  onCopyReport,
  copied,
}: {
  showLog: boolean;
  onToggle: () => void;
  onCopyReport: () => void;
  copied: boolean;
}) {
  const errors = getErrorLog();

  return (
    <>
      {/* Bouton flottant */}
      <button
        className="fixed bottom-4 left-4 z-[99] flex items-center gap-1.5 rounded-full bg-red-100 border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-200 shadow-sm"
        onClick={onToggle}
        title="Voir le journal d'erreurs"
      >
        <Bug className="h-3.5 w-3.5" />
        {errors.length} erreur{errors.length !== 1 ? "s" : ""}
      </button>

      {/* Panel log */}
      {showLog && (
        <div className="fixed bottom-12 left-4 z-[99] w-[500px] max-w-[90vw] max-h-[60vh] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-border bg-muted">
            <h3 className="text-sm font-semibold">Journal d'erreurs</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={onCopyReport}
              >
                <Copy className="h-3 w-3 mr-1" />
                {copied ? "Copié !" : "Copier le rapport"}
              </Button>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={onToggle}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-[50vh] p-2 space-y-2">
            {errors
              .slice()
              .reverse()
              .map((e, i) => (
                <div key={i} className="rounded border border-border p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-red-600 bg-red-50 px-1 rounded">
                      {e.code}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString("fr-FR")}
                    </span>
                  </div>
                  <p className="font-medium mt-1">{e.message}</p>
                  <p className="text-muted-foreground truncate">{e.details}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
