use std::{collections::HashMap, fs};

use serde::Deserialize;
use tauri::{
    App, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, Runtime, plugin::TauriPlugin,
};
use tauri_plugin_window_state::StateFlags;

/// Must match the window label in tauri.conf.json.
const LABEL: &str = "main";

/// The fields this module reads from the window-state plugin's file. The plugin stores the size
/// in physical pixels.
#[derive(Deserialize)]
struct SavedWindow {
    width: u32,
    height: u32,
}

/// Saves only the window size, in each computer's own config folder rather than on the drive,
/// because every computer has a different screen. Its automatic restore is skipped: on Linux it
/// applies the size asynchronously, too late to center the window before it appears.
pub fn size_memory_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_window_state::Builder::default()
        .with_state_flags(StateFlags::SIZE)
        .skip_initial_state(LABEL)
        .build()
}

/// The window starts hidden (tauri.conf.json) and is only shown once it has its final size and
/// position, so it never visibly jumps, and it always opens centered.
pub fn show(app: &App) -> tauri::Result<()> {
    let window = app
        .get_webview_window(LABEL)
        .ok_or(tauri::Error::WindowNotFound)?;
    let size = match saved_size(app) {
        Some(size) => size,
        None => window.inner_size()?,
    };
    let monitor = window.current_monitor()?.or(window.primary_monitor()?);
    if let Some(monitor) = monitor {
        let (size, position) = fit_and_center(size, monitor.work_area());
        window.set_size(size)?;
        window.set_position(position)?;
    }
    window.show()
}

/// `None` when nothing was saved yet or the file can't be read; the default size is used then.
fn saved_size(app: &App) -> Option<PhysicalSize<u32>> {
    let path = app
        .path()
        .app_config_dir()
        .ok()?
        .join(tauri_plugin_window_state::DEFAULT_FILENAME);
    let contents = fs::read_to_string(path).ok()?;
    let windows: HashMap<String, SavedWindow> = serde_json::from_str(&contents).ok()?;
    let saved = windows.get(LABEL)?;
    let has_size = saved.width > 0 && saved.height > 0;
    has_size.then(|| PhysicalSize::new(saved.width, saved.height))
}

/// Shrinks a size remembered from a bigger screen to fit the work area, then centers it there.
fn fit_and_center(
    size: PhysicalSize<u32>,
    work_area: &PhysicalRect<i32, u32>,
) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let fitted = PhysicalSize::new(
        size.width.min(work_area.size.width),
        size.height.min(work_area.size.height),
    );
    let position = PhysicalPosition::new(
        work_area.position.x + centered_offset(work_area.size.width, fitted.width),
        work_area.position.y + centered_offset(work_area.size.height, fitted.height),
    );
    (fitted, position)
}

fn centered_offset(available: u32, used: u32) -> i32 {
    i32::try_from(available.saturating_sub(used) / 2).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn work_area(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(width, height),
        }
    }

    #[test]
    fn centers_a_size_that_fits() {
        let (size, position) =
            fit_and_center(PhysicalSize::new(1100, 760), &work_area(0, 0, 2560, 1080));
        assert_eq!(size, PhysicalSize::new(1100, 760));
        assert_eq!(position, PhysicalPosition::new(730, 160));
    }

    #[test]
    fn shrinks_a_size_bigger_than_the_screen() {
        let (size, position) =
            fit_and_center(PhysicalSize::new(4000, 3000), &work_area(0, 0, 1920, 1040));
        assert_eq!(size, PhysicalSize::new(1920, 1040));
        assert_eq!(position, PhysicalPosition::new(0, 0));
    }

    #[test]
    fn centers_inside_an_offset_work_area() {
        // e.g. a second monitor, or a taskbar on the top or left edge
        let (_, position) =
            fit_and_center(PhysicalSize::new(800, 600), &work_area(1920, 40, 1600, 900));
        assert_eq!(position, PhysicalPosition::new(2320, 190));
    }
}
