import { Clock, CreditCard, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onNext: () => void;
}

export function Step1Welcome({ onNext }: Props) {
  const points = [
    {
      icon: <Clock className="h-5 w-5 text-primary" />,
      title: "5 minutes pour tout configurer",
      desc: "On va te guider pas à pas. Pas de technique, juste des clics.",
    },
    {
      icon: <CreditCard className="h-5 w-5 text-primary" />,
      title: "Paiement à l'usage, sans engagement",
      desc: "Tu paies uniquement ce que tu utilises, au centime près. Aucun abonnement.",
    },
    {
      icon: <Trash2 className="h-5 w-5 text-primary" />,
      title: "Arrêt sans frais à tout moment",
      desc: "Tu peux supprimer ton compte Anthropic API quand tu veux. Zéro pénalité.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Bienvenue dans FormAssist !</h2>
        <p className="mt-2 text-muted-foreground">
          Avant de pouvoir générer tes premiers contenus, il faut connecter l'application à
          l'API Claude d'Anthropic. Voilà ce que ça implique :
        </p>
      </div>

      <div className="space-y-4">
        {points.map((p, i) => (
          <div key={i} className="flex items-start gap-4 rounded-xl border bg-card p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {p.icon}
            </div>
            <div>
              <p className="font-semibold text-foreground">{p.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-muted p-5">
        <p className="text-sm font-medium text-foreground">💰 Combien ça coûte en pratique ?</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Avec le préréglage recommandé (Qualité maximale), compte{" "}
          <span className="font-semibold text-foreground">8 à 25 € par mois</span> selon ton
          volume d'utilisation. En mode économique, ça tombe à 1-4 €/mois. FormAssist t'affiche
          le coût en temps réel et t'alerte avant les générations importantes.
        </p>
      </div>

      <Button onClick={onNext} className="w-full" size="lg">
        Créer mon compte Anthropic
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
