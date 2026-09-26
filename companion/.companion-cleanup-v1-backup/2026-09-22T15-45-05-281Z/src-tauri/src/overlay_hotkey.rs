#[cfg(desktop)]
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

#[cfg(target_os = "windows")]
type NativeWindow = *mut core::ffi::c_void;

#[cfg(target_os = "windows")]
type NativeMonitor = *mut core::ffi::c_void;

#[cfg(target_os = "windows")]
#[repr(C)]
struct NativeRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct NativeMonitorInfo {
    size: u32,
    monitor: NativeRect,
    work: NativeRect,
    flags: u32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetForegroundWindow() -> NativeWindow;
    fn MonitorFromWindow(window: NativeWindow, flags: u32) -> NativeMonitor;
    fn GetMonitorInfoW(monitor: NativeMonitor, info: *mut NativeMonitorInfo) -> i32;
    fn SetWindowPos(
        window: NativeWindow,
        insert_after: NativeWindow,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        flags: u32,
    ) -> i32;
    fn ShowWindow(window: NativeWindow, command: i32) -> i32;
}

#[cfg(target_os = "windows")]
fn active_monitor_position<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Option<(i32, i32)> {
    const MARGIN: i32 = 20;
    const MONITOR_DEFAULTTONEAREST: u32 = 2;

    let active_window = unsafe { GetForegroundWindow() };
    if active_window.is_null() {
        return None;
    }

    let monitor = unsafe { MonitorFromWindow(active_window, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_null() {
        return None;
    }

    let mut info = NativeMonitorInfo {
        size: core::mem::size_of::<NativeMonitorInfo>() as u32,
        monitor: NativeRect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        work: NativeRect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        flags: 0,
    };

    if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
        return None;
    }

    let size = window.outer_size().ok()?;
    let width = i32::try_from(size.width).unwrap_or(430);
    let height = i32::try_from(size.height).unwrap_or(650);
    let monitor_width = info.monitor.right - info.monitor.left;
    let monitor_height = info.monitor.bottom - info.monitor.top;

    let x = if monitor_width >= width + MARGIN * 2 {
        info.monitor.right - width - MARGIN
    } else {
        info.monitor.left
    };
    let y = if monitor_height >= height + MARGIN * 2 {
        info.monitor.top + MARGIN
    } else {
        info.monitor.top
    };

    Some((x, y))
}

#[cfg(target_os = "windows")]
fn show_without_activating<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    const SW_SHOWNOACTIVATE: i32 = 4;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_SHOWWINDOW: u32 = 0x0040;

    // Empêche définitivement l'overlay de voler le focus au jeu.
    let _ = window.set_focusable(false);
    let position = active_monitor_position(window);

    let native_window = window
        .window_handle()
        .ok()
        .and_then(|handle| match handle.as_raw() {
            RawWindowHandle::Win32(handle) => Some(handle.hwnd.get() as NativeWindow),
            _ => None,
        });

    if let Some(native_window) = native_window {
        let topmost = -1isize as NativeWindow;
        let (x, y, flags) = match position {
            Some((x, y)) => (x, y, SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW),
            None => (
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            ),
        };
        let displayed = unsafe {
            SetWindowPos(
                native_window,
                topmost,
                x,
                y,
                0,
                0,
                flags,
            )
        };

        if displayed == 0 {
            // Secours natif : affiche sans activer, sans passer par window.show().
            unsafe {
                ShowWindow(native_window, SW_SHOWNOACTIVATE);
            }
        }

        // Une fois visible, l'overlay redevient interactif. Cela ne l'active pas :
        // le focus ne changera que si l'utilisateur clique volontairement dessus.
        let _ = window.set_focusable(true);
    }
}

#[cfg(not(target_os = "windows"))]
fn show_without_activating<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.center();
    let _ = window.set_focusable(false);
    let _ = window.show();
}

pub fn install(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(desktop)]
    {
        let shortcut = Shortcut::new(
            Some(Modifiers::CONTROL | Modifiers::SHIFT),
            Code::KeyO,
        );
        app.handle().plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, incoming, event| {
                    if incoming != &shortcut || event.state() != ShortcutState::Pressed {
                        return;
                    }

                    if let Some(window) = app.get_webview_window("overlay") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            show_without_activating(&window);
                        }
                    }
                })
                .build(),
        )?;
        app.global_shortcut().register(shortcut)?;
    }

    Ok(())
}
