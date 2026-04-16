// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Vérifie si WebView2 est installé sur Windows et l'installe silencieusement si nécessaire.
/// Cette fonction est appelée AVANT le démarrage de l'interface Tauri, car WebView2 est
/// indispensable pour afficher la fenêtre de l'application.
#[cfg(target_os = "windows")]
fn ensure_webview2() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // Vérifier la présence de WebView2 dans le registre (machine ou utilisateur)
    let registry_keys = [
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    ];

    let already_installed = registry_keys.iter().any(|key| {
        Command::new("reg")
            .args(["query", key])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    });

    if already_installed {
        return;
    }

    // WebView2 absent — chercher le bootstrapper bundlé avec l'application
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(dir) = exe_dir {
        // Chercher dans le dossier de l'exe et dans un sous-dossier "resources"
        let candidates = [
            dir.join("WebView2Bootstrapper.exe"),
            dir.join("resources").join("WebView2Bootstrapper.exe"),
            dir.join("_up_").join("WebView2Bootstrapper.exe"),
        ];

        for bootstrapper in &candidates {
            if bootstrapper.exists() {
                // Installer WebView2 silencieusement pour l'utilisateur courant
                let _ = Command::new(bootstrapper)
                    .args(["/silent", "/install"])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .status();
                break;
            }
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    ensure_webview2();

    formassist_lib::run()
}
