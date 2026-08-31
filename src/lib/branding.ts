import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import type { DocxBranding } from "@/lib/docx-export";

/**
 * Dimensions d'un PNG ou d'un JPEG, lues dans l'en-tête du fichier.
 * Sans elles, le logo est affiché à une taille fixe et se retrouve écrasé :
 * un bandeau de quatre logos n'a pas les proportions d'un logo carré.
 */
function dimensions(b: Uint8Array): { w: number; h: number } | null {
  // PNG : signature puis IHDR, largeur et hauteur en 32 bits gros-boutiste.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // JPEG : on parcourt les segments jusqu'à un marqueur SOF.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: (b[i + 5]! << 8) | b[i + 6]!, w: (b[i + 7]! << 8) | b[i + 8]! };
      }
      i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
    }
  }
  return null;
}

/** Taille d'affichage du logo : tient dans 300 × 46 px sans déformation. */
export function tailleLogo(b: Uint8Array): { width: number; height: number } {
  const MAX_W = 300, MAX_H = 46;
  const d = dimensions(b);
  if (!d || d.w === 0 || d.h === 0) return { width: 150, height: 42 };
  const k = Math.min(MAX_W / d.w, MAX_H / d.h);
  return { width: Math.round(d.w * k), height: Math.round(d.h * k) };
}

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
      const octets = new Uint8Array(bytes);
      branding.logo = octets;
      branding.logoType = ext === "jpg" || ext === "jpeg" ? "jpg" : "png";
      branding.logoSize = tailleLogo(octets);
    }
    return branding;
  } catch {
    // Logo introuvable ou illisible : on exporte sans, plutôt que d'échouer.
    return {};
  }
}
