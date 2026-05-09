use std::path::{Path, PathBuf};
use std::process::Command;

/// Recherche LibreOffice (soffice) sur le système.
/// Mac : /Applications/LibreOffice.app/Contents/MacOS/soffice
/// Windows : C:\Program Files\LibreOffice\program\soffice.exe
/// Linux : /usr/bin/soffice
fn find_libreoffice() -> Option<PathBuf> {
    let candidates: Vec<&str> = vec![
        // macOS
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        // Windows
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        // Linux / autres
        "/usr/bin/soffice",
        "/usr/local/bin/soffice",
        "/snap/bin/libreoffice",
    ];

    for path in candidates {
        let p = Path::new(path);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }

    // Tente aussi `soffice` dans le PATH
    if Command::new("soffice").arg("--version").output().is_ok() {
        return Some(PathBuf::from("soffice"));
    }

    None
}

/// Convertit un fichier DOCX en PDF en utilisant LibreOffice headless.
///
/// Renvoie le chemin du PDF généré (placé dans le même dossier que le DOCX,
/// ou dans `output_dir` si fourni).
///
/// Erreurs courantes :
/// - LibreOffice non installé → message clair avec lien d'installation
/// - DOCX corrompu / inaccessible → message d'erreur de soffice
#[tauri::command]
pub async fn docx_to_pdf(
    input_path: String,
    output_dir: Option<String>,
) -> Result<String, String> {
    let input = Path::new(&input_path);
    if !input.exists() {
        return Err(format!("Fichier introuvable : {}", input_path));
    }
    if !input.is_file() {
        return Err(format!("Le chemin n'est pas un fichier : {}", input_path));
    }

    let soffice = find_libreoffice().ok_or_else(|| {
        "LibreOffice n'est pas installé. Téléchargez-le gratuitement sur \
         https://www.libreoffice.org/ puis réessayez."
            .to_string()
    })?;

    let out_dir: PathBuf = match output_dir {
        Some(d) => PathBuf::from(d),
        None => input
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::env::temp_dir()),
    };

    if !out_dir.exists() {
        std::fs::create_dir_all(&out_dir)
            .map_err(|e| format!("Impossible de créer le dossier de sortie : {}", e))?;
    }

    let output = Command::new(&soffice)
        .args([
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            out_dir
                .to_str()
                .ok_or_else(|| "Chemin de sortie invalide".to_string())?,
            input
                .to_str()
                .ok_or_else(|| "Chemin d'entrée invalide".to_string())?,
        ])
        .output()
        .map_err(|e| format!("Échec du lancement de LibreOffice : {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        return Err(format!(
            "LibreOffice a échoué.\nSTDOUT: {}\nSTDERR: {}",
            stdout.trim(),
            stderr.trim()
        ));
    }

    // Le PDF est généré avec le même nom de base, extension .pdf
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Nom de fichier invalide".to_string())?;
    let pdf_path = out_dir.join(format!("{}.pdf", stem));

    if !pdf_path.exists() {
        return Err(format!(
            "Conversion lancée mais le PDF n'a pas été créé : {}",
            pdf_path.display()
        ));
    }

    Ok(pdf_path.to_string_lossy().to_string())
}

/// Indique si LibreOffice est disponible sur la machine.
/// Permet à l'UI d'afficher un message d'aide proactif.
#[tauri::command]
pub fn is_libreoffice_available() -> bool {
    find_libreoffice().is_some()
}
