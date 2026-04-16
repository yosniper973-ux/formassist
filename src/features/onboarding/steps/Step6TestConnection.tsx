import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ChevronLeft, ArrowRight } from "lucide-react";
import { testConnection } from "@/lib/claude";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type TestStatus = "testing" | "success" | "error";

interface Props {
  apiKey: string;
  onNext: () => void;
  onBack: () => void;
}

const ERROR_HINTS: Record<string, string> = {
  "Clé API invalide":
    "La clé que tu as saisie ne fonctionne pas. Retourne à l'étape précédente et vérifie qu'elle est complète et sans espace.",
  "pas de crédit":
    "Ton compte Anthropic n'a pas encore de crédit. Retourne à l'étape 3 pour en ajouter.",
  internet:
    "FormAssist ne peut pas se connecter à internet. Vérifie ta connexion Wi-Fi ou réseau.",
};

function getHint(error: string): string {
  for (const [key, hint] of Object.entries(ERROR_HINTS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) return hint;
  }
  return "Retourne à l'étape précédente et vérifie ta clé, puis réessaie.";
}

export function Step6TestConnection({ apiKey, onNext, onBack }: Props) {
  const [status, setStatus] = useState<TestStatus>("testing");
  const [errorMessage, setErrorMessage] = useState("");

  async function runTest() {
    setStatus("testing");
    setErrorMessage("");

    const result = await testConnection(apiKey);

    if (result.success) {
      setStatus("success");
    } else {
      setStatus("error");
      setErrorMessage(result.error ?? "Erreur inconnue.");
    }
  }

  useEffect(() => {
    runTest();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Test de connexion</h2>
        <p className="mt-2 text-muted-foreground">
          On vérifie que ta clé API fonctionne correctement…
        </p>
      </div>

      {/* État du test */}
      <div className="flex flex-col items-center gap-6 py-8">
        {status === "testing" && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Test en cours…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                On envoie un message de test à Claude.
              </p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-green-700">Connexion réussie !</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Claude répond correctement. Tout est prêt.
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
            <div className="w-full space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Connexion échouée</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-medium text-foreground">Que faire ?</p>
                <p className="mt-1 text-muted-foreground">{getHint(errorMessage)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {status === "success" && (
          <Button onClick={onNext} className="w-full" size="lg">
            Parfait, on continue !
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}

        {status === "error" && (
          <>
            <Button onClick={runTest} variant="outline" className="w-full" size="lg">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
            <Button onClick={onBack} variant="ghost" className="w-full">
              <ChevronLeft className="h-4 w-4" />
              Revenir et corriger la clé
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
