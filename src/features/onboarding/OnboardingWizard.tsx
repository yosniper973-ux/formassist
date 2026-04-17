import { useState } from "react";
import { Sparkles, HelpCircle } from "lucide-react";
import { db } from "@/lib/db";
import { Step0ClaudeExplain } from "./steps/Step0ClaudeExplain";
import { Step1Welcome } from "./steps/Step1Welcome";
import { Step2CreateAccount } from "./steps/Step2CreateAccount";
import { Step3AddCredit } from "./steps/Step3AddCredit";
import { Step4CreateKey } from "./steps/Step4CreateKey";
import { Step5EnterKey } from "./steps/Step5EnterKey";
import { Step6TestConnection } from "./steps/Step6TestConnection";
import { Step7Finalize } from "./steps/Step7Finalize";

interface Props {
  onComplete: () => void;
}

const STEP_LABELS = [
  "Comprendre",
  "Bienvenue",
  "Compte",
  "Crédit",
  "Clé API",
  "Saisie",
  "Test",
  "Finalisation",
];

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const totalSteps = STEP_LABELS.length;
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  function next() {
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleFinalize(budget: number, preset: string) {
    setSaving(true);
    try {
      // La clé API est stockée temporairement en clair (pas de clé de chiffrement
      // disponible avant la création du mot de passe). SetupPassword la rechiffre.
      // trim() supprime espaces et retours-lignes éventuels du copier-coller.
      await db.setConfig("api_key_pending", apiKey.trim(), false);

      // Paramètres généraux
      await db.setConfig("model_preset", preset);
      await db.setConfig("budget_monthly", String(budget));
      await db.setConfig("cost_alert_threshold", "0.50");

      // Marquer l'onboarding comme terminé
      await db.setConfig("onboarding_complete", "1");

      onComplete();
    } catch (err) {
      console.error("Erreur lors de la sauvegarde de la configuration :", err);
      // En dev sans Tauri, on continue quand même
      await db.setConfig("onboarding_complete", "1").catch(() => {});
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* En-tête */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground">FormAssist</span>
        </div>

        {/* Indicateur d'étape */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Étape {step + 1} sur {totalSteps}
          </span>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Aide"
            aria-label="Aide"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Barre de progression */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progressPct}%` }}
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Étape ${step + 1} sur ${totalSteps}`}
        />
      </div>

      {/* Étapes indicatrices (petits points) */}
      <div className="flex justify-center gap-1.5 py-4">
        {STEP_LABELS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < step
                ? "w-4 bg-primary"
                : i === step
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>

      {/* Contenu de l'étape */}
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-8">
        {step === 0 && <Step0ClaudeExplain onNext={next} />}
        {step === 1 && <Step1Welcome onNext={next} />}
        {step === 2 && <Step2CreateAccount onNext={next} />}
        {step === 3 && <Step3AddCredit onNext={next} />}
        {step === 4 && <Step4CreateKey onNext={next} />}
        {step === 5 && (
          <Step5EnterKey
            onNext={(key) => {
              setApiKey(key);
              next();
            }}
          />
        )}
        {step === 6 && (
          <Step6TestConnection
            apiKey={apiKey}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 7 && (
          <Step7Finalize
            onComplete={handleFinalize}
          />
        )}
      </main>

      {/* Pied de page */}
      <footer className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
        Toutes tes données restent sur ton ordinateur. Aucune transmission externe.
      </footer>

      {/* Overlay de sauvegarde */}
      {saving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-foreground">Enregistrement de ta configuration…</p>
          </div>
        </div>
      )}
    </div>
  );
}
