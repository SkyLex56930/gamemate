use std::path::PathBuf;
use std::process::Command;

#[tauri::command]
fn launch_companion() -> Result<String, String> {
    // CARGO_MANIFEST_DIR pointe vers:
    // gamemate/launcher/src-tauri
    //
    // On remonte donc vers:
    // gamemate/
    // puis on entre dans:
    // gamemate/companion
    let launcher_src_tauri = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    let gamemate_root = launcher_src_tauri
        .parent()
        .and_then(|launcher_dir| launcher_dir.parent())
        .ok_or_else(|| "Impossible de retrouver le dossier racine GameMate.".to_string())?;

    let companion_dir = gamemate_root.join("companion");

    if !companion_dir.exists() {
        return Err(format!(
            "Dossier Companion introuvable : {}",
            companion_dir.display()
        ));
    }

    Command::new("cmd")
        .args(["/C", "npm run tauri dev"])
        .current_dir(&companion_dir)
        .spawn()
        .map_err(|error| format!("Impossible de lancer le Companion : {error}"))?;

    Ok("Companion en cours de lancement.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![launch_companion])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
