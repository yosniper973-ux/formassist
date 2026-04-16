import { useState } from "react";
import { ExternalLink, ArrowRight, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";

interface Props {
  onNext: () => void;
}

const FAQ = [
  {
    q: "J'ai déjà un compte claude.ai, est-ce que je le réutilise ?",
    a: "Non. Le compte console.anthropic.com est distinct de claude.ai, même si c'est le même créateur (Anthropic). Tu dois créer un nouveau compte séparé avec la même adresse email si tu veux.",
  },
  {
    q: "Le site est en anglais, je ne comprends pas tout.",
    a: "C'est normal. Les parties importantes sont : « Sign up » pour créer ton compte, le champ email et le champ mot de passe. Le reste n'est pas nécessaire pour commencer.",
  },
  {
    q: "Le site me demande de vérifier mon numéro de téléphone.",
    a: "C'est une étape de sécurité standard d'Anthropic. Renseigne ton numéro de mobile français. Tu recevras un SMS de vérification à 6 chiffres.",
  },
  {
    q: "Je ne reçois pas l'email de confirmation.",
    a: "Vérifie ton dossier spam ou courrier indésirable. L'email vient de l'adresse no-reply@anthropic.com. Si rien, attends 5 minutes et vérifie à nouveau.",
  },
];

export function Step2CreateAccount({ onNext }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function openConsole() {
    try {
      await open("https://console.anthropic.com/login");
    } catch {
      // Fallback si le plugin shell n'est pas dispo (dev mode)
      window.open("https://console.anthropic.com/login", "_blank");
    }
  }

  const steps = [
    { num: 1, text: 'Clique sur "Ouvrir le site" ci-dessous.' },
    { num: 2, text: 'Sur le site, clique sur "Sign up" (en haut à droite).' },
    { num: 3, text: "Renseigne ton adresse email et choisis un mot de passe." },
    { num: 4, text: "Confirme ton email (clique sur le lien reçu par mail)." },
    { num: 5, text: "Si demandé, vérifie ton numéro de téléphone par SMS." },
    { num: 6, text: "Ton compte est créé ! Reviens ici pour continuer." },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Créer ton compte Anthropic</h2>
        <p className="mt-2 text-muted-foreground">
          Rends-toi sur console.anthropic.com pour créer ton compte API.
        </p>
      </div>

      {/* Bouton principal */}
      <Button
        onClick={openConsole}
        size="lg"
        className="w-full gap-2 text-base"
        variant="outline"
      >
        <ExternalLink className="h-5 w-5" />
        Ouvrir console.anthropic.com
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

      {/* FAQ */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Questions fréquentes
        </div>
        {FAQ.map((item, i) => (
          <div key={i} className="rounded-lg border">
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
            >
              {item.q}
              {openFaq === i ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            {openFaq === i && (
              <div className="border-t px-4 py-3 text-sm text-muted-foreground">{item.a}</div>
            )}
          </div>
        ))}
      </div>

      <Button onClick={onNext} className="w-full" size="lg">
        Mon compte est créé, continuer
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
