import { invoke } from "@tauri-apps/api/core";

/**
 * Convertit un fichier DOCX en PDF via LibreOffice headless (commande Rust).
 *
 * @param inputPath  Chemin absolu du DOCX source.
 * @param outputDir  Dossier où placer le PDF (par défaut : même dossier que le DOCX).
 * @returns          Chemin absolu du PDF généré.
 *
 * Lève une erreur claire si LibreOffice n'est pas installé.
 */
export async function docxToPdf(
  inputPath: string,
  outputDir?: string,
): Promise<string> {
  return invoke<string>("docx_to_pdf", {
    inputPath,
    outputDir: outputDir ?? null,
  });
}

/** Indique si LibreOffice est installé (sans tenter de conversion). */
export async function isLibreOfficeAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("is_libreoffice_available");
  } catch {
    return false;
  }
}
