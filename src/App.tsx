import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { Router } from "./Router";
import { useAppStore } from "@/stores/appStore";
import { db } from "@/lib/db";
import { LockScreen } from "@/features/auth/LockScreen";
import { SetupPassword } from "@/features/auth/SetupPassword";
import { OnboardingWizard } from "@/features/onboarding/OnboardingWizard";
import { ErrorToast } from "@/components/ErrorToast";
import { logError, classifyError } from "@/lib/errorHandler";

type AppPhase =
  | "loading"
  | "onboarding"   // premier lancement : assistant Claude
  | "setup_pwd"    // onboarding terminé, pas encore de mot de passe
  | "locked"       // mot de passe configuré, app verrouillée
  | "ready";       // tout ok, app principale

export function App() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const { isUnlocked, setUnlocked, setOnboardingComplete, setPasswordConfigured } =
    useAppStore();

  useEffect(() => {
    async function init() {
      try {
        // Lancer les migrations SQLite au premier lancement
        await db.runMigrations();
        db.backfillSlotCompetences().catch(() => {/* silencieux */});

        const onboardingDone = await db.getConfig("onboarding_complete");
        const passwordHash = await db.getConfig("password_hash");

        if (!onboardingDone) {
          setPhase("onboarding");
          return;
        }

        setOnboardingComplete(true);

        if (!passwordHash) {
          setPhase("setup_pwd");
          return;
        }

        setPasswordConfigured(true);
        setPhase("locked");
      } catch (err) {
        logError(classifyError(err, "init"), "App.init", err);
        // En cas d'erreur BDD (ex: dev sans Tauri), passer directement à l'app
        setPhase("ready");
        setUnlocked(true);
      }
    }

    init();
  }, [setUnlocked, setOnboardingComplete, setPasswordConfigured]);

  // Quand l'état de déverrouillage change dans le store
  useEffect(() => {
    if (phase === "locked" && isUnlocked) {
      setPhase("ready");
    }
    if (phase === "ready" && !isUnlocked) {
      setPhase("locked");
    }
  }, [isUnlocked, phase]);

  if (phase === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </div>
      </div>
    );
  }

  if (phase === "onboarding") {
    return (
      <>
        <OnboardingWizard onComplete={() => setPhase("setup_pwd")} />
        <ErrorToast />
      </>
    );
  }

  if (phase === "setup_pwd") {
    return (
      <SetupPassword
        onComplete={() => {
          setPasswordConfigured(true);
          setUnlocked(true);
          setPhase("ready");
        }}
      />
    );
  }

  if (phase === "locked") {
    return (
      <LockScreen
        onUnlocked={() => {
          setUnlocked(true);
          setPhase("ready");
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <Router />
      <ErrorToast />
    </BrowserRouter>
  );
}
