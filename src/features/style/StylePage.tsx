import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  Upload,
  FileText,
  X,
  Euro,
} from "lucide-react";
import { db } from "@/lib/db";
import { request as claudeRequest } from "@/lib/claude";
import { useAppStore } from "@/stores/appStore";
import type { StyleProfile } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Step = 1 | 2 | 3;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STEP_LABELS: Record<Step, string> = {
  1: "Auto-description",
  2: "Analyse IA",
  3: "Confirmation",
};

export function StylePage() {
  const addApiCost = useAppStore((s) => s.addApiCost);

  // Profile state
  const [, setProfile] = useState<StyleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selfDescription, setSelfDescription] = useState("");
  const [sampleFiles, setSampleFiles] = useState<string[]>([]);
  const [analyzedProfile, setAnalyzedProfile] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Step & UI state
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);

  // Chat state (step 3)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load existing profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function loadProfile() {
    setLoading(true);
    try {
      const row = await db.getStyleProfile();
      if (row) {
        const p = row as unknown as StyleProfile;
        setProfile(p);
        setSelfDescription(p.self_description ?? "");
        setSampleFiles(p.sample_files ?? []);
        setAnalyzedProfile(p.analyzed_profile ?? null);
        setConfirmed(p.confirmed ?? false);

        // Determine initial step based on existing data
        if (p.confirmed) {
          setCurrentStep(3);
        } else if (p.analyzed_profile) {
          setCurrentStep(3);
        } else if (p.self_description) {
          setCurrentStep(1);
        }
      }
    } catch (err) {
      setError("Impossible de charger le profil de style.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveDescription() {
    try {
      await db.updateStyleProfile({
        self_description: selfDescription,
        sample_files: JSON.stringify(sampleFiles),
      });
    } catch (err) {
      console.error("Erreur sauvegarde description :", err);
    }
  }

  async function handleAnalyze() {
    if (!selfDescription.trim()) {
      setError("Ecris d'abord une description de ton style avant de lancer l'analyse.");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setLastCost(null);

    try {
      // Save description first
      await saveDescription();

      const response = await claudeRequest({
        task: "analyse_style",
        messages: [
          {
            role: "user",
            content: selfDescription,
          },
        ],
      });

      setAnalyzedProfile(response.content);
      setLastCost(response.costEuros);
      addApiCost(response.costEuros);

      // Persist analysis
      await db.updateStyleProfile({
        analyzed_profile: response.content,
        confirmed: false,
      });
      setConfirmed(false);
      setChatMessages([]);
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirm() {
    try {
      await db.updateStyleProfile({ confirmed: true });
      setConfirmed(true);
      setCurrentStep(3);
    } catch (err) {
      setError("Erreur lors de la confirmation.");
      console.error(err);
    }
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    setError(null);
    setLastCost(null);

    try {
      const response = await claudeRequest({
        task: "affinage_style",
        messages: [
          // Provide the current profile as context in the first message
          {
            role: "user",
            content: `Voici mon profil de style actuel :\n\n${analyzedProfile}\n\nMa demande : ${newMessages[0]?.content ?? ""}`,
          },
          // Then send the full conversation (skip the first if only one message)
          ...newMessages.slice(1).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
      });

      setLastCost(response.costEuros);
      addApiCost(response.costEuros);

      // If the AI returns a refined profile, update it
      setAnalyzedProfile(response.content);
      await db.updateStyleProfile({
        analyzed_profile: response.content,
        confirmed: false,
      });
      setConfirmed(false);

      setChatMessages([...newMessages, { role: "assistant", content: response.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'affinage.");
    } finally {
      setChatLoading(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).map((f) => f.name);
    setSampleFiles((prev) => [...prev, ...newFiles]);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  function removeFile(index: number) {
    setSampleFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function goToStep(step: Step) {
    // Only allow going to steps that make sense
    if (step === 2 && !analyzedProfile) return;
    if (step === 3 && !analyzedProfile) return;
    setCurrentStep(step);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profil de Style</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Definis ton style pedagogique pour que l'IA adapte ses productions.
          </p>
        </div>
        {confirmed && (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Confirme
          </Badge>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((step) => {
          const isActive = currentStep === step;
          const isCompleted =
            (step === 1 && !!selfDescription.trim()) ||
            (step === 2 && !!analyzedProfile) ||
            (step === 3 && confirmed);
          const isClickable =
            step === 1 || (step === 2 && !!analyzedProfile) || (step === 3 && !!analyzedProfile);

          return (
            <button
              key={step}
              onClick={() => isClickable && goToStep(step)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-primary/10 text-primary cursor-pointer"
                    : isClickable
                      ? "bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80"
                      : "bg-muted text-muted-foreground/50 cursor-not-allowed"
              }`}
            >
              <span
                className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : isCompleted
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted-foreground/20 text-muted-foreground"
                }`}
              >
                {isCompleted && !isActive ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  step
                )}
              </span>
              {STEP_LABELS[step]}
            </button>
          );
        })}
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Cost display */}
      {lastCost !== null && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Euro className="h-3 w-3" />
          Cout de cet appel : {lastCost.toFixed(4)} EUR
        </div>
      )}

      {/* Step 1: Auto-description */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Decris ton style pedagogique</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="self-description">Ta description</Label>
                <Textarea
                  id="self-description"
                  value={selfDescription}
                  onChange={(e) => setSelfDescription(e.target.value)}
                  placeholder={
                    "Decris ici ton style de formatrice...\n\n" +
                    "Par exemple :\n" +
                    "- Quel ton utilises-tu ? (formel, decontracte, humoristique...)\n" +
                    "- Comment structures-tu tes cours ? (theorique d'abord, mises en situation, exercices pratiques...)\n" +
                    "- Quels supports preferes-tu ? (diaporamas, fiches, cas pratiques, jeux...)\n" +
                    "- Comment t'adresses-tu aux apprenants ? (tutoiement, vouvoiement...)\n" +
                    "- Quelles sont tes expressions ou tournures habituelles ?\n" +
                    "- Quelle est ta philosophie pedagogique ?"
                  }
                  rows={10}
                  className="resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Plus ta description est detaillee, plus l'analyse sera pertinente.
                </p>
              </div>

              {/* Sample files */}
              <div className="space-y-2">
                <Label>Documents exemples (optionnel)</Label>
                <p className="text-xs text-muted-foreground">
                  Tu peux ajouter des noms de fichiers que tu utilises en formation pour aider
                  l'analyse.
                </p>
                <div className="flex flex-wrap gap-2">
                  {sampleFiles.map((file, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                      <FileText className="h-3 w-3" />
                      {file}
                      <button
                        onClick={() => removeFile(i)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-primary hover:underline">
                  <Upload className="h-4 w-4" />
                  Ajouter un document
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.docx,.doc,.txt,.pptx,.ppt"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={handleAnalyze} disabled={analyzing || !selfDescription.trim()}>
                  {analyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analyser
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: AI Analysis Result */}
      {currentStep === 2 && analyzedProfile && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Ton profil de style analyse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {analyzedProfile}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Modifier ma description
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                Demander des ajustements
              </Button>
              <Button onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmer ce profil
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation & Refinement */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {/* Current profile summary */}
          {analyzedProfile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Profil actuel
                  </span>
                  <div className="flex items-center gap-2">
                    {confirmed && (
                      <Badge variant="default" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Confirme
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCurrentStep(1);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Relancer l'analyse
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {analyzedProfile}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Confirm button if not yet confirmed */}
          {!confirmed && analyzedProfile && (
            <div className="flex justify-end">
              <Button onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmer ce profil
              </Button>
            </div>
          )}

          {/* Chat for refinements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Affiner ton profil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tu peux demander des ajustements a ton profil ici. L'IA modifiera le profil en
                fonction de tes retours.
              </p>

              {/* Chat messages */}
              {chatMessages.length > 0 && (
                <div className="border rounded-lg p-3 max-h-72 overflow-y-auto space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Chat input */}
              <div className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ex: Rends le ton plus decontracte, ajoute plus d'humour..."
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSend();
                    }
                  }}
                />
                <Button
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  className="self-end"
                >
                  {chatLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
