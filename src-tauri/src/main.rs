// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Chemin du fichier de log de démarrage.
/// Sur Windows : %LOCALAPPDATA%\FormAssist\startup.log
fn log_path() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(base).join("FormAssist");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("startup.log")
}

/// Écrit un message dans le log de démarrage (avec timestamp Unix).
fn log(msg: &str) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        let _ = writeln!(f, "[{}] {}", ts, msg);
    }
    // Aussi afficher sur stderr si console dispo
    eprintln!("{}", msg);
}

/// Vérifie si WebView2 est installé sur Windows et l'installe silencieusement si nécessaire.
#[cfg(target_os = "windows")]
fn ensure_webview2() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    log("=== ensure_webview2() début ===");

    let exe_path = std::env::current_exe();
    log(&format!("current_exe: {:?}", exe_path));

    let exe_dir = exe_path
        .as_ref()
        .ok()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());

    if let Some(ref dir) = exe_dir {
        log(&format!("exe dir: {}", dir.display()));

        // Lister tous les fichiers/dossiers du dossier exe pour aider au diagnostic
        if let Ok(entries) = std::fs::read_dir(dir) {
            log("Contenu du dossier exe :");
            for entry in entries.flatten() {
                log(&format!("  - {}", entry.file_name().to_string_lossy()));
            }
        }
    }

    // Vérifier WebView2 dans le registre (3 emplacements possibles)
    let registry_keys = [
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    ];

    let mut found_version: Option<String> = None;
    for key in &registry_keys {
        if let Ok(output) = Command::new("reg")
            .args(["query", key, "/v", "pv"])
            .creation_flags(0x08000000)
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("pv") && trimmed.contains("REG_SZ") {
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if let Some(version) = parts.last() {
                            if !version.is_empty() && *version != "0.0.0.0" {
                                found_version = Some(version.to_string());
                                log(&format!(
                                    "WebView2 trouvé dans {} : version {}",
                                    key, version
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(version) = found_version {
        log(&format!("✅ WebView2 déjà installé (v{}), rien à faire", version));
        return;
    }

    log("❌ WebView2 absent, recherche de l'installateur bundlé...");

    // Chercher WebView2Installer.exe dans plusieurs chemins possibles
    if let Some(ref dir) = exe_dir {
        let candidates = [
            dir.join("WebView2Installer.exe"),
            dir.join("resources").join("WebView2Installer.exe"),
            dir.join("_up_").join("WebView2Installer.exe"),
            dir.join("..").join("WebView2Installer.exe"),
        ];

        for path in &candidates {
            let exists = path.exists();
            log(&format!("  Test : {} (existe: {})", path.display(), exists));
            if exists {
                log(&format!(
                    "✅ Installateur trouvé : {} — lancement /silent /install",
                    path.display()
                ));
                match Command::new(path)
                    .args(["/silent", "/install"])
                    .creation_flags(0x08000000)
                    .status()
                {
                    Ok(status) => {
                        log(&format!(
                            "Installation terminée avec code {:?}",
                            status.code()
                        ));
                    }
                    Err(e) => {
                        log(&format!("❌ Erreur lors de l'exécution : {}", e));
                    }
                }
                return;
            }
        }

        log("❌ WebView2Installer.exe INTROUVABLE dans tous les chemins testés !");
    } else {
        log("❌ Impossible de déterminer le dossier de l'exécutable");
    }
}

fn main() {
    // Installer un hook pour capturer les panics dans le log
    std::panic::set_hook(Box::new(|info| {
        log(&format!("💥 PANIC : {}", info));
    }));

    log("########## Démarrage FormAssist ##########");

    #[cfg(target_os = "windows")]
    ensure_webview2();

    log("Lancement de l'interface Tauri (formassist_lib::run)...");
    formassist_lib::run();
    log("Interface Tauri terminée normalement");
}
