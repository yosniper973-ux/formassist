import { useState } from "react";
import { Eye, EyeOff, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onNext: (apiKey: string) => void;
}

function validateApiKey(key: string): "empty" | "invalid" | "valid" {
  if (!key) return "empty";
  // La clé doit commencer par sk-ant-api
  if (!key.startsWith("sk-ant-api")) return "invalid";
  // Longueur minimale raisonnable
  if (key.length < 50) return "invalid";
  return "valid";
}

export function Step5EnterKey({ onNext }: Props) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const status = validateApiKey(key.trim());

  function handleNext() {
    if (status !== "valid") return;
    onNext(key.trim());
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Colle ta clé API</h2>
        <p className="mt-2 text-muted-foreground">
          Copie la clé que tu viens de créer sur console.anthropic.com et colle-la ci-dessous.
        </p>
      </div>

      <div className="space-y-3">
        <Label htmlFor="api-key">Clé API Anthropic</Label>
        <div className="relative">
          <Input
            id="api-key"
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-api03-…"
            className="pr-10 font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Validation en temps réel */}
        {key.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            {status === "valid" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-green-600">Format de clé valide ✓</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-destructive">
                  La clé doit commencer par <code className="font-mono">sk-ant-api</code>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Info sécurité */}
      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">🔒 Sécurité</p>
        <p className="mt-1">
          Ta clé sera chiffrée et stockée uniquement sur ton ordinateur. FormAssist
          ne la transmet jamais à personne d'autre qu'Anthropic lors des appels à Claude.
        </p>
      </div>

      <Button
        onClick={handleNext}
        className="w-full"
        size="lg"
        disabled={status !== "valid"}
      >
        Valider et tester la connexion
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
