import { useState } from "react";

async function hashAnswer(answer: string): Promise<string> {
  const encoded = new TextEncoder().encode(answer);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
import { Eye, EyeOff, Lock, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import { encryptValue } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Top 30 mots de passe les plus courants (version réduite)
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "bailey", "passw0rd", "shadow", "123123", "654321", "superman",
  "qazwsx", "michael", "football", "azerty", "motdepasse", "bonjour", "soleil",
  "password1", "admin",
]);

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

function evaluatePassword(pwd: string): PasswordStrength {
  if (pwd.length === 0) return { score: 0, label: "", color: "" };

  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) || /[0-9]/.test(pwd)) score++;
  if (!/^[a-z]+$/.test(pwd) && pwd.length >= 10) score++;
  if (COMMON_PASSWORDS.has(pwd.toLowerCase())) score = 0;

  const levels: PasswordStrength[] = [
    { score: 0, label: "Très faible", color: "bg-red-500" },
    { score: 1, label: "Faible", color: "bg-orange-500" },
    { score: 2, label: "Correct", color: "bg-yellow-500" },
    { score: 3, label: "Bon", color: "bg-blue-500" },
    { score: 4, label: "Excellent", color: "bg-green-500" },
  ];

  return { ...levels[Math.min(score, 4)]!, score };
}

interface SetupPasswordProps {
  onComplete: () => void;
}

export function SetupPassword({ onComplete }: SetupPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [securityMode, setSecurityMode] = useState<"max" | "moderate">("max");
  const [recoveryQuestion, setRecoveryQuestion] = useState("");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = evaluatePassword(password);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const isValid =
    password.length >= 8 &&
    passwordsMatch &&
    !COMMON_PASSWORDS.has(password.toLowerCase()) &&
    (securityMode === "max" || (recoveryQuestion.trim() && recoveryAnswer.trim()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError("");

    try {
      const result = await invoke<string>("setup_password", {
        password,
        securityMode,
        recoveryQuestion: securityMode === "moderate" ? recoveryQuestion : null,
        recoveryAnswer: securityMode === "moderate" ? recoveryAnswer : null,
      });

      const { password_hash, salt } = JSON.parse(result) as {
        password_hash: string;
        salt: string;
      };

      await db.setConfig("password_hash", password_hash);
      await db.setConfig("password_salt", salt);
      await db.setConfig("password_security_mode", securityMode);

      if (securityMode === "moderate" && recoveryQuestion && recoveryAnswer) {
        await db.setConfig("recovery_question", recoveryQuestion);
        const answerHash = await hashAnswer(recoveryAnswer.toLowerCase().trim());
        await db.setConfig("recovery_answer_hash", answerHash);
      }

      // Rechiffrer la clé API stockée en clair pendant l'onboarding
      const pendingApiKey = await db.getConfig("api_key_pending");
      if (pendingApiKey) {
        const encryptedKey = await encryptValue(pendingApiKey);
        await db.setConfig("api_key", encryptedKey, true);
        await db.deleteConfig("api_key_pending");
      }

      onComplete();
    } catch (err) {
      setError("Erreur lors de la création du mot de passe. Réessaie.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">FormAssist</span>
        </div>

        <Card>
          <CardHeader>
            <div className="mb-2 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle>Crée ton mot de passe</CardTitle>
            </div>
            <CardDescription>
              Ce mot de passe protège toutes tes données : clé API, informations apprenants,
              factures. Il ne peut pas être récupéré si tu l'oublies (sauf option ci-dessous).
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Mot de passe */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Indicateur de robustesse */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            i < strength.score ? strength.color : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    {strength.label && (
                      <p className="text-xs text-muted-foreground">
                        Robustesse :{" "}
                        <span
                          className={
                            strength.score <= 1
                              ? "text-red-600"
                              : strength.score === 2
                                ? "text-yellow-600"
                                : "text-green-600"
                          }
                        >
                          {strength.label}
                        </span>
                      </p>
                    )}
                    {COMMON_PASSWORDS.has(password.toLowerCase()) && (
                      <p className="text-xs text-destructive">
                        Ce mot de passe est trop courant. Choisis-en un autre.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Confirmation */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Répète ton mot de passe"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={
                      showConfirm ? "Masquer la confirmation" : "Afficher la confirmation"
                    }
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>
                )}
                {passwordsMatch && (
                  <p className="text-xs text-green-600">Les mots de passe correspondent. ✓</p>
                )}
              </div>

              {/* Mode de sécurité */}
              <div className="space-y-2">
                <Label>Niveau de sécurité</Label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Sécurité max */}
                  <button
                    type="button"
                    onClick={() => setSecurityMode("max")}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                      securityMode === "max"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <ShieldCheck className="h-6 w-6" />
                    <span className="font-medium">Sécurité max</span>
                    <span className="text-center text-xs leading-snug opacity-80">
                      Mot de passe irrécupérable
                    </span>
                  </button>

                  {/* Sécurité modérée */}
                  <button
                    type="button"
                    onClick={() => setSecurityMode("moderate")}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm transition-colors ${
                      securityMode === "moderate"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <ShieldAlert className="h-6 w-6" />
                    <span className="font-medium">Sécurité modérée</span>
                    <span className="text-center text-xs leading-snug opacity-80">
                      Question de secours
                    </span>
                  </button>
                </div>
              </div>

              {/* Question de récupération (mode modéré) */}
              {securityMode === "moderate" && (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Choisis une question dont tu te souviendras toujours.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="question">Question secrète</Label>
                    <Input
                      id="question"
                      value={recoveryQuestion}
                      onChange={(e) => setRecoveryQuestion(e.target.value)}
                      placeholder="Ex : Nom de mon premier animal ?"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="answer">Réponse</Label>
                    <Input
                      id="answer"
                      type="password"
                      value={recoveryAnswer}
                      onChange={(e) => setRecoveryAnswer(e.target.value)}
                      placeholder="Ta réponse (insensible à la casse)"
                    />
                  </div>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={!isValid || loading}>
                {loading ? "Création en cours…" : "Créer mon mot de passe"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Tes données restent 100% sur ton ordinateur. Aucune transmission à l'extérieur.
        </p>
      </div>
    </div>
  );
}
