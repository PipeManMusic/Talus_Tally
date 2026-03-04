use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Child};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Return a path for a diagnostic log file.
/// On Windows: %LOCALAPPDATA%/com.talus.tally/backend-launch.log
/// On Linux:   $XDG_DATA_HOME/com.talus.tally/backend-launch.log  (or ~/.local/share/...)
/// On macOS:   ~/Library/Application Support/com.talus.tally/backend-launch.log
fn diagnostic_log_path() -> Option<PathBuf> {
  let base = if cfg!(target_os = "windows") {
    std::env::var("LOCALAPPDATA").ok().map(PathBuf::from)
  } else if cfg!(target_os = "macos") {
    dirs_next().map(|h| h.join("Library").join("Application Support"))
  } else {
    std::env::var("XDG_DATA_HOME")
      .ok()
      .map(PathBuf::from)
      .or_else(|| dirs_next().map(|h| h.join(".local").join("share")))
  };
  base.map(|b| b.join("com.talus.tally").join("backend-launch.log"))
}

/// Simple home-dir helper (avoids adding a crate dependency).
fn dirs_next() -> Option<PathBuf> {
  std::env::var("HOME")
    .or_else(|_| std::env::var("USERPROFILE"))
    .ok()
    .map(PathBuf::from)
}

/// Append a timestamped line to the diagnostic log file.
fn diag(msg: &str) {
  // Always print to stdout/stderr for dev builds
  println!("[diag] {}", msg);

  if let Some(log_path) = diagnostic_log_path() {
    if let Some(parent) = log_path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
      let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
      let _ = writeln!(f, "[{}] {}", now, msg);
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let backend_process: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
  let backend_process_clone = backend_process.clone();
  let backend_process_state = backend_process.clone();

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(BackendState(backend_process_state))
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }


      // Start Python backend on app launch
      let app_handle = app.handle().clone();
      let backend_process_setup = backend_process_clone.clone();
      std::thread::spawn(move || {
        start_backend(backend_process_setup, app_handle);
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![backend_status, minimize_window, maximize_window, close_window, exit_app, force_close_window])
    .on_window_event(move |window, event| {
      match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
          println!("✓ [CLOSE REQUESTED] Event received in Rust");
          // Prevent immediate close - let JavaScript handler decide
          api.prevent_close();
          println!("✓ [CLOSE REQUESTED] Calling prevent_close()");
          
          // Emit event to frontend so JavaScript onCloseRequested handler can run
          println!("✓ [CLOSE REQUESTED] Emitting tauri://close-requested event");
          let _ = window.emit("tauri://close-requested", ());
          println!("✓ [CLOSE REQUESTED] Event emitted successfully");
        }
        _ => {}
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

  struct BackendState(Arc<Mutex<Option<Child>>>);

fn start_backend(backend_process: Arc<Mutex<Option<Child>>>, app_handle: tauri::AppHandle) {
  diag("=== Backend launch sequence starting ===");

  // Kill any existing backend process first to ensure clean state
  diag("Checking for existing backend processes...");
  #[cfg(target_os = "linux")]
  {
    for pattern in ["python.*backend.app", "talus-tally-backend"] {
      let _ = Command::new("pkill")
        .args(&["-f", pattern])
        .output();
    }
    diag("Killed any existing backend processes (Linux)");
  }

  #[cfg(target_os = "macos")]
  {
    for pattern in ["python.*backend.app", "talus-tally-backend"] {
      let _ = Command::new("pkill")
        .args(&["-f", pattern])
        .output();
    }
    diag("Killed any existing backend processes (macOS)");
  }

  #[cfg(target_os = "windows")]
  {
    for image in ["python.exe", "talus-tally-backend.exe"] {
      let mut taskkill_cmd = Command::new("taskkill");
      taskkill_cmd
        .args(&["/F", "/IM", image])
        .creation_flags(0x08000000);
      let _ = taskkill_cmd.output();
    }
    diag("Killed any existing backend processes (Windows)");
  }

  // Wait for port to be released
  std::thread::sleep(std::time::Duration::from_millis(1000));

  // Determine project root - handle both development and installed locations
  let project_root = determine_project_root(Some(&app_handle));
  diag(&format!("Project root: {}", project_root.display()));

  let packaged_backend = find_packaged_backend(Some(&app_handle), &project_root);
  diag(&format!("Packaged backend: {:?}", packaged_backend.as_ref().map(|p| p.display().to_string())));

  // Platform-aware venv python path
  let venv_python = if cfg!(target_os = "windows") {
    project_root.join(".venv").join("Scripts").join("python.exe")
  } else {
    project_root.join(".venv").join("bin").join("python3")
  };
  diag(&format!("Venv python candidate: {} (exists={})", venv_python.display(), venv_python.exists()));

  let spawn_result = if let Some(binary_path) = packaged_backend {
    diag(&format!("Starting packaged backend binary at {}", binary_path.display()));
    let working_dir = binary_path.parent().unwrap_or(&project_root);
    diag(&format!("Working directory: {}", working_dir.display()));

    let mut command = Command::new(&binary_path);
    command
      .env("TALUS_DAEMON", "1")
      .current_dir(working_dir);

    #[cfg(target_os = "windows")]
    {
      // CREATE_NO_WINDOW avoids flashing an empty console window
      command.creation_flags(0x08000000);
    }

    command.spawn()
  } else if venv_python.exists() {
    diag(&format!("Starting backend via virtualenv Python at {}", venv_python.display()));
    Command::new(&venv_python)
      .args(["-m", "backend.app"])
      .env("TALUS_DAEMON", "1")
      .current_dir(&project_root)
      .spawn()
  } else {
    // Platform-aware system python fallback
    let python_cmd = if cfg!(target_os = "windows") { "python" } else { "python3" };
    diag(&format!("Virtualenv not found, falling back to system {}", python_cmd));
    Command::new(python_cmd)
      .args(["-m", "backend.app"])
      .env("TALUS_DAEMON", "1")
      .current_dir(&project_root)
      .spawn()
  };

  match spawn_result {
    Ok(child) => {
      if let Ok(mut proc) = backend_process.lock() {
        *proc = Some(child);
        diag("Backend started successfully");
      }
    }
    Err(e) => {
      diag(&format!("FAILED to start Python backend: {}", e));
      diag(&format!("  Project root: {}", project_root.display()));
      diag(&format!("  Venv python: {} (exists={})", venv_python.display(), venv_python.exists()));
    }
  }
}

fn determine_project_root(app_handle: Option<&tauri::AppHandle>) -> PathBuf {
  if let Some(handle) = app_handle {
    if let Ok(resource_dir) = handle.path().resource_dir() {
      diag(&format!("resource_dir() = {}", resource_dir.display()));

      // Check both possible layouts:
      //   1. resource_dir/talus-tally-backend/<binary>        (flat)
      //   2. resource_dir/resources/talus-tally-backend/<binary>  (Tauri preserves config path)
      for sub in ["talus-tally-backend", "resources/talus-tally-backend"] {
        let candidate = resource_dir.join(sub).join(backend_binary_name());
        diag(&format!("  project_root probe: {} (exists={})", candidate.display(), candidate.exists()));
        if candidate.exists() {
          return resource_dir.clone();
        }
      }
    }
  }

  if let Ok(exe_path) = std::env::current_exe() {
    let exe_dir = exe_path.parent().unwrap_or_else(|| Path::new("."));
    diag(&format!("exe_dir = {}", exe_dir.display()));

    // Installed package layout (Linux deb: /usr/lib/Talus Tally/ or legacy /opt/talus-tally/)
    for prefix in ["/usr/lib/Talus Tally", "/opt/talus-tally"] {
      if exe_dir.starts_with(prefix) {
        return PathBuf::from(prefix);
      }
    }

    // Search upwards for the repo root (contains backend folder)
    if let Some(found) = exe_dir
      .ancestors()
      .find(|ancestor| ancestor.join("backend").exists())
    {
      return found.to_path_buf();
    }
  }

  // Fallback to current working directory or '.'
  let fallback = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
  diag(&format!("project_root fallback = {}", fallback.display()));
  fallback
}

fn find_packaged_backend(app_handle: Option<&tauri::AppHandle>, project_root: &Path) -> Option<PathBuf> {
  if let Some(handle) = app_handle {
    if let Some(path) = backend_from_resource_dir(handle) {
      return Some(path);
    }
  }

  let dev_candidate = project_root
    .join("frontend")
    .join("src-tauri")
    .join("resources")
    .join("talus-tally-backend")
    .join(backend_binary_name());

  if dev_candidate.exists() {
    return Some(dev_candidate);
  }

  None
}

fn backend_from_resource_dir(handle: &tauri::AppHandle) -> Option<PathBuf> {
  let resource_dir = handle.path().resource_dir().ok()?;
  diag(&format!("backend_from_resource_dir: resource_dir = {}", resource_dir.display()));

  // Tauri may place bundled resources at either:
  //   resource_dir/talus-tally-backend/<binary>                (flat – resources dir IS resource_dir)
  //   resource_dir/resources/talus-tally-backend/<binary>      (Tauri preserves the config path prefix)
  for sub in ["talus-tally-backend", "resources/talus-tally-backend"] {
    let candidate = resource_dir.join(sub).join(backend_binary_name());
    diag(&format!("  probe: {} (exists={})", candidate.display(), candidate.exists()));
    if candidate.exists() {
      return Some(candidate);
    }
  }

  // Also try directly inside resource_dir (single-file PyInstaller builds)
  let flat_candidate = resource_dir.join(backend_binary_name());
  diag(&format!("  probe (flat): {} (exists={})", flat_candidate.display(), flat_candidate.exists()));
  if flat_candidate.exists() {
    return Some(flat_candidate);
  }

  diag("  No packaged backend found in resource_dir");
  None
}

fn backend_binary_name() -> &'static str {
  #[cfg(target_os = "windows")]
  {
    "talus-tally-backend.exe"
  }

  #[cfg(not(target_os = "windows"))]
  {
    "talus-tally-backend"
  }
}

#[tauri::command]
fn backend_status() -> bool {
  // Simple health check - try to reach backend on :5000
  match TcpStream::connect("127.0.0.1:5000") {
    Ok(_) => true,
    Err(_) => false,
  }
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
  let _ = window.minimize();
}

#[tauri::command]
fn maximize_window(window: tauri::Window) {
  let _ = if window.is_maximized().unwrap_or(false) {
    window.unmaximize()
  } else {
    window.maximize()
  };
}

#[tauri::command]
fn close_window(window: tauri::Window) {
  let _ = window.close();
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle, state: tauri::State<BackendState>) {
  if let Ok(mut proc) = state.0.lock() {
    if let Some(mut child) = proc.take() {
      let _ = child.kill();
    }
  }
  app.exit(0);
}

#[tauri::command]
fn force_close_window(_app: tauri::AppHandle, state: tauri::State<BackendState>) {
  println!("✓ [FORCE CLOSE] Called, killing backend and exiting");
  if let Ok(mut proc) = state.0.lock() {
    if let Some(mut child) = proc.take() {
      let _ = child.kill();
    }
  }
  println!("✓ [FORCE CLOSE] Backend killed, exiting with code 0");
  std::process::exit(0);
}
