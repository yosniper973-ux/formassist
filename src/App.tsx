import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { Router } from "./Router";
import { useAppStore } from "@/stores/appStore";
import { db } from "@/lib/db";
import { LockScreen } from "@/features/auth/LockScreen";
import { SetupPassword } from "@/features/auth/SetupPassword";
import { OnboardingWizard } from "@/features/onboarding/OnboardingWizard";
import { LicenseScreen } from "@/features/license/LicenseScreen";
import { CloudRestoreScreen } from "@/features/cloud/CloudRestoreScreen";
import { ErrorToast } from "@/components/ErrorToast";
import { logError, classifyError } from "@/lib/errorHandler";
import { initTheme } from "@/lib/theme";
import { getLicenseStatus } from "@/lib/license";
import { findOtherDeviceBackups } from "@/lib/cloud-backup";
import type { OtherDeviceBackup } from "@/lib/cloud-backup";

type AppPhase =
  | "loading"
  | "license"        // pas de licence valide ni d'essai actif
  | "cloud_restore"  // nouveau PC : sauvegarde cloud détectée
  | "onboarding"     // premier lancement : assistant Claude
  | "setup_pwd"      // onboarding terminé, pas encore de mot de passe
  | "locked"         // mot de passe configuré, app verrouillée
  | "ready";         // tout ok, app principale

export function App() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const [licenseInitialScreen, setLicenseInitialScreen] = useState<"offer" | "expired">("offer");
  const [cloudBackups, setCloudBackups] = useState<OtherDeviceBackup[]>([]);
  const { isUnlocked, setUnlocked, setOnboardingComplete, setPasswordConfigured, setTheme } =
    useAppStore();

  useEffect(() => {
    async function init() {
      try {
        // Lancer les migrations SQLite au premier lancement
        await db.runMigrations();

        // Appliquer le thème sauvegardé dès le démarrage
        const savedTheme = await initTheme(db.getConfig);
        setTheme(savedTheme);
        db.backfillSlotCompetences().catch((err: unknown) => {
          console.error("Erreur backfill compétences :", err);
        });

        // ── Vérification licence ──────────────────────────────────
        const licStatus = await getLicenseStatus();
        if (licStatus.kind === "no_license") {
          setLicenseInitialScreen("offer");
          setPhase("license");
          return;
        }
        if (licStatus.kind === "expired_trial" || licStatus.kind === "expired_key") {
          setLicenseInitialScreen("expired");
          setPhase("license");
          return;
        }
        // active ou trial → on continue normalement

        const onboardingDone = await db.getConfig("onboarding_complete");
        const passwordHash = await db.getConfig("password_hash");

        if (!onboardingDone) {
          // Nouveau PC — chercher des sauvegardes cloud pour cette licence
          if (navigator.onLine) {
            try {
              const others = await findOtherDeviceBackups();
              if (others.length > 0) {
                setCloudBackups(others);
                setPhase("cloud_restore");
                return;
              }
            } catch {
              // Silencieux — on passe à l'onboarding normal
            }
          }
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

  // Après activation ou démarrage essai, reprendre le flux normal
  async function continueAfterLicense() {
    try {
      const onboardingDone = await db.getConfig("onboarding_complete");
      const passwordHash = await db.getConfig("password_hash");
      if (!onboardingDone) {
        // Chercher des sauvegardes cloud pour cette licence (nouveau PC)
        if (navigator.onLine) {
          try {
            const others = await findOtherDeviceBackups();
            if (others.length > 0) {
              setCloudBackups(others);
              setPhase("cloud_restore");
              return;
            }
          } catch {
            // Silencieux
          }
        }
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
    } catch {
      setPhase("ready");
      setUnlocked(true);
    }
  }

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

  if (phase === "license") {
    return (
      <>
        <LicenseScreen
          initialScreen={licenseInitialScreen}
          onActivated={continueAfterLicense}
        />
        <ErrorToast />
      </>
    );
  }

  if (phase === "cloud_restore") {
    return (
      <>
        <CloudRestoreScreen
          backups={cloudBackups}
          onSkip={() => setPhase("onboarding")}
        />
        <ErrorToast />
      </>
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
