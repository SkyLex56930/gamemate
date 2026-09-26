use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const RELEASES_API_URL: &str =
    "https://api.github.com/repos/SkyLex56930/gamemate-releases/releases/latest";
const COMPANION_ASSET_NAME: &str = "GameMate.Companion_x64-setup.exe";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
struct CompanionStatus {
    installed: bool,
    path: Option<String>,
    installed_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateStatus {
    latest_version: String,
    update_available: bool,
    installed_version: Option<String>,
}

#[derive(Debug, Clone)]
struct LatestRelease {
    id: u64,
    version: String,
    download_url: String,
}

fn possible_install_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local_app_data);

        dirs.push(local.join("Programs").join("GameMate Companion"));
        dirs.push(local.join("GameMate Companion"));
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
    let mut candidates: Vec<PathBuf> = Vec::new();

    for directory in possible_install_directories() {
        if let Some(path) = find_executable_in_directory(&directory) {
            candidates.push(path);
        }

        if directory.is_dir() {
            if let Ok(entries) = fs::read_dir(&directory) {
                for entry in entries.flatten() {
                    let path = entry.path();

                    if path.is_dir() {
                        if let Some(exe) = find_executable_in_directory(&path) {
                            candidates.push(exe);
                        }
                    }
                }
            }
        }
    }

    candidates.into_iter().max_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    })
}

fn launcher_data_directory() -> Result<PathBuf, String> {
    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA est introuvable.".to_string())?;

    let directory = PathBuf::from(local_app_data).join("GameMate Launcher");

    if !directory.exists() {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Impossible de créer le dossier du Launcher : {error}"))?;
    }

    Ok(directory)
}

fn release_marker_path() -> Result<PathBuf, String> {
    Ok(launcher_data_directory()?.join("companion-release.txt"))
}

fn read_installed_release_marker() -> Option<(u64, String)> {
    let path = release_marker_path().ok()?;
    let content = fs::read_to_string(path).ok()?;
    let mut lines = content.lines();

    let id = lines.next()?.trim().parse::<u64>().ok()?;
    let version = lines
        .next()
        .unwrap_or("Version inconnue")
        .trim()
        .trim_start_matches('v')
        .to_string();

    Some((id, version))
}

fn write_installed_release(release: &LatestRelease) -> Result<(), String> {
    let path = release_marker_path()?;

    fs::write(path, format!("{}\n{}\n", release.id, release.version)).map_err(|error| {
        format!("Impossible d’enregistrer la version installée : {error}")
    })
}

#[cfg(target_os = "windows")]
fn latest_release() -> Result<LatestRelease, String> {
    let api_url = RELEASES_API_URL.replace('\'', "''");
    let asset_name = COMPANION_ASSET_NAME.replace('\'', "''");

    let script = format!(
        "$ErrorActionPreference='Stop';\
         $ProgressPreference='SilentlyContinue';\
         [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;\
         $headers=@{{'User-Agent'='GameMate-Launcher';'Accept'='application/vnd.github+json'}};\
         $release=Invoke-RestMethod -Headers $headers -Uri '{}';\
         if ($release.draft -or $release.prerelease) {{ throw 'La dernière release n''est pas une release stable.' }};\
         $asset=$release.assets | Where-Object {{ $_.name -eq '{}' }} | Select-Object -First 1;\
         if (-not $asset) {{ throw 'La dernière release ne contient pas GameMate.Companion_x64-setup.exe.' }};\
         $version=[string]$release.tag_name;\
         if ([string]::IsNullOrWhiteSpace($version)) {{ throw 'Tag de release manquant.' }};\
         Write-Output ($release.id.ToString() + [char]9 + $version + [char]9 + [string]$asset.browser_download_url)",
        api_url,
        asset_name
    );

    let output = Command::new("powershell.exe")
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
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            format!("Impossible de vérifier la dernière release : {error}")
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        return Err(format!(
            "Impossible de contacter ou lire la dernière release GameMate. {}",
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| "Aucune information de release reçue.".to_string())?;

    let mut parts = line.split('\t');

    let id = parts
        .next()
        .ok_or_else(|| "ID de release manquant.".to_string())?
        .trim()
        .parse::<u64>()
        .map_err(|_| "ID de release invalide.".to_string())?;

    let version = parts
        .next()
        .ok_or_else(|| "Version de release manquante.".to_string())?
        .trim()
        .trim_start_matches('v')
        .to_string();

    let download_url = parts
        .next()
        .ok_or_else(|| "URL de téléchargement manquante.".to_string())?
        .trim()
        .to_string();

    Ok(LatestRelease {
        id,
        version,
        download_url,
    })
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
        let installed_marker = read_installed_release_marker();

        let update_available = installed
            && installed_marker
                .as_ref()
                .map(|(id, _)| *id != latest.id)
                .unwrap_or(true);

        Ok(UpdateStatus {
            latest_version: latest.version,
            update_available,
            installed_version: installed_marker.map(|(_, version)| version),
        })
    })
    .await
    .map_err(|error| {
        format!("Erreur interne pendant la vérification : {error}")
    })?
}

fn current_status() -> CompanionStatus {
    match find_companion_executable() {
        Some(path) => CompanionStatus {
            installed: true,
            path: Some(path.to_string_lossy().to_string()),
            installed_version: read_installed_release_marker().map(|(_, version)| version),
        },
        None => CompanionStatus {
            installed: false,
            path: None,
            installed_version: None,
        },
    }
}

#[tauri::command]
fn companion_status() -> CompanionStatus {
    current_status()
}

#[cfg(target_os = "windows")]
fn download_installer(download_url: &str, destination: &Path) -> Result<(), String> {
    let destination_string = destination
        .to_str()
        .ok_or_else(|| "Chemin temporaire Windows invalide.".to_string())?
        .replace('\'', "''");

    let download_url = download_url.replace('\'', "''");

    let script = format!(
        "$ErrorActionPreference='Stop';\
         $ProgressPreference='SilentlyContinue';\
         Invoke-WebRequest -Uri '{}' -OutFile '{}'",
        download_url, destination_string
    );

    let output = Command::new("powershell.exe")
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
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            format!("Impossible de démarrer le téléchargement : {error}")
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        return Err(format!(
            "Le téléchargement de GameMate Companion a échoué. URL utilisée : {}. {}",
            download_url,
            stderr.trim()
        ));
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
fn download_installer(_download_url: &str, _destination: &Path) -> Result<(), String> {
    Err(
        "GameMate Launcher prend actuellement en charge l’installation automatique sous Windows uniquement."
            .to_string(),
    )
}

fn install_companion_sync() -> Result<CompanionStatus, String> {
    if find_companion_executable().is_some() {
        return Ok(current_status());
    }

    let release = latest_release()?;

    let installer_path =
        env::temp_dir().join("GameMate.Companion_x64-setup.exe");

    if installer_path.exists() {
        let _ = fs::remove_file(&installer_path);
    }

    download_installer(&release.download_url, &installer_path)?;

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

    write_installed_release(&release)?;

    Ok(current_status())
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
        let release = latest_release()?;

        let installer_path =
            env::temp_dir().join("GameMate.Companion_x64-setup.exe");

        if installer_path.exists() {
            let _ = fs::remove_file(&installer_path);
        }

        download_installer(&release.download_url, &installer_path)?;

        let mut installer = Command::new(&installer_path)
            .spawn()
            .map_err(|error| {
                format!(
                    "Impossible d’ouvrir l’installateur de mise à jour : {error}"
                )
            })?;

        let exit_status = installer.wait().map_err(|error| {
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

        write_installed_release(&release)?;

        Ok(current_status())
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
