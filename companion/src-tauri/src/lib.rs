use serde::Serialize;
use serde_json::Value;
use std::{env, fs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const RELEASES_API_URL: &str =
    "https://api.github.com/repos/SkyLex56930/gamemate-releases/releases/latest";
const COMPANION_ASSET_NAME: &str = "GameMate.Companion_x64-setup.exe";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize)]
struct CompanionUpdateStatus {
    current_version: String,
    latest_version: String,
    update_available: bool,
}

#[derive(Debug)]
struct LatestRelease {
    version: String,
    download_url: String,
}

#[derive(Default)]
struct VoiceOverlayState(Mutex<Option<Value>>);

struct LifecycleState {
    relaunch_launcher: AtomicBool,
}

impl Default for LifecycleState {
    fn default() -> Self {
        Self { relaunch_launcher: AtomicBool::new(true) }
    }
}

fn possible_launcher_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = env::var_os("GAMEMATE_LAUNCHER_PATH") {
        paths.push(PathBuf::from(path));
    }
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let programs = PathBuf::from(local_app_data).join("Programs");
        paths.push(programs.join("launcher").join("launcher.exe"));
        paths.push(programs.join("GameMate Launcher").join("launcher.exe"));
        paths.push(programs.join("GameMate Launcher").join("GameMate Launcher.exe"));
    }
    if let Some(program_files) = env::var_os("PROGRAMFILES") {
        let root = PathBuf::from(program_files);
        paths.push(root.join("launcher").join("launcher.exe"));
        paths.push(root.join("GameMate Launcher").join("launcher.exe"));
    }
    paths
}

