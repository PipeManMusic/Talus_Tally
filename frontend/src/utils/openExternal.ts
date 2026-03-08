/**
 * Open a URL in the user's default browser.
 *
 * Uses the Tauri opener plugin when running inside Tauri,
 * falls back to window.open() for regular browser dev mode.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    // Not in Tauri or plugin unavailable — fall back to browser
    window.open(url, '_blank');
  }
}
