use std::{
    env, io,
    path::{Path, PathBuf},
};

/// Set by the AppImage runtime to the AppImage file it runs.
const APPIMAGE_VAR: &str = "APPIMAGE";
/// Set by the AppImage runtime to the temporary, read-only folder the AppImage is mounted on.
const APPDIR_VAR: &str = "APPDIR";

/// Where an AppImage runtime says it is running from.
struct AppImage {
    file: PathBuf,
    mount_dir: PathBuf,
}

impl AppImage {
    fn from_env() -> Option<Self> {
        Some(Self {
            file: env::var_os(APPIMAGE_VAR)?.into(),
            mount_dir: env::var_os(APPDIR_VAR)?.into(),
        })
    }
}

/// The folder that holds the executable, or the AppImage it runs from. Every file the player
/// reads or writes lives under it, so the whole app can travel on a flash drive.
pub fn root_dir() -> io::Result<PathBuf> {
    root_dir_of(&env::current_exe()?, AppImage::from_env().as_ref())
}

fn root_dir_of(executable: &Path, app_image: Option<&AppImage>) -> io::Result<PathBuf> {
    // An AppImage runs its executable from a temporary read-only mount, so the app's files live
    // next to the AppImage file instead. Its variables count only while the executable is inside
    // that mount: everything started from an AppImage inherits them.
    let home = match app_image {
        Some(app_image) if executable.starts_with(&app_image.mount_dir) => &app_image.file,
        _ => executable,
    };
    // Not canonicalized: on Windows that adds a `\\?\` prefix to the paths shown to the user.
    home.parent().map(Path::to_path_buf).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "the executable has no parent folder",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_the_folder_of_the_executable() {
        let executable = Path::new("/media/usb/Player/portable-music-player");

        assert_eq!(
            root_dir_of(executable, None).unwrap(),
            Path::new("/media/usb/Player")
        );
    }

    #[test]
    fn uses_the_folder_of_the_appimage_rather_than_its_read_only_mount() {
        let app_image = AppImage {
            file: PathBuf::from("/media/usb/Player/portable-music-player.AppImage"),
            mount_dir: PathBuf::from("/tmp/.mount_portabXyZ12"),
        };
        let executable = Path::new("/tmp/.mount_portabXyZ12/usr/bin/portable-music-player");

        assert_eq!(
            root_dir_of(executable, Some(&app_image)).unwrap(),
            Path::new("/media/usb/Player")
        );
    }

    #[test]
    fn ignores_appimage_variables_inherited_from_another_appimage() {
        // A bare executable started from a terminal that is itself an AppImage gets its variables.
        let app_image = AppImage {
            file: PathBuf::from("/home/someone/Apps/Terminal.AppImage"),
            mount_dir: PathBuf::from("/tmp/.mount_TermiAbC34"),
        };
        let executable = Path::new("/media/usb/Player/portable-music-player");

        assert_eq!(
            root_dir_of(executable, Some(&app_image)).unwrap(),
            Path::new("/media/usb/Player")
        );
    }
}
