use std::{
    io,
    path::{Path, PathBuf},
};

/// The folder that holds the executable. Every file the player reads or writes lives under it,
/// so the whole app can travel on a flash drive.
pub fn root_dir() -> io::Result<PathBuf> {
    // Not canonicalized: on Windows that adds a `\\?\` prefix to the paths shown to the user.
    let executable = std::env::current_exe()?;
    executable.parent().map(Path::to_path_buf).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "the executable has no parent folder",
        )
    })
}
