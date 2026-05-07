import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Building2,
  User,
  Mail,
  Phone,
  Globe,
  CreditCard,
  FileText,
  FileType2,
  Upload,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import type { Centre } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PRESET_COLORS = [
  "#3B82F6", // bleu
  "#10B981", // vert
  "#F59E0B", // ambre
  "#EF4444", // rouge
  "#8B5CF6", // violet
  "#EC4899", // rose
  "#14B8A6", // cyan
  "#F97316", // orange
];

interface Props {
  centre: Centre | null; // null = création
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  name: string;
  color: string;
  logo_path: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  referent_name: string;
  referent_email: string;
  referent_phone: string;
  hourly_rate: string;
  billing_unit: string;
  payment_delay_days: string;
  invoice_numbering: string;
  bank_details: string;
  legal_mentions: string;
  deroulement_template_path: string;
  smtp_from_email: string;
}

const EMPTY_FORM: FormData = {
  name: "",
  color: PRESET_COLORS[0]!,
  logo_path: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  referent_name: "",
  referent_email: "",
  referent_phone: "",
  hourly_rate: "",
  billing_unit: "hour",
  payment_delay_days: "30",
  invoice_numbering: "",
  bank_details: "",
  legal_mentions: "",
  deroulement_template_path: "",
  smtp_from_email: "",
};

