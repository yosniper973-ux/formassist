import { useState, useEffect } from "react";
import { X, Building2, User, Mail, Phone, Globe, CreditCard, FileText } from "lucide-react";
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
}

const EMPTY_FORM: FormData = {
  name: "",
  color: PRESET_COLORS[0]!,
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
};

export function CentreFormDialog({ centre, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<"infos" | "facturation" | "mentions">("infos");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (centre) {
      setForm({
        name: centre.name,
        color: centre.color,
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
      });
    }
  }, [centre]);

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
    { id: "mentions" as const, label: "Mentions & PDF", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
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
    </div>
  );
}
