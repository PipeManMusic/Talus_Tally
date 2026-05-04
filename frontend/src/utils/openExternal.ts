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

/**
 * Open a local file path with the OS default application.
 *
 * Falls back to no-op (with a thrown error) when not running in Tauri,
 * since browsers cannot launch local files.
 */
export async function openExternalPath(path: string): Promise<void> {
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(path);
}

/**
 * Heuristically classify a media reference as a URL or a local file path.
 * Treats common URL schemes (http, https, mailto, tel, ftp, file) as URLs.
 */
export function isExternalUrl(value: string): boolean {
  return /^(https?|mailto|tel|ftp|file):/i.test(value.trim());
}

/**
 * Launch a media reference using the appropriate handler:
 *  - URLs open in the default browser/handler.
 *  - File paths open with the OS default application for the file type.
 */
export async function launchMedia(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Media reference is empty');
  }
  if (isExternalUrl(trimmed)) {
    await openExternalUrl(trimmed);
    return;
  }
  await openExternalPath(trimmed);
}
