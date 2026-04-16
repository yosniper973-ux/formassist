import { ExternalLink, ArrowRight, ShieldCheck } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  onNext: () => void;
}

export function Step3AddCredit({ onNext }: Props) {
  async function openBilling() {
    try {
      await open("https://console.anthropic.com/settings/billing");
    } catch {
      window.open("https://console.anthropic.com/settings/billing", "_blank");
    }
  }

  const steps = [
    {
      num: 1,
      text: 'Clique sur "Ouvrir la facturation" ci-dessous.',
    },
    {
      num: 2,
      text: 'Clique sur "Add credit" ou "Buy credits" (selon la version du site).',
    },
    {
      num: 3,
      text: "Saisis le montant voulu (recommandé : 15 à 20 €) et tes informations de paiement.",
    },
    {
      num: 4,
      text: "Valide. Le crédit est immédiatement disponible.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Ajouter du crédit</h2>
        <p className="mt-2 text-muted-foreground">
          Pour utiliser l'API Claude, tu dois prépayer un crédit. Anthropic débite uniquement
          ce que tu utilises, sans jamais dépasser ce que tu as versé.
        </p>
      </div>

      {/* Recommandation */}
      <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
        <p className="text-sm font-medium text-primary">💡 Combien mettre pour commencer ?</p>
        <p className="mt-2 text-2xl font-bold text-foreground">15 à 20 €</p>
        <p className="mt-1 text-sm text-muted-foreground">
          C'est largement suffisant pour plusieurs semaines d'utilisation avec le préréglage
          Qualité maximale (Opus). Une fois le crédit épuisé, l'app t'avertit et tu en rajoutes
          quand tu veux.
        </p>
      </div>

      {/* Bouton */}
      <Button
        onClick={openBilling}
        size="lg"
        className="w-full gap-2 text-base"
        variant="outline"
      >
        <ExternalLink className="h-5 w-5" />
        Ouvrir la facturation Anthropic
      </Button>

      {/* Étapes */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Marche à suivre :</p>
        {steps.map((s) => (
          <div key={s.num} className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {s.num}
            </div>
            <p className="pt-0.5 text-sm text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </div>

      {/* Sécurité */}
      <Alert variant="default" className="border-green-200 bg-green-50">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">Paiement sécurisé</AlertTitle>
        <AlertDescription className="text-green-700">
          Le paiement s'effectue directement sur le site d'Anthropic, pas via FormAssist.
          Tes coordonnées bancaires ne transitent jamais par l'application.
        </AlertDescription>
      </Alert>

      <Button onClick={onNext} className="w-full" size="lg">
        J'ai ajouté du crédit, continuer
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