fn find_launcher_executable() -> Option<PathBuf> {
    possible_launcher_paths().into_iter().find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn stop_running_launcher(path: &Path) {
    let target = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$target=[System.IO.Path]::GetFullPath('{}');\
         Get-CimInstance Win32_Process -Filter \"Name='launcher.exe'\" |\
         Where-Object {{ $_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath) -eq $target }} |\
         ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}",
        target
    );
    let _ = Command::new("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(target_os = "windows"))]
fn stop_running_launcher(_path: &Path) {}

fn reopen_launcher() {
    if let Some(path) = find_launcher_executable() {
        let _ = Command::new(path).spawn();
    }
}

#[tauri::command]
fn get_voice_overlay_state(state: State<'_, VoiceOverlayState>) -> Option<Value> {
    state.0.lock().ok().and_then(|snapshot| snapshot.clone())
}

#[tauri::command]
fn sync_voice_overlay(
    app: AppHandle,
    state: State<'_, VoiceOverlayState>,
    snapshot: Option<Value>,
) -> Result<(), String> {
    if let Ok(mut current) = state.0.lock() {
        *current = snapshot.clone();
    }

    let Some(snapshot) = snapshot else {
        if let Some(window) = app.get_webview_window("voice-overlay") {
            window.hide().map_err(|error| error.to_string())?;
        }
        return Ok(());
    };

    let window = if let Some(window) = app.get_webview_window("voice-overlay") {
        window.show().map_err(|error| error.to_string())?;
        window
    } else {
        let window = WebviewWindowBuilder::new(
            &app,
            "voice-overlay",
            WebviewUrl::App("index.html?overlay=voice".into()),
        )
        .title("GameMate Voice Overlay")
        .inner_size(370.0, 430.0)
        .position(18.0, 18.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .focusable(false)
        .shadow(false)
        .build()
        .map_err(|error| format!("Impossible de créer l’overlay vocal : {error}"))?;
        let _ = window.set_ignore_cursor_events(true);
        window
    };

    window
        .emit("voice-overlay:update", snapshot)
        .map_err(|error| format!("Impossible d’actualiser l’overlay vocal : {error}"))?;
    Ok(())
}

fn numeric_version(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|character| character.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let mut latest_parts = numeric_version(latest);
    let mut current_parts = numeric_version(current);
    let length = latest_parts.len().max(current_parts.len());
    latest_parts.resize(length, 0);
    current_parts.resize(length, 0);
    latest_parts > current_parts
}

#[cfg(test)]
mod update_tests {
    use super::is_newer_version;

    #[test]
    fn compares_release_versions_numerically() {
        assert!(is_newer_version("v1.0.16", "1.0.15"));
        assert!(is_newer_version("2.0.0", "1.99.99"));
        assert!(!is_newer_version("v1.0.15", "1.0.15"));
        assert!(!is_newer_version("1.0.9", "1.0.15"));
    }
}

#[cfg(target_os = "windows")]
fn latest_release() -> Result<LatestRelease, String> {
    let api_url = RELEASES_API_URL.replace('\'', "''");
    let asset_name = COMPANION_ASSET_NAME.replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop';\
         $ProgressPreference='SilentlyContinue';\
         [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;\
         $headers=@{{'User-Agent'='GameMate-Companion';'Accept'='application/vnd.github+json';'Cache-Control'='no-cache'}};\
         $release=Invoke-RestMethod -Headers $headers -Uri '{}';\
         if ($release.draft -or $release.prerelease) {{ throw 'La dernière release n''est pas stable.' }};\
         $asset=$release.assets | Where-Object {{ $_.name -eq '{}' }} | Select-Object -First 1;\
         if (-not $asset) {{ throw 'L''installateur Companion est absent de la release.' }};\
         Write-Output ([string]$release.tag_name + [char]9 + [string]$asset.browser_download_url)",
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
        .map_err(|error| format!("Impossible de vérifier les mises à jour : {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "Impossible de contacter le service de mise à jour. {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| "Aucune information de mise à jour reçue.".to_string())?;
    let mut parts = line.split('\t');
    let version = parts
        .next()
        .ok_or_else(|| "Version de release manquante.".to_string())?
        .trim()
        .trim_start_matches(['v', 'V'])
        .to_string();
    let download_url = parts
        .next()
        .ok_or_else(|| "Lien de téléchargement manquant.".to_string())?
        .trim()
        .to_string();

    Ok(LatestRelease { version, download_url })
}

#[cfg(not(target_os = "windows"))]
fn latest_release() -> Result<LatestRelease, String> {
    Err("Les mises à jour automatiques sont disponibles sous Windows uniquement.".to_string())
}

#[cfg(target_os = "windows")]
fn download_update(download_url: &str, destination: &Path) -> Result<(), String> {
    let url = download_url.replace('\'', "''");
    let path = destination
        .to_str()
        .ok_or_else(|| "Chemin temporaire invalide.".to_string())?
        .replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop';\
         $ProgressPreference='SilentlyContinue';\
         Invoke-WebRequest -Uri '{}' -OutFile '{}'",
        url, path
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
        .map_err(|error| format!("Impossible de télécharger la mise à jour : {error}"))?;

    if !output.status.success() || !destination.is_file() {
        return Err(format!(
            "Le téléchargement de la mise à jour a échoué. {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn download_update(_download_url: &str, _destination: &Path) -> Result<(), String> {
    Err("Le téléchargement automatique est disponible sous Windows uniquement.".to_string())
}

#[cfg(target_os = "windows")]
fn launch_update_installer(installer_path: &Path) -> Result<(), String> {
    let path = installer_path
        .to_str()
        .ok_or_else(|| "Chemin de l’installateur invalide.".to_string())?
        .replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue';\
         Start-Sleep -Milliseconds 1200;\
         $installer=Start-Process -FilePath '{}' -PassThru;\
         $installer.WaitForExit();\
         Start-Sleep -Milliseconds 500;\
         Remove-Item -LiteralPath '{}' -Force",
        path, path
    );

    Command::new("powershell.exe")
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
        .spawn()
        .map_err(|error| format!("Impossible de lancer l’installateur : {error}"))?;

    Ok(())
}

#[tauri::command]
async fn check_companion_update() -> Result<CompanionUpdateStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let release = latest_release()?;
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        Ok(CompanionUpdateStatus {
            update_available: is_newer_version(&release.version, &current_version),
            current_version,
            latest_version: release.version,
        })
    })
    .await
    .map_err(|error| format!("Erreur interne pendant la vérification : {error}"))?
}

#[tauri::command]
async fn install_companion_update(app: AppHandle, lifecycle: State<'_, LifecycleState>) -> Result<(), String> {
    let installer_path = tauri::async_runtime::spawn_blocking(|| {
        let release = latest_release()?;
        let current_version = env!("CARGO_PKG_VERSION");
        if !is_newer_version(&release.version, current_version) {
            return Err("GameMate Companion est déjà à jour.".to_string());
        }

        let installer_path = env::temp_dir().join(format!(
            "GameMate.Companion_{}_x64-setup.exe",
            release.version
        ));
        if installer_path.exists() {
            let _ = fs::remove_file(&installer_path);
        }
        download_update(&release.download_url, &installer_path)?;
        Ok::<PathBuf, String>(installer_path)
    })
    .await
    .map_err(|error| format!("Erreur interne pendant le téléchargement : {error}"))??;

    #[cfg(target_os = "windows")]
    launch_update_installer(&installer_path)?;

    lifecycle.relaunch_launcher.store(false, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn quit_to_launcher(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(VoiceOverlayState::default())
        .manage(LifecycleState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            if let Some(launcher_path) = find_launcher_executable() {
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(900));
                    stop_running_launcher(&launcher_path);
                });
            }
            let open_item = MenuItem::with_id(app, "open", "Ouvrir GameMate", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quitter GameMate", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id("gamemate-tray")
                .tooltip("GameMate Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "voice-overlay" {
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            check_companion_update,
            install_companion_update,
            get_voice_overlay_state,
            sync_voice_overlay,
            quit_to_launcher
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let lifecycle = app_handle.state::<LifecycleState>();
            if lifecycle.relaunch_launcher.load(Ordering::SeqCst) {
                reopen_launcher();
            }
        }
    });
}
