import { useState } from "react";
import { CheckCircle2, Lock, Sparkles, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRESET_LABELS } from "@/config/models";

const PRESET_KEYS = ["quality", "balanced", "economic"] as const;

interface Props {
  onComplete: (budget: number, preset: string) => void;
}

export function Step7Finalize({ onComplete }: Props) {
  const [budget, setBudget] = useState("25");
  const [selectedPreset, setSelectedPreset] = useState("quality");

  const budgetNum = parseFloat(budget) || 25;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Derniers réglages</h2>
        <p className="mt-2 text-muted-foreground">
          Quelques préférences rapides pour personnaliser ton expérience.
        </p>
      </div>

      {/* Confirmation sécurité */}
      <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div className="text-sm">
          <p className="font-semibold text-green-800">Ta clé API est sécurisée</p>
          <p className="mt-0.5 text-green-700">
            Elle est chiffrée avec AES-256 et stockée uniquement sur ton ordinateur.
            Personne d'autre ne peut y accéder.
          </p>
        </div>
      </div>

      {/* Choix du préréglage */}
      <div className="space-y-3">
        <Label>Préréglage de qualité</Label>
        <p className="text-sm text-muted-foreground">
          Détermine quels modèles Claude sont utilisés pour chaque type de tâche. Tu pourras
          changer ça à tout moment dans les paramètres.
        </p>
        <div className="space-y-2">
          {PRESET_KEYS.map((preset) => {
            const info = PRESET_LABELS[preset]!;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setSelectedPreset(preset)}
                className={`flex w-full items-center justify-between rounded-lg border-2 p-4 text-left transition-colors ${
                  selectedPreset === preset
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{info.name}</p>
                    {preset === "quality" && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Recommandé
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{info.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{info.budgetRange}</p>
                  <p className="text-xs text-muted-foreground">/ mois</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Budget mensuel */}
      <div className="space-y-2">
        <Label htmlFor="budget">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Budget mensuel API (€)
          </div>
        </Label>
        <p className="text-sm text-muted-foreground">
          FormAssist t'alertera quand tu approches de cette limite. Recommandé : 25 €.
        </p>
        <div className="flex items-center gap-3">
          <Input
            id="budget"
            type="number"
            min={1}
            max={500}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">euros / mois</span>
        </div>
      </div>

      {/* Résumé */}
      <div className="rounded-xl bg-muted/50 p-4">
        <p className="text-sm font-medium text-foreground">Récapitulatif de ta configuration :</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Clé API configurée et testée ✓
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Préréglage : {PRESET_LABELS[selectedPreset]?.name}
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Budget mensuel : {budgetNum} €
          </li>
        </ul>
      </div>

      <Button
        onClick={() => onComplete(budgetNum, selectedPreset)}
        className="w-full"
        size="lg"
      >
        <Sparkles className="h-4 w-4" />
        Terminer la configuration
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
