import { ExternalLink, ArrowRight, AlertTriangle } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  onNext: () => void;
}

export function Step4CreateKey({ onNext }: Props) {
  async function openApiKeys() {
    try {
      await open("https://console.anthropic.com/settings/keys");
    } catch {
      window.open("https://console.anthropic.com/settings/keys", "_blank");
    }
  }

  const steps = [
    { num: 1, text: 'Clique sur "Ouvrir les clés API" ci-dessous.' },
    { num: 2, text: 'Sur la page, clique sur le bouton "+ Create Key" (en haut à droite).' },
    { num: 3, text: 'Dans le champ "Name", écris "FormAssist" pour t\'y retrouver.' },
    { num: 4, text: 'Clique sur "Create Key".' },
    { num: 5, text: "Ta clé apparaît. Elle commence par sk-ant-api…" },
    {
      num: 6,
      text: "⚠️ COPIE-LA MAINTENANT. Elle ne sera plus jamais visible après la fermeture de cette fenêtre.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Créer une clé API</h2>
        <p className="mt-2 text-muted-foreground">
          La clé API permet à FormAssist de se connecter à Claude en ton nom. C'est comme un
          mot de passe spécifique à l'application.
        </p>
      </div>

      {/* Bouton */}
      <Button
        onClick={openApiKeys}
        size="lg"
        className="w-full gap-2 text-base"
        variant="outline"
      >
        <ExternalLink className="h-5 w-5" />
        Ouvrir les clés API
      </Button>

      {/* Étapes */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Marche à suivre :</p>
        {steps.map((s) => (
          <div key={s.num} className="flex items-start gap-3">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.num === 6
                  ? "bg-orange-100 text-orange-700"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {s.num}
            </div>
            <p
              className={`pt-0.5 text-sm ${
                s.num === 6 ? "font-semibold text-orange-700" : "text-muted-foreground"
              }`}
            >
              {s.text}
            </p>
          </div>
        ))}
      </div>

      {/* Alerte importante */}
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important : note ta clé dès maintenant !</AlertTitle>
        <AlertDescription>
          Anthropic ne te montrera cette clé qu'une seule fois. Si tu fermes la fenêtre sans
          la copier, tu devras en créer une nouvelle. Prends le temps de la copier dans un
          endroit sûr avant de continuer.
        </AlertDescription>
      </Alert>

      <Button onClick={onNext} className="w-full" size="lg">
        J'ai ma clé, continuer
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
