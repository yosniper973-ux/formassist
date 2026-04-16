import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, RefreshCw, Check, Key, Sliders, DollarSign, Lock, Info } from "lucide-react";
import { db } from "@/lib/db";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { testConnection } from "@/lib/claude";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PRESET_LABELS, MODELS } from "@/config/models";
import type { TaskType, ModelTier } from "@/types/api";

const PRESET_KEYS = ["quality", "balanced", "economic", "custom"] as const;

const TASK_LABELS: Record<TaskType, string> = {
  generation_cours: "Génération de cours",
  generation_exercice: "Exercices individuels",
  generation_jeu: "Jeux pédagogiques",
  generation_mise_en_situation: "Mises en situation",
  generation_fiche_pedagogique: "Fiches pédagogiques",
  analyse_style: "Analyse du style",
  affinage_style: "Affinage du style",
  parsing_reac: "Analyse du REAC",
  parsing_planning: "Analyse du planning",
  parsing_repartition: "Analyse répartition",
  correction: "Corrections",
  recommandations: "Recommandations",
  mail_redaction: "Rédaction de mails",
  qcm_simple: "QCM automatiques",
  reformulation: "Reformulations",
};

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState("api");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Clé API
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [apiKeyError, setApiKeyError] = useState("");

  // Modèles
  const [preset, setPreset] = useState("quality");
  const [customOverrides, setCustomOverrides] = useState<Partial<Record<TaskType, ModelTier>>>({});

  // Budget
  const [budget, setBudget] = useState("25");
  const [alertThreshold, setAlertThreshold] = useState("0.50");

  // Verrouillage
  const [autoLockMinutes, setAutoLockMinutes] = useState("15");

  // App info
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const [encKey, presetVal, budgetVal, thresholdVal, lockVal, version] = await Promise.all([
        db.getConfig("api_key"),
        db.getConfig("model_preset"),
        db.getConfig("budget_monthly"),
        db.getConfig("cost_alert_threshold"),
        db.getConfig("auto_lock_minutes"),
        invoke<string>("get_app_version").catch(() => "0.1.0"),
      ]);

      if (encKey) {
        try {
          const decrypted = await decryptValue(encKey);
          setApiKey(decrypted);
        } catch {
          setApiKey("(clé chiffrée — déverrouille l'app pour la voir)");
        }
      }

      if (presetVal) setPreset(presetVal);
      if (budgetVal) setBudget(budgetVal);
      if (thresholdVal) setAlertThreshold(thresholdVal);
      if (lockVal) setAutoLockMinutes(lockVal);
      setAppVersion(version as string);

      // Charger les overrides personnalisés
      const overrides = await db.getConfig("model_overrides");
      if (overrides) setCustomOverrides(JSON.parse(overrides));
    } catch (err) {
      console.error("Erreur chargement paramètres :", err);
    }
  }

  async function testApiKey() {
    if (!apiKey || apiKey.startsWith("(")) return;
    setApiKeyStatus("testing");
    setApiKeyError("");

    const result = await testConnection(apiKey);
    if (result.success) {
      setApiKeyStatus("ok");
    } else {
      setApiKeyStatus("error");
      setApiKeyError(result.error ?? "Erreur inconnue");
    }
  }

  async function saveApiKey() {
    if (!apiKey || apiKey.startsWith("(")) return;
    setSaveStatus("saving");
    try {
      const encrypted = await encryptValue(apiKey);
      await db.setConfig("api_key", encrypted, true);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  async function saveModelSettings() {
    setSaveStatus("saving");
    try {
      await db.setConfig("model_preset", preset);
      if (preset === "custom") {
        await db.setConfig("model_overrides", JSON.stringify(customOverrides));
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  async function saveBudgetSettings() {
    setSaveStatus("saving");
    try {
      await db.setConfig("budget_monthly", budget);
      await db.setConfig("cost_alert_threshold", alertThreshold);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  async function saveLockSettings() {
    setSaveStatus("saving");
    try {
      await db.setConfig("auto_lock_minutes", autoLockMinutes);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  const sections = [
    { id: "api", label: "Clé API Claude", icon: <Key className="h-4 w-4" /> },
    { id: "modeles", label: "Modèles IA", icon: <Sliders className="h-4 w-4" /> },
    { id: "budget", label: "Budget", icon: <DollarSign className="h-4 w-4" /> },
    { id: "securite", label: "Sécurité", icon: <Lock className="h-4 w-4" /> },
    { id: "apropos", label: "À propos", icon: <Info className="h-4 w-4" /> },
  ];

  return (
    <div className="flex gap-6">
      {/* Navigation latérale */}
      <nav className="w-48 shrink-0 space-y-1">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeSection === s.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>

      {/* Contenu */}
      <div className="flex-1 max-w-2xl space-y-6">
        {/* Statut de sauvegarde */}
        {saveStatus === "saved" && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Paramètres enregistrés
          </div>
        )}

        {/* ─── Clé API ─── */}
        {activeSection === "api" && (
          <Card>
            <CardHeader>
              <CardTitle>Clé API Claude</CardTitle>
              <CardDescription>
                Ta clé d'accès à l'API Anthropic. Elle est chiffrée sur ton ordinateur.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="api-key">Clé API</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setApiKeyStatus("idle");
                      }}
                      placeholder="sk-ant-api03-…"
                      className="pr-10 font-mono text-sm"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={testApiKey}
                    disabled={!apiKey || apiKeyStatus === "testing"}
                  >
                    {apiKeyStatus === "testing" ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      "Tester"
                    )}
                  </Button>
                </div>

                {apiKeyStatus === "ok" && (
                  <p className="flex items-center gap-1.5 text-sm text-green-600">
                    <Check className="h-3.5 w-3.5" /> Connexion OK
                  </p>
                )}
                {apiKeyStatus === "error" && (
                  <p className="text-sm text-destructive">{apiKeyError}</p>
                )}
              </div>

              <Button onClick={saveApiKey} disabled={saveStatus === "saving"}>
                Enregistrer la clé
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Modèles ─── */}
        {activeSection === "modeles" && (
          <Card>
            <CardHeader>
              <CardTitle>Modèles IA</CardTitle>
              <CardDescription>
                Choisis le niveau de qualité vs coût pour chaque type de tâche.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Préréglages */}
              <div className="space-y-3">
                <Label>Préréglage</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_KEYS.map((key) => {
                    const info = PRESET_LABELS[key]!;
                    return (
                      <button
                        key={key}
                        onClick={() => setPreset(key)}
                        className={`rounded-lg border-2 p-3 text-left transition-colors ${
                          preset === key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <p className="text-sm font-semibold">{info.name}</p>
                        <p className="text-xs text-muted-foreground">{info.budgetRange}/mois</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Overrides personnalisés */}
              {preset === "custom" && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label>Modèle par type de tâche</Label>
                    <div className="space-y-2">
                      {(Object.keys(TASK_LABELS) as TaskType[]).map((task) => (
                        <div key={task} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {TASK_LABELS[task]}
                          </span>
                          <Select
                            value={customOverrides[task] ?? "sonnet"}
                            onChange={(e) =>
                              setCustomOverrides((prev) => ({
                                ...prev,
                                [task]: e.target.value as ModelTier,
                              }))
                            }
                            className="h-8 w-36 text-xs"
                          >
                            <option value="opus">{MODELS.opus.displayName}</option>
                            <option value="sonnet">{MODELS.sonnet.displayName}</option>
                            <option value="haiku">{MODELS.haiku.displayName}</option>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Button onClick={saveModelSettings} disabled={saveStatus === "saving"}>
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Budget ─── */}
        {activeSection === "budget" && (
          <Card>
            <CardHeader>
              <CardTitle>Budget API</CardTitle>
              <CardDescription>
                Définis tes limites de dépenses. FormAssist t'alertera avant de les dépasser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="budget">Budget mensuel (€)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="budget"
                    type="number"
                    min={1}
                    max={500}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">euros / mois</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tu recevras une alerte à 80% puis à 100% du budget.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="threshold">Seuil d'alerte par génération (€)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="threshold"
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">euros</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  FormAssist te demandera confirmation avant toute génération dépassant ce seuil.
                </p>
              </div>

              <Button onClick={saveBudgetSettings} disabled={saveStatus === "saving"}>
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Sécurité ─── */}
        {activeSection === "securite" && (
          <Card>
            <CardHeader>
              <CardTitle>Sécurité</CardTitle>
              <CardDescription>
                Paramètres de verrouillage automatique de l'application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="lock-minutes">Verrouillage automatique après (minutes)</Label>
                <Select
                  id="lock-minutes"
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(e.target.value)}
                  className="w-48"
                >
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes (recommandé)</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 heure</option>
                  <option value="0">Jamais</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  L'application se verrouille automatiquement après cette durée d'inactivité.
                </p>
              </div>

              <Separator />

              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Données chiffrées :</p>
                <ul className="mt-2 space-y-1">
                  <li>• Clé API Claude</li>
                  <li>• Données apprenants (noms, emails, notes)</li>
                  <li>• Informations de facturation et RIB</li>
                  <li>• Profil de style pédagogique</li>
                </ul>
              </div>

              <Button onClick={saveLockSettings} disabled={saveStatus === "saving"}>
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── À propos ─── */}
        {activeSection === "apropos" && (
          <Card>
            <CardHeader>
              <CardTitle>À propos de FormAssist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Version</p>
                  <p className="font-medium">{appVersion || "0.1.0"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stockage</p>
                  <p className="font-medium">100% local</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Télémétrie</p>
                  <p className="font-medium text-green-600">Aucune</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chiffrement</p>
                  <p className="font-medium">AES-256-GCM + Argon2</p>
                </div>
              </div>

              <Separator />

              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>
                  FormAssist est un assistant pédagogique conçu pour les formatrices
                  indépendantes dispensant des Titres Professionnels du Ministère du Travail.
                  Toutes tes données restent sur ton ordinateur.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
