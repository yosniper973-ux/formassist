import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import type { DocxBranding } from "@/lib/docx-export";

/**
 * Charge le logo et la raison sociale du centre auquel appartient une formation.
 * Le logo est stocké sur disque (centres.logo_path) : on lit les octets côté Rust.
 * Renvoie un objet vide si le centre n'a pas de logo — l'export reste valide.
 */
export async function brandingForFormation(formationId: string): Promise<DocxBranding> {
  if (!formationId) return {};
  try {
    const rows = await db.query<{ name: string; logo_path: string | null }>(
      `SELECT c.name, c.logo_path FROM formations f
         JOIN centres c ON c.id = f.centre_id
        WHERE f.id = ?`,
      [formationId],
    );
    const centre = rows[0];
    if (!centre) return {};

    const branding: DocxBranding = { centreName: centre.name };
    if (centre.logo_path) {
      const bytes = await invoke<number[]>("read_file_bytes", { path: centre.logo_path });
      const ext = centre.logo_path.toLowerCase().split(".").pop();
      branding.logo = new Uint8Array(bytes);
      branding.logoType = ext === "jpg" || ext === "jpeg" ? "jpg" : "png";
    }
    return branding;
  } catch {
    // Logo introuvable ou illisible : on exporte sans, plutôt que d'échouer.
    return {};
  }
}
