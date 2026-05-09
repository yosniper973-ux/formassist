export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface Invoice {
  id: string;
  centre_id: string;
  formation_id: string | null;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  hourly_rate: number;
  total_ht: number;
  tva_rate: number;
  total_ttc: number;
  status: InvoiceStatus;
  due_date: string | null;
  paid_date: string | null;
  file_path: string | null;
  adjustments: InvoiceAdjustment[] | null;
  sent_at: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  slot_id: string | null;
  description: string;
  hours: number;
  rate: number;
  amount_ht: number;
  sort_order: number;
}

export interface InvoiceAdjustment {
  description: string;
  amount: number;
  type: "discount" | "fee" | "cancellation";
}

export interface ProfessionalInfo {
  full_name: string;
  address: string;
  siret: string;
  nda: string;          // Numéro de déclaration d'activité
  naf_code: string;     // Code NAF / APE (ex : 8559A)
  tva_number: string | null;
  tva_exempt: boolean;  // true = franchise TVA (art. 293 B CGI)
  rib: string;
  bank_name: string;
  iban: string;
  bic: string;
}
