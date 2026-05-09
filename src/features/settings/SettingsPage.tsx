import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Eye, EyeOff, Fingerprint, RefreshCw, Check, Key, Sliders, DollarSign, Lock, Info, HardDrive, Download, Upload, User, Briefcase } from "lucide-react";
import { db } from "@/lib/db";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { testConnection } from "@/lib/claude";
import { getProfessionalInfo, setProfessionalInfo } from "@/lib/professional-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PRESET_LABELS, MODELS } from "@/config/models";
import type { TaskType, ModelTier } from "@/types/api";
import type { ProfessionalInfo } from "@/types/invoice";

const EMPTY_PRO_INFO: ProfessionalInfo = {
  full_name: "",
  address: "",
  siret: "",
  nda: "",
  naf_code: "",
  tva_number: null,
  tva_exempt: true,
  rib: "",
  bank_name: "",
  iban: "",
  bic: "",
};

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
  correction_dossier: "Dossiers DP / Projet",
  prefill_deroulement: "Fiches de déroulement",
};

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profil");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Profil utilisateur
  const [userFirstName, setUserFirstName] = useState("");

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

  // Biométrie
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometryLabel, setBiometryLabel] = useState("Biométrie");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<"idle" | "working" | "ok" | "error">("idle");
  const [biometricError, setBiometricError] = useState("");

  // App info
  const [appVersion, setAppVersion] = useState("");

  // Infos pro émetteur
  const [proInfo, setProInfo] = useState<ProfessionalInfo>(EMPTY_PRO_INFO);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const [encKey, presetVal, budgetVal, thresholdVal, lockVal, version, firstName, pro] = await Promise.all([
        db.getConfig("api_key"),
        db.getConfig("model_preset"),
        db.getConfig("budget_monthly"),
        db.getConfig("cost_alert_threshold"),
        db.getConfig("auto_lock_minutes"),
        invoke<string>("get_app_version").catch(() => "0.1.0"),
        db.getConfig("user_first_name"),
        getProfessionalInfo(),
      ]);

      setProInfo(pro);

      if (firstName) setUserFirstName(firstName);

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

      // État biométrique
      try {
        const isWindows = /Win/i.test(navigator.platform);
        setBiometryLabel(isWindows ? "Windows Hello" : "Touch ID");

        // Sur Windows, is_biometric_available() (WinRT async) peut hanger
        // depuis un thread Tauri. On suppose Windows Hello disponible et on
        // affiche le bouton ; l'éventuel échec sera surfacé lors du clic.
        // Sur macOS, l'appel est synchrone et fiable.
        if (isWindows) {
          setBiometricAvailable(true);
        } else {
          const available = await invoke<boolean>("is_biometric_available");
          setBiometricAvailable(available);
        }

        // Vérifie la cohérence : biometric_enabled doit correspondre à la
        // présence effective de la clé sur le disque.
        const enabled = await db.getConfig("biometric_enabled");
        const enrolled = await invoke<boolean>("is_biometric_enrolled").catch(
          () => false,
        );
        if (enabled === "1" && !enrolled) {
          // Incohérence : flag activé mais pas de clé → on remet à zéro
          await db.setConfig("biometric_enabled", "0");
          setBiometricEnrolled(false);
        } else {
          setBiometricEnrolled(enabled === "1" && enrolled);
        }
      } catch {
        setBiometricAvailable(false);
      }
    } catch (err) {
      console.error("Erreur chargement paramètres :", err);
    }
  }

  async function toggleBiometric() {
    setBiometricStatus("working");
    setBiometricError("");
    try {
      if (biometricEnrolled) {
        // Désactiver
        await invoke("delete_key_from_keychain");
        await db.setConfig("biometric_enabled", "0");
        setBiometricEnrolled(false);
        setBiometricStatus("ok");
      } else {
        // Activer : 1) authentification biométrique
        await invoke("authenticate_biometric", {
          reason: `Activer ${biometryLabel} pour FormAssist`,
        });
        // 2) Sauvegarde de la clé chiffrée localement
        await invoke("save_key_to_keychain");
        // 3) Vérification que la clé a bien été écrite sur le disque
        const enrolled = await invoke<boolean>("is_biometric_enrolled");
        if (!enrolled) {
          throw new Error(
            "La clé biométrique n'a pas pu être enregistrée sur le disque. " +
              "Vérifie que l'appli a accès à son répertoire de données.",
          );
        }
        // 4) Activation du flag uniquement après vérification
        await db.setConfig("biometric_enabled", "1");
        setBiometricEnrolled(true);
        setBiometricStatus("ok");
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Activation impossible.";
      // En cas d'échec partiel, on nettoie pour rester cohérent : pas de
      // clé orpheline et flag à 0, sinon le prochain démarrage essaiera
      // un déverrouillage qui échouera silencieusement.
      try {
        await invoke("delete_key_from_keychain");
      } catch {
        /* ignore */
      }
      await db.setConfig("biometric_enabled", "0");
      setBiometricEnrolled(false);
      setBiometricStatus("error");
      setBiometricError(message);
    }
    setTimeout(() => {
      setBiometricStatus("idle");
      setBiometricError("");
    }, 6000);
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
    // Nettoyage agressif : enlève espaces/newlines même au milieu (les clés
    // Anthropic ne contiennent jamais de whitespace, mais le copier-coller
    // peut en introduire depuis des emails ou des terminaux).
    const cleaned = apiKey.replace(/\s+/g, "");
    if (!cleaned || cleaned.startsWith("(")) return;
    setSaveStatus("saving");
    try {
      const encrypted = await encryptValue(cleaned);
      await db.setConfig("api_key", encrypted, true);
      // Reflète la version nettoyée dans le champ (sans espaces parasites)
      setApiKey(cleaned);
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
      // Notifier le Header (et autres composants) que le budget a changé
      window.dispatchEvent(new Event("budget-updated"));
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

  async function saveProInfo() {
    setSaveStatus("saving");
    try {
      await setProfessionalInfo(proInfo);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Erreur enregistrement infos pro :", err);
      setSaveStatus("error");
    }
  }

  function updatePro<K extends keyof ProfessionalInfo>(field: K, value: ProfessionalInfo[K]) {
    setProInfo((p) => ({ ...p, [field]: value }));
  }

  async function saveFirstName() {
    setSaveStatus("saving");
    try {
      await db.setConfig("user_first_name", userFirstName.trim());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      window.dispatchEvent(new Event("user-profile-updated"));
    } catch (err) {
      console.error("Erreur enregistrement prénom :", err);
      setSaveStatus("error");
    }
  }

  const sections = [
    { id: "profil", label: "Profil", icon: <User className="h-4 w-4" /> },
    { id: "infos_pro", label: "Infos pro", icon: <Briefcase className="h-4 w-4" /> },
    { id: "api", label: "Clé API Claude", icon: <Key className="h-4 w-4" /> },
    { id: "modeles", label: "Modèles IA", icon: <Sliders className="h-4 w-4" /> },
    { id: "budget", label: "Budget", icon: <DollarSign className="h-4 w-4" /> },
    { id: "securite", label: "Sécurité", icon: <Lock className="h-4 w-4" /> },
    { id: "sauvegardes", label: "Sauvegardes", icon: <HardDrive className="h-4 w-4" /> },
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

        {/* ─── Profil ─── */}
        {activeSection === "profil" && (
          <Card>
            <CardHeader>
              <CardTitle>Profil</CardTitle>
              <CardDescription>
                Ton prénom est utilisé pour personnaliser l'accueil de FormAssist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">Prénom</Label>
                <Input
                  id="first-name"
                  value={userFirstName}
                  onChange={(e) => setUserFirstName(e.target.value)}
                  placeholder="Ex. Jo-Anne"
                  maxLength={40}
                />
                <p className="text-xs text-muted-foreground">
                  Affiché sur le tableau de bord : « Bonjour {userFirstName.trim() || "…"} 👋 »
                </p>
              </div>
              <Button onClick={saveFirstName} disabled={saveStatus === "saving"}>
                {saveStatus === "saving" ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Infos pro émetteur ─── */}
        {activeSection === "infos_pro" && (
          <Card>
            <CardHeader>
              <CardTitle>Infos pro émetteur</CardTitle>
              <CardDescription>
                Ces informations apparaissent en haut des factures que tu envoies, ainsi que ton RIB en pied de page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="pro-name">Nom complet ou raison sociale *</Label>
                <Input
                  id="pro-name"
                  value={proInfo.full_name}
                  onChange={(e) => updatePro("full_name", e.target.value)}
                  placeholder="Ex : Jo-Anne Rocher"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pro-address">Adresse pro *</Label>
                <Textarea
                  id="pro-address"
                  value={proInfo.address}
                  onChange={(e) => updatePro("address", e.target.value)}
                  placeholder={"12 rue de l'Exemple\n97300 Cayenne"}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pro-siret">SIRET *</Label>
                  <Input
                    id="pro-siret"
                    value={proInfo.siret}
                    onChange={(e) => updatePro("siret", e.target.value)}
                    placeholder="123 456 789 00012"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pro-nda">N° de Déclaration d'Activité (NDA)</Label>
                  <Input
                    id="pro-nda"
                    value={proInfo.nda}
                    onChange={(e) => updatePro("nda", e.target.value)}
                    placeholder="97 30 01234 56"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pro-naf">Code NAF / APE</Label>
                <Input
                  id="pro-naf"
                  value={proInfo.naf_code}
                  onChange={(e) => updatePro("naf_code", e.target.value)}
                  placeholder="8559A"
                  maxLength={6}
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Code d'activité INSEE (ex : 8559A pour la formation continue d'adultes).
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Régime de TVA</Label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent">
                    <input
                      type="radio"
                      checked={proInfo.tva_exempt}
                      onChange={() => updatePro("tva_exempt", true)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium">Franchise en base de TVA (art. 293 B du CGI)</p>
                      <p className="text-xs text-muted-foreground">
                        Tu ne factures pas la TVA. Mention obligatoire imprimée automatiquement.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent">
                    <input
                      type="radio"
                      checked={!proInfo.tva_exempt}
                      onChange={() => updatePro("tva_exempt", false)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Assujettie à la TVA</p>
                      {!proInfo.tva_exempt && (
                        <Input
                          value={proInfo.tva_number ?? ""}
                          onChange={(e) => updatePro("tva_number", e.target.value)}
                          placeholder="N° TVA intracommunautaire — FR12345678900"
                          className="mt-2"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Coordonnées bancaires (RIB)</Label>
                <p className="text-xs text-muted-foreground">
                  Apparaîtront en pied de facture pour permettre au centre de te payer.
                </p>
                <div className="space-y-2">
                  <Input
                    value={proInfo.bank_name}
                    onChange={(e) => updatePro("bank_name", e.target.value)}
                    placeholder="Nom de la banque"
                  />
                  <Input
                    value={proInfo.iban}
                    onChange={(e) => updatePro("iban", e.target.value)}
                    placeholder="IBAN — FR76 1234 5678 9012 3456 7890 123"
                    className="font-mono"
                  />
                  <Input
                    value={proInfo.bic}
                    onChange={(e) => updatePro("bic", e.target.value)}
                    placeholder="BIC — BNPAFRPP"
                    className="font-mono"
                    maxLength={11}
                  />
                </div>
              </div>

              <Button onClick={saveProInfo} disabled={saveStatus === "saving"}>
                {saveStatus === "saving" ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </CardContent>
          </Card>
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

              {biometricAvailable && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Fingerprint className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">
                            Déverrouillage {biometryLabel}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {biometricEnrolled
                            ? `${biometryLabel} activé — pose le doigt pour ouvrir l'app.`
                            : `Ouvre l'app sans mot de passe grâce à ${biometryLabel}.`}
                        </p>
                      </div>
                      <Button
                        variant={biometricEnrolled ? "destructive" : "default"}
                        size="sm"
                        onClick={toggleBiometric}
                        disabled={biometricStatus === "working"}
                      >
                        {biometricStatus === "working"
                          ? "…"
                          : biometricStatus === "ok"
                            ? biometricEnrolled
                              ? "Activé ✓"
                              : "Désactivé ✓"
                            : biometricStatus === "error"
                              ? "Erreur"
                              : biometricEnrolled
                                ? `Désactiver`
                                : `Activer`}
                      </Button>
                    </div>
                    {biometricStatus === "error" && biometricError && (
                      <Alert variant="destructive">
                        <AlertDescription className="text-xs">
                          {biometricError}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </>
              )}

              <Separator />

              <Button onClick={saveLockSettings} disabled={saveStatus === "saving"}>
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Sauvegardes ─── */}
        {activeSection === "sauvegardes" && <BackupSection />}

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

              <UpdateChecker currentVersion={appVersion || "0.1.0"} />

              <Separator />

              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>
                  FormAssist est un assistant pédagogique conçu pour les formateurs
                  indépendants dispensant des Titres Professionnels du Ministère du Travail.
                  Toutes tes données restent sur ton ordinateur.
                </p>
              </div>

              <p className="pt-2 text-center text-xs italic text-muted-foreground">
                © 2026 — Développé par Yohann Rocher
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Section Sauvegardes
// ============================================================

interface BackupEntry {
  path: string;
  name: string;
  size: number;
}

function BackupSection() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const result = await invoke<string>("list_backups");
      const parsed = JSON.parse(result) as BackupEntry[];
      // Trier par nom décroissant (plus récent en premier)
      parsed.sort((a, b) => b.name.localeCompare(a.name));
      setBackups(parsed);
    } catch (err) {
      console.error("Erreur chargement sauvegardes:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setMessage(null);
    try {
      await invoke("create_backup", { reason: "Manuel depuis les paramètres" });
      setMessage({ type: "success", text: "Sauvegarde créée avec succès !" });
      await loadBackups();
    } catch (err) {
      setMessage({ type: "error", text: `Erreur : ${err}` });
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(backup: BackupEntry) {
    if (!confirm(`Restaurer la sauvegarde "${backup.name}" ?\n\nUne sauvegarde de sécurité sera créée automatiquement avant la restauration.\n\nL'application devra être redémarrée après la restauration.`)) {
      return;
    }
    setRestoring(true);
    setMessage(null);
    try {
      await invoke("restore_backup", { backupPath: backup.path });
      setMessage({
        type: "success",
        text: "Restauration réussie ! Redémarre l'application pour appliquer les changements.",
      });
    } catch (err) {
      setMessage({ type: "error", text: `Erreur : ${err}` });
    } finally {
      setRestoring(false);
    }
  }

  async function handleExport() {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        defaultPath: `formassist_export_${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!filePath) return;
      await invoke("export_database", { destPath: filePath });
      setMessage({ type: "success", text: `Base exportée vers ${filePath}` });
    } catch (err) {
      setMessage({ type: "error", text: `Erreur export : ${err}` });
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sauvegardes</CardTitle>
        <CardDescription>
          Crée et restaure des sauvegardes de ta base de données. Toutes tes données
          (centres, formations, apprenants, contenus, factures) sont incluses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {creating ? "Création..." : "Nouvelle sauvegarde"}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Upload className="mr-2 h-4 w-4" />
            Exporter la BDD
          </Button>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <Separator />

        {/* Liste des sauvegardes */}
        <div>
          <Label className="mb-3 block">Sauvegardes disponibles</Label>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucune sauvegarde. Clique sur « Nouvelle sauvegarde » pour en créer une.
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.path}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(b.size)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(b)}
                    disabled={restoring}
                  >
                    {restoring ? "Restauration..." : "Restaurer"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avertissement */}
        <div className="rounded-lg bg-muted p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">💡 Conseil</p>
          <p className="mt-1">
            Crée une sauvegarde régulièrement, surtout avant de mettre à jour l'application.
            Les sauvegardes sont stockées localement dans le dossier de données de l'app.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Section Mise à jour de l'application
// ============================================================

type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes?: string }
  | { kind: "up_to_date" }
  | { kind: "downloading"; downloaded: number; total: number | null }
  | { kind: "installed" }
  | { kind: "error"; message: string };

function UpdateChecker({ currentVersion }: { currentVersion: string }) {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingUpdate, setPendingUpdate] = useState<any | null>(null);

  async function handleCheck() {
    setStatus({ kind: "checking" });
    try {
      const update = await checkUpdate();
      if (update) {
        setPendingUpdate(update);
        setStatus({
          kind: "available",
          version: update.version,
          notes: update.body ?? undefined,
        });
      } else {
        setStatus({ kind: "up_to_date" });
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleInstall() {
    if (!pendingUpdate) return;
    setStatus({ kind: "downloading", downloaded: 0, total: null });
    try {
      let downloaded = 0;
      let total: number | null = null;

      await pendingUpdate.downloadAndInstall(
        (event: {
          event: "Started" | "Progress" | "Finished";
          data?: { contentLength?: number; chunkLength?: number };
        }) => {
          if (event.event === "Started") {
            total = event.data?.contentLength ?? null;
            setStatus({ kind: "downloading", downloaded: 0, total });
          } else if (event.event === "Progress") {
            downloaded += event.data?.chunkLength ?? 0;
            setStatus({ kind: "downloading", downloaded, total });
          } else if (event.event === "Finished") {
            setStatus({ kind: "installed" });
          }
        },
      );

      // Une fois l'installation terminée, on relance automatiquement
      await relaunch();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function formatMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Mise à jour automatique</p>
          <p className="text-xs text-muted-foreground">
            Version installée : {currentVersion}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheck}
          disabled={
            status.kind === "checking" || status.kind === "downloading"
          }
        >
          {status.kind === "checking" ? (
            <>
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              Vérification…
            </>
          ) : (
            <>
              <Download className="mr-2 h-3.5 w-3.5" />
              Vérifier
            </>
          )}
        </Button>
      </div>

      {status.kind === "up_to_date" && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <Check className="mr-1.5 inline h-3.5 w-3.5" />
          Tu es à jour. Aucune nouvelle version disponible.
        </div>
      )}

      {status.kind === "available" && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-primary">
            🎉 Nouvelle version disponible : v{status.version}
          </p>
          {status.notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {status.notes}
            </p>
          )}
          <Button size="sm" className="mt-3" onClick={handleInstall}>
            <Download className="mr-2 h-3.5 w-3.5" />
            Télécharger et installer
          </Button>
        </div>
      )}

      {status.kind === "downloading" && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Téléchargement en cours…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMB(status.downloaded)} Mo
            {status.total ? ` / ${formatMB(status.total)} Mo` : ""}
          </p>
          {status.total && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, (status.downloaded / status.total) * 100)}%`,
                }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            L'application redémarrera automatiquement à la fin.
          </p>
        </div>
      )}

      {status.kind === "installed" && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Installation terminée. Redémarrage…
        </div>
      )}

      {status.kind === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Erreur : {status.message}
        </div>
      )}
    </div>
  );
}
