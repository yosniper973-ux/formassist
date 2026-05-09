import { db } from "./db";
import type { ProfessionalInfo } from "@/types/invoice";

/**
 * Infos pro de l'émetteur (formateur indépendant) — affichées sur les factures.
 * Stockées en clés app_config pour rester cohérent avec api_key, budget_monthly, etc.
 */

const KEYS = {
  full_name: "pro_full_name",
  address: "pro_address",
  siret: "pro_siret",
  nda: "pro_nda",
  naf_code: "pro_naf_code",
  tva_number: "pro_tva_number",
  tva_exempt: "pro_tva_exempt",
  rib: "pro_rib",
  bank_name: "pro_bank_name",
  iban: "pro_iban",
  bic: "pro_bic",
} as const;

export async function getProfessionalInfo(): Promise<ProfessionalInfo> {
  const [
    full_name,
    address,
    siret,
    nda,
    naf_code,
    tva_number,
    tva_exempt,
    rib,
    bank_name,
    iban,
    bic,
  ] = await Promise.all([
    db.getConfig(KEYS.full_name),
    db.getConfig(KEYS.address),
    db.getConfig(KEYS.siret),
    db.getConfig(KEYS.nda),
    db.getConfig(KEYS.naf_code),
    db.getConfig(KEYS.tva_number),
    db.getConfig(KEYS.tva_exempt),
    db.getConfig(KEYS.rib),
    db.getConfig(KEYS.bank_name),
    db.getConfig(KEYS.iban),
    db.getConfig(KEYS.bic),
  ]);

  return {
    full_name: full_name ?? "",
    address: address ?? "",
    siret: siret ?? "",
    nda: nda ?? "",
    naf_code: naf_code ?? "",
    tva_number: tva_number ?? null,
    tva_exempt: tva_exempt === "1",
    rib: rib ?? "",
    bank_name: bank_name ?? "",
    iban: iban ?? "",
    bic: bic ?? "",
  };
}

export async function setProfessionalInfo(info: ProfessionalInfo): Promise<void> {
  await Promise.all([
    db.setConfig(KEYS.full_name, info.full_name.trim()),
    db.setConfig(KEYS.address, info.address.trim()),
    db.setConfig(KEYS.siret, info.siret.replace(/\s+/g, "")),
    db.setConfig(KEYS.nda, info.nda.trim()),
    db.setConfig(KEYS.naf_code, info.naf_code.replace(/\s+/g, "").toUpperCase()),
    db.setConfig(KEYS.tva_number, (info.tva_number ?? "").trim()),
    db.setConfig(KEYS.tva_exempt, info.tva_exempt ? "1" : "0"),
    db.setConfig(KEYS.rib, info.rib.trim()),
    db.setConfig(KEYS.bank_name, info.bank_name.trim()),
    db.setConfig(KEYS.iban, info.iban.replace(/\s+/g, "")),
    db.setConfig(KEYS.bic, info.bic.replace(/\s+/g, "")),
  ]);
}

/** Vérifie que les infos minimales pour générer une facture sont présentes. */
export function isProfessionalInfoComplete(info: ProfessionalInfo): boolean {
  return !!(info.full_name && info.address && info.siret);
}
