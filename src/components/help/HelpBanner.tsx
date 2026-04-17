import { useState, useEffect } from "react";
import { HelpCircle, X, Lightbulb } from "lucide-react";

interface Props {
  id: string;        // clé unique pour localStorage
  title: string;
  description: string;
  tip?: string;      // astuce optionnelle en doré
}

export function HelpBanner({ id, title, description, tip }: Props) {
  const key = `formassist_help_dismissed_${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(key);
    if (!dismissed) setVisible(true);
  }, [key]);

  function dismiss() {
    localStorage.setItem(key, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary">{title}</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>
            {tip && (
              <div className="mt-2 flex items-start gap-1.5">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700">{tip}</p>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          aria-label="Fermer l'aide"
          title="Ne plus afficher"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
