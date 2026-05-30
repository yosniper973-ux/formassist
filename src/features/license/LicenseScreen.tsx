import { useState } from "react";
import { Key, ArrowLeft, Loader2, Check, ShieldCheck, Clock } from "lucide-react";
import { activateKey, startTrial } from "@/lib/license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Screen = "offer" | "key_input" | "expired";

interface Props {
  /** "no_license" → écran offre essai / "expired_trial" ou "expired_key" → écran expiré */
  initialScreen: "offer" | "expired";
  onActivated: () => void;
}

export function LicenseScreen({ initialScreen, onActivated }: Props) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [startingTrial, setStartingTrial] = useState(false);

  async function handleStartTrial() {
    setStartingTrial(true);
    try {
      await startTrial();
      onActivated();
    } catch (err) {
      console.error("Erreur démarrage essai :", err);
      setStartingTrial(false);
    }
  }

  async function handleActivate() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await activateKey(trimmed);
      if (result.valid) {
        setStatus("idle");
        onActivated();
      } else {
        setStatus("error");
        setErrorMsg(result.reason);
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue.");
    }
  }

  // ─── Écran 1 : Offre essai gratuit ───────────────────────────
  if (screen === "offer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-8">
          {/* Logo / titre */}
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FormAssist</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              L'assistant pédagogique des formateurs indépendants.
            </p>
          </div>

          {/* Card offre */}
          <div className="rounded-xl border bg-card p-6 space-y-5 shadow-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Essai gratuit 14 jours</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Accès complet pendant 14 jours, sans engagement et sans carte bancaire.
                Tes données restent sur ton ordinateur.
              </p>
            </div>

            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {[
                "Génération de cours, exercices et fiches pédagogiques",
                "Facturation et livre des recettes automatique",
                "Suivi des apprenants et des compétences REAC",
                "Données 100 % locales, jamais partagées",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>

            <Button
              className="w-full"
              onClick={handleStartTrial}
              disabled={startingTrial}
            >
              {startingTrial ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Démarrer l'essai gratuit
            </Button>
          </div>

          {/* Lien clé */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setScreen("key_input")}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              J'ai déjà une clé d'activation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Écran 3 : Essai ou clé expirés ──────────────────────────
  if (screen === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Période d'essai terminée</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ton essai gratuit de 14 jours est arrivé à son terme.
              Pour continuer à utiliser FormAssist, active une licence.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
            <div className="text-center space-y-1">
              <p className="text-3xl font-bold">39 €</p>
              <p className="text-sm text-muted-foreground">/mois — accès complet</p>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Moins d'une heure de formation. Annulable à tout moment.
            </p>

            <Button
              className="w-full"
              onClick={() => setScreen("key_input")}
            >
              <Key className="mr-2 h-4 w-4" />
              Entrer une clé d'activation
            </Button>
          </div>

          <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground text-center">
            Toutes tes données (formations, apprenants, factures) sont conservées
            sur ton ordinateur et restent accessibles dès l'activation.
          </div>
        </div>
      </div>
    );
  }

  // ─── Écran 2 : Saisie de clé ──────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Key className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Activer FormAssist</h1>
          <p className="text-sm text-muted-foreground">
            Saisis ta clé d'activation pour déverrouiller l'application.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
          <div className="space-y-2">
            <label htmlFor="license-key" className="text-sm font-medium">
              Clé d'activation
            </label>
            <Input
              id="license-key"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setStatus("idle");
                setErrorMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleActivate()}
              placeholder="FA-TEST-202606-XXXXXX"
              className="font-mono text-sm uppercase"
              spellCheck={false}
              autoFocus
            />
            {status === "error" && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={handleActivate}
            disabled={!keyInput.trim() || status === "loading"}
          >
            {status === "loading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Activer
          </Button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setScreen(initialScreen)}
            className="flex items-center gap-1 mx-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}
