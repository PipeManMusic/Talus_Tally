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
  // Wait a moment for any existing backend to stop
  std::thread::sleep(std::time::Duration::from_millis(500));

  // If backend is already running, reuse it
  if TcpStream::connect("127.0.0.1:5000").is_ok() {
    println!("✓ Python backend already running, reusing existing process");
    return;
  }

  // Try to start Python backend
  let project_root = std::env::current_dir()
    .unwrap()
    .parent()
    .unwrap()
    .parent()
    .unwrap()
    .to_path_buf();
  
  let venv_python = project_root.join("venv/bin/python3");
  
  match Command::new(&venv_python)
    .args(&["-m", "backend.app"])
    .current_dir(&project_root)
    .spawn() {
    Ok(child) => {
      if let Ok(mut proc) = backend_process.lock() {
        *proc = Some(child);
        println!("✓ Python backend started successfully");
      }
    }
    Err(e) => {
      eprintln!("✗ Failed to start Python backend: {}", e);
      eprintln!("Make sure you have Python installed and venv activated");
    }
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
