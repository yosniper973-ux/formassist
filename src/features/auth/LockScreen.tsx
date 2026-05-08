import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

async function hashAnswer(answer: string): Promise<string> {
  const encoded = new TextEncoder().encode(answer);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
import { Eye, EyeOff, Lock, Fingerprint, Sparkles, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 5;

interface LockScreenProps {
  onUnlocked: () => void;
}

export function LockScreen({ onUnlocked }: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showRecovery, setShowRecovery] = useState(false);
  const [securityMode, setSecurityMode] = useState<"max" | "moderate">("max");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function tryBiometric() {
    setBiometricLoading(true);
    try {
      await invoke("authenticate_biometric", { reason: "Déverrouiller FormAssist" });
      const loaded = await invoke<boolean>("load_key_from_keychain");
      if (loaded) {
        onUnlocked();
        return;
      }
      // Clé introuvable dans le trousseau → désinscrire pour éviter une boucle
      await db.setConfig("biometric_enabled", "0");
      setBiometricAvailable(false);
      setError("Clé biométrique introuvable. Réactive Touch ID dans Paramètres > Sécurité.");
    } catch {
      // Annulé ou échoué → formulaire mot de passe
    } finally {
      setBiometricLoading(false);
    }
    inputRef.current?.focus();
  }

  useEffect(() => {
    // Charger le mode de sécurité configuré
    db.getConfig("password_security_mode").then((mode) => {
      if (mode === "moderate") setSecurityMode("moderate");
    });

    // Récupérer le verrouillage temporaire stocké
    db.getConfig("lockout_until").then((val) => {
      if (val) {
        const until = new Date(val);
        if (until > new Date()) {
          setLockedUntil(until);
        }
      }
    });
    db.getConfig("failed_attempts").then((val) => {
      if (val) setAttempts(parseInt(val, 10));
    });

    // Déclenchement automatique de la biométrie si activée
    async function initBiometric() {
      try {
        const enabled = await db.getConfig("biometric_enabled");
        if (enabled !== "1") {
          inputRef.current?.focus();
          return;
        }

        const isWindows = /Win/i.test(navigator.platform);

        if (isWindows) {
          // Windows : is_biometric_available() (WinRT async) ne se complète pas
          // depuis un thread Tauri. On vérifie juste la présence du fichier de clé.
          const enrolled = await invoke<boolean>("is_biometric_enrolled");
          if (!enrolled) {
            inputRef.current?.focus();
            return;
          }
          setBiometricAvailable(true);
          // Laisser la fenêtre s'afficher complètement avant de déclencher Hello
          await new Promise<void>((r) => setTimeout(r, 800));
          await tryBiometric();
        } else {
          // macOS : LocalAuthentication est synchrone et fiable
          const available = await invoke<boolean>("is_biometric_available");
          if (available) {
            setBiometricAvailable(true);
            await tryBiometric();
          } else {
            inputRef.current?.focus();
          }
        }
      } catch {
        inputRef.current?.focus();
      }
    }
    initBiometric();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compte à rebours du verrouillage
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const diff = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      if (diff <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setError("");
        db.setConfig("lockout_until", "");
        db.setConfig("failed_attempts", "0");
        inputRef.current?.focus();
      } else {
        setSecondsLeft(diff);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && lockedUntil > new Date();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || loading || isLocked) return;

    setLoading(true);
    setError("");

    try {
      const storedHash = await db.getConfig("password_hash");
      const storedSalt = await db.getConfig("password_salt");

      if (!storedHash || !storedSalt) {
        setError("Erreur de configuration. Relance l'application.");
        return;
      }

      const valid = await invoke<boolean>("verify_password", {
        password,
        storedHash,
        storedSalt,
      });

      if (valid) {
        // Réinitialiser les tentatives
        await db.setConfig("failed_attempts", "0");
        await db.setConfig("lockout_until", "");
        setAttempts(0);
        onUnlocked();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        await db.setConfig("failed_attempts", String(newAttempts));

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          setLockedUntil(until);
          await db.setConfig("lockout_until", until.toISOString());
          setError("");
          setPassword("");
        } else {
          const remaining = MAX_ATTEMPTS - newAttempts;
          setError(
            `Mot de passe incorrect. ${remaining} tentative${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}.`,
          );
          setPassword("");
          inputRef.current?.focus();
        }
      }
    } catch (err) {
      setError("Erreur inattendue. Réessaie.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">FormAssist</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mb-3 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Lock className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle>Application verrouillée</CardTitle>
            <CardDescription>Saisis ton mot de passe pour continuer.</CardDescription>
          </CardHeader>

          <CardContent>
            {biometricLoading ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <Fingerprint className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-sm text-muted-foreground">
                  Pose ton doigt sur le capteur…
                </p>
              </div>
            ) : isLocked ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Trop de tentatives incorrectes. Attends{" "}
                    <span className="font-bold">
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                    </span>{" "}
                    avant de réessayer.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      ref={inputRef}
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ton mot de passe"
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPwd ? "Masquer" : "Afficher"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={!password || loading}>
                  {loading ? "Vérification…" : "Déverrouiller"}
                </Button>

                {biometricAvailable && (
                  <button
                    type="button"
                    onClick={tryBiometric}
                    className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Fingerprint className="h-4 w-4" />
                    Utiliser Touch ID / Windows Hello
                  </button>
                )}

                {securityMode === "moderate" && (
                  <button
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    J'ai oublié mon mot de passe
                  </button>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        {/* Dialogue de récupération */}
        {showRecovery && <RecoveryDialog onCancel={() => setShowRecovery(false)} onSuccess={onUnlocked} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneau de récupération par question secrète
// ─────────────────────────────────────────────────────────────────────────────

function RecoveryDialog({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"question" | "newpwd">("question");

  useEffect(() => {
    db.getConfig("recovery_question").then(setQuestion);
  }, []);

  async function checkAnswer() {
    const storedAnswer = await db.getConfig("recovery_answer_hash");
    if (!storedAnswer) return false;
    const normalized = answer.toLowerCase().trim();
    // Rétrocompatibilité : si la valeur stockée n'est pas un hash SHA-256 (64 hex),
    // c'est une ancienne réponse en clair — comparaison directe.
    if (!/^[a-f0-9]{64}$/.test(storedAnswer)) {
      return storedAnswer === normalized;
    }
    const inputHash = await hashAnswer(normalized);
    return storedAnswer === inputHash;
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const correct = await checkAnswer();
    if (correct) {
      setStep("newpwd");
    } else {
      setError("Réponse incorrecte.");
    }
    setLoading(false);
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) {
      setError("Minimum 8 caractères.");
      return;
    }

    setLoading(true);
    try {
      const result = await invoke<string>("setup_password", {
        password: newPwd,
        securityMode: "moderate",
        recoveryQuestion: question,
        recoveryAnswer: answer,
      });

      const { password_hash, salt } = JSON.parse(result) as {
        password_hash: string;
        salt: string;
      };

      await db.setConfig("password_hash", password_hash);
      await db.setConfig("password_salt", salt);
      await db.setConfig("failed_attempts", "0");
      await db.setConfig("lockout_until", "");

      onSuccess();
    } catch {
      setError("Erreur lors du changement de mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Récupération du mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          {step === "question" ? (
            <form onSubmit={handleVerify} className="space-y-4">
              {question && (
                <div>
                  <Label>Question secrète</Label>
                  <p className="mt-1 rounded-md bg-muted p-3 text-sm">{question}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="recovery-answer">Ta réponse</Label>
                <Input
                  id="recovery-answer"
                  type="password"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Ta réponse"
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                  Annuler
                </Button>
                <Button type="submit" className="flex-1" disabled={!answer || loading}>
                  {loading ? "Vérification…" : "Valider"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleNewPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Bonne réponse ! Choisis un nouveau mot de passe.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={newPwd.length < 8 || loading}>
                {loading ? "Enregistrement…" : "Changer le mot de passe"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}
