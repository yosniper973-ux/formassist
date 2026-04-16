import { Smartphone, Server, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onNext: () => void;
}

export function Step0ClaudeExplain({ onNext }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          claude.ai vs l'API Claude : quelle différence ?
        </h2>
        <p className="mt-2 text-muted-foreground">
          Avant de commencer, clarifions un point important.
        </p>
      </div>

      {/* Analogie */}
      <div className="grid grid-cols-2 gap-4">
        {/* claude.ai */}
        <div className="rounded-xl border-2 border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">claude.ai Pro</span>
          </div>
          <p className="mb-3 text-sm font-medium text-primary">Ton abonnement actuel</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              Tu l'utilises déjà via ton navigateur
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              Parfait pour tes conversations libres
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              Forfait mensuel fixe
            </li>
          </ul>
        </div>

        {/* API */}
        <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <span className="font-semibold">API Claude</span>
          </div>
          <p className="mb-3 text-sm font-medium text-primary">Ce que FormAssist va utiliser</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              Connexion directe app ↔ Claude
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              Génération en lot, automatisations
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              Paiement à l'usage (pas d'abonnement)
            </li>
          </ul>
        </div>
      </div>

      {/* Analogie téléphonique */}
      <div className="rounded-xl bg-muted/50 p-5">
        <p className="text-sm font-medium text-foreground">💡 L'analogie simple :</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Imagine que claude.ai, c'est ton forfait téléphonique personnel : tu paies un abonnement
          mensuel et tu appelles qui tu veux. L'API, c'est le même opérateur, mais avec un forfait
          professionnel distinct — tu ne paies que les appels passés, et ça te donne des
          fonctionnalités supplémentaires (automatisation, volume, intégration dans les apps).
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          Les deux coexistent sans problème. Ce n'est pas l'un ou l'autre.
        </p>
      </div>

      {/* Rassurance */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div className="text-sm">
          <p className="font-medium text-blue-800">FormAssist complète ton usage de Claude.ai</p>
          <p className="mt-0.5 text-blue-700">
            Continue à utiliser claude.ai Pro pour tes échanges personnels. FormAssist, lui,
            se connecte à l'API pour les tâches de production : génération en lot, corrections,
            fiches pédagogiques, suivi…
          </p>
        </div>
      </div>

      <Button onClick={onNext} className="w-full" size="lg">
        C'est clair, on continue
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