export function CentreFormDialog({ centre, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<
    "infos" | "facturation" | "email" | "mentions" | "modeles"
  >("infos");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (centre) {
      setForm({
        name: centre.name,
        color: centre.color,
        logo_path: centre.logo_path ?? "",
        address: centre.address ?? "",
        phone: centre.phone ?? "",
        email: centre.email ?? "",
        website: centre.website ?? "",
        referent_name: centre.referent_name ?? "",
        referent_email: centre.referent_email ?? "",
        referent_phone: centre.referent_phone ?? "",
        hourly_rate: centre.hourly_rate?.toString() ?? "",
        billing_unit: centre.billing_unit,
        payment_delay_days: centre.payment_delay_days.toString(),
        invoice_numbering: centre.invoice_numbering ?? "",
        bank_details: centre.bank_details ?? "",
        legal_mentions: centre.legal_mentions ?? "",
        deroulement_template_path: centre.deroulement_template_path ?? "",
        smtp_from_email: centre.smtp_from_email ?? "",
      });
    }
  }, [centre]);

  async function handleUploadLogo() {
    setError("");
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }],
      });
      if (!selected || typeof selected !== "string") return;
      setUploadingLogo(true);
      const savedPath = await invoke<string>("save_imported_file", {
        sourcePath: selected,
        category: "logos",
      });
      update("logo_path", savedPath);
    } catch (err) {
      console.error(err);
      setError("Impossible d'importer le logo. Réessaie.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleUploadTemplate() {
    setError("");
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Modèle Word", extensions: ["docx"] }],
      });
      if (!selected || typeof selected !== "string") return;
      setUploading(true);
      const savedPath = await invoke<string>("save_imported_file", {
        sourcePath: selected,
        category: "deroulement_templates",
      });
      update("deroulement_template_path", savedPath);
    } catch (err) {
      console.error(err);
      setError("Impossible d'importer le modèle. Réessaie.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveTemplate() {
    update("deroulement_template_path", "");
  }

  function update(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom du centre est obligatoire.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const data: Record<string, unknown> = {
        name: form.name.trim(),
        color: form.color,
        logo_path: form.logo_path || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        referent_name: form.referent_name || null,
        referent_email: form.referent_email || null,
        referent_phone: form.referent_phone || null,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        billing_unit: form.billing_unit,
        payment_delay_days: parseInt(form.payment_delay_days, 10),
        invoice_numbering: form.invoice_numbering || null,
        bank_details: form.bank_details || null,
        legal_mentions: form.legal_mentions || null,
        deroulement_template_path: form.deroulement_template_path || null,
        smtp_from_email: form.smtp_from_email || null,
      };

      if (centre) {
        await db.updateCentre(centre.id, data);
      } else {
        await db.createCentre({ ...data, pinned: 0 });
      }

      onSaved();
    } catch (err) {
      setError("Erreur lors de l'enregistrement. Réessaie.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "infos" as const, label: "Informations", icon: <Building2 className="h-4 w-4" /> },
    { id: "facturation" as const, label: "Facturation", icon: <CreditCard className="h-4 w-4" /> },
    { id: "email" as const, label: "Email", icon: <Mail className="h-4 w-4" /> },
    { id: "mentions" as const, label: "Mentions & PDF", icon: <FileText className="h-4 w-4" /> },
    { id: "modeles" as const, label: "Modèles", icon: <FileType2 className="h-4 w-4" /> },
  ];

  const templateFileName = form.deroulement_template_path
    ? form.deroulement_template_path.split(/[/\\]/).pop() ?? form.deroulement_template_path
    : "";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-card shadow-xl max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: form.color + "25" }}
            >
              <Building2 className="h-4 w-4" style={{ color: form.color }} />
            </div>
            <h2 className="text-lg font-semibold">
              {centre ? "Modifier le centre" : "Nouveau centre de formation"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* ─── Infos générales ─── */}
            {activeTab === "infos" && (
              <div className="space-y-4">
                {/* Nom + couleur */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Nom du centre <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Ex : Centre AFPA de Lyon"
                    autoFocus
                  />
                </div>

                {/* Couleur */}
                <div className="space-y-1.5">
                  <Label>Couleur (pour le calendrier)</Label>
                  <div className="flex items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => update("color", c)}
                        className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
                          form.color === c ? "ring-2 ring-ring ring-offset-2" : ""
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Couleur ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => update("color", e.target.value)}
                      className="h-7 w-7 cursor-pointer rounded-full border-0 p-0"
                      title="Couleur personnalisée"
                    />
                  </div>
                </div>

                {/* Logo */}
                <div className="space-y-1.5">
                  <Label>Logo du centre</Label>
                  {form.logo_path ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                      <img
                        src={convertFileSrc(form.logo_path)}
                        alt="Logo"
                        className="h-10 w-auto max-w-[80px] rounded object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-muted-foreground">
                          {form.logo_path.split(/[/\\]/).pop()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUploadLogo}
                        disabled={uploadingLogo}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Remplacer
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => update("logo_path", "")}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUploadLogo}
                      disabled={uploadingLogo}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {uploadingLogo ? "Import en cours…" : "Importer un logo (PNG, JPG, SVG)"}
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Utilisé sur les factures et fiches pédagogiques.
                  </p>
                </div>

                <Separator />

                {/* Contact */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        Téléphone
                      </div>
                    </Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="01 23 45 67 89"
                      type="tel"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        Email du centre
                      </div>
                    </Label>
                    <Input
                      id="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="contact@centre.fr"
                      type="email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="12 rue des Formateurs, 69001 Lyon"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="website">
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Site web
                    </div>
                  </Label>
                  <Input
                    id="website"
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                    placeholder="https://www.centre.fr"
                    type="url"
                  />
                </div>

                <Separator />

                {/* Référent */}
                <p className="text-sm font-medium text-foreground">
                  <User className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                  Coordinateur·rice référent·e
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ref-name">Nom</Label>
                    <Input
                      id="ref-name"
                      value={form.referent_name}
                      onChange={(e) => update("referent_name", e.target.value)}
                      placeholder="Prénom NOM"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ref-email">Email</Label>
                    <Input
                      id="ref-email"
                      value={form.referent_email}
                      onChange={(e) => update("referent_email", e.target.value)}
                      placeholder="coord@centre.fr"
                      type="email"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref-phone">Téléphone du référent</Label>
                  <Input
                    id="ref-phone"
                    value={form.referent_phone}
                    onChange={(e) => update("referent_phone", e.target.value)}
                    placeholder="06 12 34 56 78"
                    type="tel"
                  />
                </div>
              </div>
            )}

            {/* ─── Facturation ─── */}
            {activeTab === "facturation" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="rate">Taux horaire (€)</Label>
                    <Input
                      id="rate"
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.hourly_rate}
                      onChange={(e) => update("hourly_rate", e.target.value)}
                      placeholder="Ex : 45"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unit">Unité de facturation</Label>
                    <Select
                      id="unit"
                      value={form.billing_unit}
                      onChange={(e) => update("billing_unit", e.target.value)}
                    >
                      <option value="hour">Heure</option>
                      <option value="half_day">Demi-journée</option>
                      <option value="day">Journée</option>
                      <option value="flat">Forfait</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="delay">Délai de paiement (jours)</Label>
                  <Select
                    id="delay"
                    value={form.payment_delay_days}
                    onChange={(e) => update("payment_delay_days", e.target.value)}
                    className="w-48"
                  >
                    <option value="0">Comptant</option>
                    <option value="15">15 jours</option>
                    <option value="30">30 jours</option>
                    <option value="45">45 jours</option>
                    <option value="60">60 jours</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="numbering">Numérotation des factures</Label>
                  <Input
                    id="numbering"
                    value={form.invoice_numbering}
                    onChange={(e) => update("invoice_numbering", e.target.value)}
                    placeholder="Ex : FAC-2025-{NUM} ou {YYYY}-{MM}-{NUM}"
                  />
                  <p className="text-xs text-muted-foreground">
                    {"{NUM}"} = numéro auto, {"{YYYY}"} = année, {"{MM}"} = mois
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bank">Coordonnées bancaires (RIB)</Label>
                  <Textarea
                    id="bank"
                    value={form.bank_details}
                    onChange={(e) => update("bank_details", e.target.value)}
                    placeholder="IBAN : FR76…&#10;BIC : BNPAFRPP&#10;Banque : BNP Paribas"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* ─── Email ─── */}
            {activeTab === "email" && (
              <div className="space-y-5">
                <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <p>
                    Indique l'adresse email depuis laquelle tu envoies tes emails.
                    FormAssist ouvrira automatiquement <strong>Gmail</strong>,{" "}
                    <strong>Outlook / Hotmail</strong> ou ton client mail selon le domaine.
                    Aucun mot de passe n'est demandé.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-from-email">Ton adresse email</Label>
                  <Input
                    id="smtp-from-email"
                    value={form.smtp_from_email}
                    onChange={(e) => update("smtp_from_email", e.target.value)}
                    placeholder="ton.adresse@gmail.com"
                    type="email"
                  />
                  <p className="text-xs text-muted-foreground">
                    @gmail.com → Gmail · @hotmail.com / @outlook.com → Outlook · autre → client mail
                  </p>
                </div>
              </div>
            )}

            {/* ─── Modèles ─── */}
            {activeTab === "modeles" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Modèle de fiche de déroulement de séance (.docx)</Label>
                  <p className="text-xs text-muted-foreground">
                    Ce modèle sera utilisé pour générer toutes les fiches de déroulement de
                    séance rattachées aux factures de ce centre. Il doit contenir les balises
                    ci-dessous — l'IA les remplacera par les données planifiées. Si aucun
                    modèle n'est importé, un modèle standard FormAssist sera utilisé.
                  </p>
                  {form.deroulement_template_path ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                      <FileType2 className="h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{templateFileName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {form.deroulement_template_path}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUploadTemplate}
                        disabled={uploading}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Remplacer
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveTemplate}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUploadTemplate}
                      disabled={uploading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? "Import en cours…" : "Importer un modèle .docx"}
                    </button>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Balises à insérer dans votre modèle</p>
                  <p className="text-xs text-muted-foreground">
                    Ouvrez votre modèle Word et insérez (en texte normal) les balises
                    ci-dessous aux emplacements voulus. Elles seront automatiquement
                    remplacées lors de la génération.
                  </p>
                  <div className="rounded-md border bg-muted/30 p-3 text-xs font-mono space-y-1.5">
                    <div><code className="text-primary">{"{formation}"}</code> — titre de la formation</div>
                    <div><code className="text-primary">{"{dates}"}</code> — liste des dates de la période</div>
                    <div><code className="text-primary">{"{duree_totale}"}</code> — durée totale en heures</div>
                    <div><code className="text-primary">{"{redacteur}"}</code> — nom du rédacteur</div>
                    <div><code className="text-primary">{"{titre_seance}"}</code> — intitulé du CCP / de la séance</div>
                    <div><code className="text-primary">{"{objectif_general}"}</code> — objectif général</div>
                    <div className="pt-1.5 border-t mt-2">
                      <div className="font-semibold text-foreground/80 mb-1">Répéter pour chaque phase :</div>
                      <div><code className="text-primary">{"{#phases}"}</code> … <code className="text-primary">{"{/phases}"}</code></div>
                      <div className="pl-3 mt-1 space-y-1">
                        <div><code className="text-primary">{"{numero}"}</code>, <code className="text-primary">{"{duree}"}</code>, <code className="text-primary">{"{intitule}"}</code></div>
                        <div><code className="text-primary">{"{objectifs_operationnels}"}</code></div>
                        <div><code className="text-primary">{"{contenu}"}</code></div>
                        <div><code className="text-primary">{"{methodes}"}</code></div>
                        <div><code className="text-primary">{"{outils}"}</code></div>
                        <div><code className="text-primary">{"{evaluation}"}</code></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Mentions & PDF ─── */}
            {activeTab === "mentions" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="legal">Mentions légales spécifiques au centre</Label>
                  <Textarea
                    id="legal"
                    value={form.legal_mentions}
                    onChange={(e) => update("legal_mentions", e.target.value)}
                    placeholder="Ex : Formation dispensée dans le cadre d'un contrat de prestation avec [Centre]. N° de déclaration d'activité : …"
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ces mentions apparaîtront sur les fiches pédagogiques et factures générées
                    pour ce centre.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pied de formulaire */}
          <div className="border-t px-6 py-4">
            {error && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? "Enregistrement…" : centre ? "Enregistrer" : "Créer le centre"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
