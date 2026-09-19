use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const COMPANION_DOWNLOAD_URL: &str =
    "https://github.com/SkyLex56930/gamemate-releases/releases/latest/download/GameMate.Companion_x64-setup.exe";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
struct CompanionStatus {
    installed: bool,
    path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateStatus {
    latest_version: String,
    update_available: bool,
}

#[derive(Debug, Clone)]
struct LatestRelease {
    id: u64,
    version: String,
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


fn launcher_data_directory() -> Result<PathBuf, String> {
    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA est introuvable.".to_string())?;

    let directory =
        PathBuf::from(local_app_data).join("GameMate Launcher");

    if !directory.exists() {
        fs::create_dir_all(&directory).map_err(|error| {
            format!(
                "Impossible de créer le dossier du Launcher : {error}"
            )
        })?;
    }

    Ok(directory)
}

fn release_marker_path() -> Result<PathBuf, String> {
    Ok(
        launcher_data_directory()?
            .join("companion-release.txt"),
    )
}

fn read_installed_release_id() -> Option<u64> {
    let path = release_marker_path().ok()?;
    let content = fs::read_to_string(path).ok()?;
    content.lines().next()?.trim().parse::<u64>().ok()
}

fn write_installed_release(
    release: &LatestRelease,
) -> Result<(), String> {
    let path = release_marker_path()?;

    fs::write(
        path,
        format!("{}\n{}\n", release.id, release.version),
    )
    .map_err(|error| {
        format!(
            "Impossible d’enregistrer la version installée : {error}"
        )
    })
}

#[cfg(target_os = "windows")]
fn latest_release() -> Result<LatestRelease, String> {
    let script =
        "$ErrorActionPreference='Stop';\
         $ProgressPreference='SilentlyContinue';\
         [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;\
         $headers=@{'User-Agent'='GameMate-Launcher';'Accept'='application/vnd.github+json'};\
         $r=Invoke-RestMethod -UseBasicParsing -Headers $headers -Uri 'https://api.github.com/repos/SkyLex56930/gamemate-releases/releases/latest';\
         $v=[string]$r.tag_name;\
         if ([string]::IsNullOrWhiteSpace($v) -or $v -eq 'Auto') { $v=[string]$r.name };\
         if ([string]::IsNullOrWhiteSpace($v)) { $v='Dernière version' };\
         Write-Output ($r.id.ToString() + [char]9 + $v)";

    let output = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            format!(
                "Impossible de vérifier la dernière release : {error}"
            )
        })?;

    if !output.status.success() {
        return Err(
            "Impossible de contacter le serveur de mises à jour GameMate."
                .to_string(),
        );
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| {
            "Aucune information de release reçue.".to_string()
        })?;

    let mut parts = line.split('\t');

    let id = parts
        .next()
        .ok_or_else(|| "ID de release manquant.".to_string())?
        .trim()
        .parse::<u64>()
        .map_err(|_| "ID de release invalide.".to_string())?;

    let version = parts
        .next()
        .unwrap_or("Dernière version")
        .trim()
        .trim_start_matches('v')
        .to_string();

    Ok(LatestRelease { id, version })
}

#[cfg(not(target_os = "windows"))]
fn latest_release() -> Result<LatestRelease, String> {
    Err(
        "La vérification automatique est actuellement disponible sous Windows uniquement."
            .to_string(),
    )
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let latest = latest_release()?;
        let installed = find_companion_executable().is_some();

        let update_available =
            installed
                && read_installed_release_id()
                    .map(|id| id != latest.id)
                    .unwrap_or(true);

        Ok(UpdateStatus {
            latest_version: latest.version,
            update_available,
        })
    })
    .await
    .map_err(|error| {
        format!(
            "Erreur interne pendant la vérification : {error}"
        )
    })?
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

    if let Ok(release) = latest_release() {
        let _ = write_installed_release(&release);
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
async fn update_companion() -> Result<CompanionStatus, String> {
    if find_companion_executable().is_none() {
        return Err(
            "GameMate Companion n’est pas installé."
                .to_string(),
        );
    }

    tauri::async_runtime::spawn_blocking(|| {
        // Réutilise le même installateur "latest" et l'applique
        // par-dessus la version actuellement installée.
        let installer_path =
            env::temp_dir().join("GameMate.Companion_x64-setup.exe");

        if installer_path.exists() {
            let _ = fs::remove_file(&installer_path);
        }

        download_installer(&installer_path)?;

        let mut installer =
            Command::new(&installer_path)
                .spawn()
                .map_err(|error| {
                    format!(
                        "Impossible d’ouvrir l’installateur de mise à jour : {error}"
                    )
                })?;

        let exit_status =
            installer.wait().map_err(|error| {
                format!(
                    "Impossible d’attendre la fin de la mise à jour : {error}"
                )
            })?;

        let _ = fs::remove_file(&installer_path);

        if !exit_status.success() {
            return Err(
                "La mise à jour a été annulée ou a échoué."
                    .to_string(),
            );
        }

        let status = current_status();

        if !status.installed {
            return Err(
                "La mise à jour s’est terminée, mais le Companion installé est introuvable."
                    .to_string(),
            );
        }

        let release = latest_release()?;
        write_installed_release(&release)?;

        Ok(status)
    })
    .await
    .map_err(|error| {
        format!(
            "Erreur interne pendant la mise à jour : {error}"
        )
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
            check_for_updates,
            install_companion,
            update_companion,
            launch_companion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
