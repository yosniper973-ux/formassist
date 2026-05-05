import { useState, useEffect } from "react";
import { Upload, FileText, ClipboardPaste, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { useAppStore } from "@/stores/appStore";
import type { Formation } from "@/types";
import type { ContentType } from "@/types/content";

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "course", label: "Cours" },
  { value: "exercise_individual", label: "Exercice individuel" },
  { value: "exercise_small_group", label: "Exercice petit groupe" },
  { value: "exercise_collective", label: "Exercice collectif" },
  { value: "pedagogical_game", label: "Jeu pédagogique" },
  { value: "role_play", label: "Mise en situation" },
  { value: "trainer_sheet", label: "Fiche pédagogique" },
];

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function ImportContentDialog({ onClose, onImported }: Props) {
  const { activeCentreId } = useAppStore();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [formationId, setFormationId] = useState("");
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("course");
  const [method, setMethod] = useState<"paste" | "file">("paste");
  const [pastedText, setPastedText] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    if (activeCentreId) {
      db.getFormations(activeCentreId)
        .then((rows) => setFormations(rows as unknown as Formation[]))
        .catch(console.error);
    }
  }, [activeCentreId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setExtractedText("");
    setFilename(file.name);
    setFileLoading(true);

    try {
      const name = file.name.toLowerCase();

      if (name.endsWith(".txt") || name.endsWith(".md")) {
        const text = await file.text();
        setExtractedText(text);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
        setFileLoading(false);
        return;
      }

      if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setExtractedText(result.value);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
        setFileLoading(false);
        return;
      }

      if (file.type === "application/pdf" || name.endsWith(".pdf")) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
          pages.push(pageText);
        }
        const fullText = pages.join("\n\n");
        setExtractedText(fullText);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
        setFileLoading(false);
        return;
      }

      setError("Format non supporté. Utilise .txt, .md, .docx ou .pdf.");
    } catch (err) {
      console.error("Import fichier:", err);
      setError("Impossible de lire ce fichier. Essaie de coller le texte directement.");
    } finally {
      setFileLoading(false);
    }

    e.target.value = "";
  }

  async function handleSave() {
    const text = method === "paste" ? pastedText : extractedText;
    if (!formationId || !title.trim() || !text.trim()) {
      setError("Formation, titre et contenu sont obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await db.createContent({
        formation_id: formationId,
        content_type: contentType,
        title: title.trim(),
        content_markdown: text.trim(),
        content_html: null,
        model_used: "import",
        generation_cost: 0,
        bloom_level: null,
        estimated_duration: null,
        source: "import",
        original_filename: filename || null,
      });
      onImported();
      onClose();
    } catch (err) {
      console.error("Sauvegarde import:", err);
      setError("Erreur lors de la sauvegarde. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  const contentReady = method === "paste" ? pastedText.trim() : extractedText.trim();
  const canSave = !!formationId && !!title.trim() && !!contentReady && !fileLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Importer un contenu</h2>
            <p className="text-sm text-muted-foreground">
              Cours ou exercice créé en dehors de l'application
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Formation */}
          <div className="space-y-1.5">
            <Label>Formation *</Label>
            <Select
              value={formationId}
              onChange={(e) => setFormationId(e.target.value)}
            >
              <option value="">Choisir une formation...</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </Select>
          </div>

          {/* Titre */}
          <div className="space-y-1.5">
            <Label>Titre *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Exercice sur la communication professionnelle"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type de contenu *</Label>
            <Select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              {CONTENT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Méthode d'import */}
          <div className="space-y-3">
            <Label>Méthode d'import *</Label>
            <div className="flex gap-2">
              <Button
                variant={method === "paste" ? "default" : "outline"}
                size="sm"
                onClick={() => setMethod("paste")}
              >
                <ClipboardPaste className="h-4 w-4" />
                Coller le texte
              </Button>
              <Button
                variant={method === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setMethod("file")}
              >
                <Upload className="h-4 w-4" />
                Importer un fichier
              </Button>
            </div>

            {method === "paste" && (
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Colle ici le contenu de ton cours ou exercice..."
                rows={10}
                className="font-mono text-sm"
              />
            )}

            {method === "file" && (
              <div className="space-y-3">
                <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  {fileLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground text-center">
                    {filename
                      ? fileLoading
                        ? "Extraction en cours..."
                        : filename
                      : "Clique pour choisir un fichier (.txt, .md, .docx, .pdf)"}
                  </span>
                  <input
                    type="file"
                    accept=".txt,.md,.docx,.pdf"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={fileLoading}
                  />
                </label>

                {extractedText && (
                  <div className="rounded-lg bg-muted p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs text-muted-foreground mb-1">
                      Aperçu ({extractedText.length} caractères extraits)
                    </p>
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {extractedText.slice(0, 500)}
                      {extractedText.length > 500 && "…"}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!canSave || loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importer
          </Button>
        </div>
      </div>
    </div>
  );
}
