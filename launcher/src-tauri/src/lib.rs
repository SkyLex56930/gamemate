use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const COMPANION_DOWNLOAD_URL: &str =
    "https://github.com/SkyLex56930/gamemate/releases/latest/download/GameMate.Companion_x64-setup.exe";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
struct CompanionStatus {
    installed: bool,
    path: Option<String>,
}

fn possible_install_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local_app_data);

        dirs.push(local.join("GameMate Companion"));
        dirs.push(local.join("Programs").join("GameMate Companion"));
        dirs.push(local.join("GameMate").join("Companion"));
    }

    if let Some(program_files) = env::var_os("PROGRAMFILES") {
        let program_files = PathBuf::from(program_files);
        dirs.push(program_files.join("GameMate Companion"));
        dirs.push(program_files.join("GameMate").join("Companion"));
    }

    if let Some(program_files_x86) = env::var_os("PROGRAMFILES(X86)") {
        let program_files = PathBuf::from(program_files_x86);
        dirs.push(program_files.join("GameMate Companion"));
    }

    dirs
}

fn executable_names() -> [&'static str; 4] {
    [
        "GameMate Companion.exe",
        "gamemate-companion.exe",
        "companion.exe",
        "GameMate.exe",
    ]
}

fn find_executable_in_directory(directory: &Path) -> Option<PathBuf> {
    for executable in executable_names() {
        let candidate = directory.join(executable);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn find_companion_executable() -> Option<PathBuf> {
    for directory in possible_install_directories() {
        if let Some(path) = find_executable_in_directory(&directory) {
            return Some(path);
        }

        if directory.is_dir() {
            if let Ok(entries) = fs::read_dir(&directory) {
                for entry in entries.flatten() {
                    let path = entry.path();

                    if path.is_dir() {
                        if let Some(exe) =
                            find_executable_in_directory(&path)
                        {
                            return Some(exe);
                        }
                    }
                }
            }
        }
    }

    None
}

fn current_status() -> CompanionStatus {
    match find_companion_executable() {
        Some(path) => CompanionStatus {
            installed: true,
            path: Some(path.to_string_lossy().to_string()),
        },
        None => CompanionStatus {
            installed: false,
            path: None,
        },
    }
}

#[tauri::command]
fn companion_status() -> CompanionStatus {
    current_status()
}

#[cfg(target_os = "windows")]
fn download_installer(destination: &Path) -> Result<(), String> {
    let destination_string = destination
        .to_str()
        .ok_or_else(|| "Chemin temporaire Windows invalide.".to_string())?
        .replace('\'', "''");

    let download_url = COMPANION_DOWNLOAD_URL.replace('\'', "''");

    let script = format!(
        "$ErrorActionPreference='Stop';\
         $ProgressPreference='SilentlyContinue';\
         Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile '{}'",
        download_url, destination_string
    );

    let status = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| {
            format!(
                "Impossible de démarrer le téléchargement : {error}"
            )
        })?;

    if !status.success() {
        return Err(
            "Le téléchargement de GameMate Companion a échoué. Vérifie que l’asset GitHub « GameMate.Companion_x64-setup.exe » existe dans la dernière release."
                .to_string(),
        );
    }

    if !destination.is_file() {
        return Err(
            "Le téléchargement s’est terminé sans créer l’installateur."
                .to_string(),
        );
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn download_installer(_destination: &Path) -> Result<(), String> {
    Err("GameMate Launcher prend actuellement en charge l’installation automatique sous Windows uniquement.".to_string())
}

fn install_companion_sync() -> Result<CompanionStatus, String> {
    if find_companion_executable().is_some() {
        return Ok(current_status());
    }

    let installer_path =
        env::temp_dir().join("GameMate.Companion_x64-setup.exe");

    if installer_path.exists() {
        let _ = fs::remove_file(&installer_path);
    }

    download_installer(&installer_path)?;

    // On lance DIRECTEMENT l'installateur EXE.
    // Aucun cmd.exe, aucun npm, aucun dossier de développement.
    let mut installer = Command::new(&installer_path)
        .spawn()
        .map_err(|error| {
            format!(
                "Impossible d’ouvrir l’installateur GameMate Companion : {error}"
            )
        })?;

    let exit_status = installer
        .wait()
        .map_err(|error| {
            format!(
                "Impossible d’attendre la fin de l’installation : {error}"
            )
        })?;

    let _ = fs::remove_file(&installer_path);

    if !exit_status.success() {
        return Err(
            "L’installation du Companion a été annulée ou n’a pas pu se terminer."
                .to_string(),
        );
    }

    let status = current_status();

    if !status.installed {
        return Err(
            "L’installateur s’est fermé correctement, mais le Launcher ne trouve pas encore GameMate Companion dans les dossiers d’installation Windows attendus."
                .to_string(),
        );
    }

    Ok(status)
}

#[tauri::command]
async fn install_companion() -> Result<CompanionStatus, String> {
    tauri::async_runtime::spawn_blocking(install_companion_sync)
        .await
        .map_err(|error| {
            format!("Erreur interne pendant l’installation : {error}")
        })?
}

#[tauri::command]
fn launch_companion() -> Result<String, String> {
    let executable = find_companion_executable().ok_or_else(|| {
        "GameMate Companion n’est pas installé. Utilise d’abord « Installer GameMate »."
            .to_string()
    })?;

    // On lance uniquement l'EXE réellement installé.
    // L'ancien `cmd /C npm run tauri dev` a été supprimé.
    Command::new(&executable)
        .spawn()
        .map_err(|error| {
            format!(
                "Impossible de lancer GameMate Companion : {error}"
            )
        })?;

    Ok("GameMate Companion est en cours de lancement.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            companion_status,
            install_companion,
            launch_companion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
