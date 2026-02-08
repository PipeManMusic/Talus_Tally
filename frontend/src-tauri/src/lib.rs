use std::path::{Path, PathBuf};
use std::process::{Command, Child};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

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

fn start_backend(backend_process: Arc<Mutex<Option<Child>>>, _app_handle: tauri::AppHandle) {
  // Kill any existing backend process first to ensure clean state
  println!("Checking for existing backend processes...");
  #[cfg(target_os = "linux")]
  {
    for pattern in ["python.*backend.app", "talus-tally-backend"] {
      let _ = Command::new("pkill")
        .args(&["-f", pattern])
        .output();
    }
    println!("✓ Killed any existing backend processes");
  }

  #[cfg(target_os = "macos")]
  {
    for pattern in ["python.*backend.app", "talus-tally-backend"] {
      let _ = Command::new("pkill")
        .args(&["-f", pattern])
        .output();
    }
    println!("✓ Killed any existing backend processes");
  }

  #[cfg(target_os = "windows")]
  {
    for image in ["python.exe", "talus-tally-backend.exe"] {
      let _ = Command::new("taskkill")
        .args(&["/F", "/IM", image])
        .output();
    }
    println!("✓ Killed any existing backend processes");
  }

  // Wait for port to be released
  std::thread::sleep(std::time::Duration::from_millis(1000));

  // Determine project root - handle both development and installed locations
  let project_root = determine_project_root();

  let packaged_backend = project_root.join("talus-tally-backend");
  let venv_python = project_root.join(".venv/bin/python3");

  let spawn_result = if packaged_backend.exists() {
    println!(
      "✓ Starting packaged backend binary at {}",
      packaged_backend.display()
    );
    Command::new(&packaged_backend)
      .env("TALUS_DAEMON", "1")
      .current_dir(&project_root)
      .spawn()
  } else if venv_python.exists() {
    println!(
      "✓ Starting backend via virtualenv Python at {}",
      venv_python.display()
    );
    Command::new(&venv_python)
      .args(["-m", "backend.app"])
      .env("TALUS_DAEMON", "1")
      .current_dir(&project_root)
      .spawn()
  } else {
    println!("⚠️  Virtualenv not found, falling back to system python3");
    Command::new("python3")
      .args(["-m", "backend.app"])
      .env("TALUS_DAEMON", "1")
      .current_dir(&project_root)
      .spawn()
  };

  match spawn_result {
    Ok(child) => {
      if let Ok(mut proc) = backend_process.lock() {
        *proc = Some(child);
        println!("✓ Backend started successfully");
      }
    }
    Err(e) => {
      eprintln!("✗ Failed to start Python backend: {}", e);
      eprintln!("Project root: {:?}", project_root);
      eprintln!("Venv python: {:?}", venv_python);
      eprintln!("Make sure you have Python installed and .venv activated");
    }
  }
}

fn determine_project_root() -> PathBuf {
  if let Ok(exe_path) = std::env::current_exe() {
    let exe_dir = exe_path.parent().unwrap_or_else(|| Path::new("."));

    // Installed package layout
    if exe_dir.starts_with("/opt/talus-tally") {
      return PathBuf::from("/opt/talus-tally");
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
  std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
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
