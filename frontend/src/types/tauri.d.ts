export {};

declare global {
  /** App version injected by Vite at build time from tauri.conf.json */
  const __APP_VERSION__: string;

  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}
