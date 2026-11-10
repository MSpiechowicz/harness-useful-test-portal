import { t } from '../i18n';
import { settingsState } from '../settings/settings.svelte';
import {
  checkShellUpdate,
  errorText,
  installShellUpdate,
  isShell,
  isUnsupported,
  relaunch,
  type UpdateInfo,
  type UpdateProgress,
} from './shell';

/**
 * Update state shared by the header pill and Settings. Only the app has an updater: in a browser everything here
 * stays idle and the UI hides it. A check that fails quietly (offline) says nothing; one the user asked for says why.
 * `installed` means the update is on disk and only the restart is left, so no further check or install is offered.
 */
export const updater = $state<{
  status: 'idle' | 'checking' | 'current' | 'available' | 'installed' | 'unsupported' | 'error';
  info: UpdateInfo | null;
  installing: boolean;
  progress: UpdateProgress | null;
  message: string | null;
}>({ status: 'idle', info: null, installing: false, progress: null, message: null });

let startupChecked = false;

/** The check at app start, honoring the "check for updates" setting. Runs once. */
export function checkOnStartup(): void {
  if (startupChecked || !isShell() || !settingsState.value.checkForUpdates) return;

  startupChecked = true;
  void checkUpdate(false);
}

/** `manual` checks report "up to date" and errors; quiet ones only surface a newer version. */
export async function checkUpdate(manual: boolean): Promise<void> {
  if (!isShell() || updater.installing || updater.status === 'checking' || updater.status === 'installed') return;

  updater.status = 'checking';
  updater.message = null;

  try {
    const info = await checkShellUpdate();

    updater.info = info;
    updater.status = info ? 'available' : 'current';
  } catch (error) {
    if (isUnsupported(error)) {
      updater.status = 'unsupported';
    } else if (manual) {
      updater.status = 'error';
      updater.message = errorText(error, t('update.unknownError'));
    } else {
      updater.status = 'idle';
    }
  }
}

/** Downloads and installs the update, then restarts the app. */
export async function installUpdate(): Promise<void> {
  if (!isShell() || updater.installing || updater.status === 'installed') return;

  updater.installing = true;
  updater.message = null;
  updater.progress = null;

  try {
    await installShellUpdate((progress) => (updater.progress = progress));
  } catch (error) {
    updater.message = t('update.failed', { error: errorText(error, t('update.unknownError')) });
    updater.installing = false;
    updater.progress = null;

    return;
  }

  // The install succeeded; a failed restart must not look like a failed install or bring the Install action back.
  updater.status = 'installed';
  updater.message = t('update.restarting');

  try {
    await relaunch();
  } catch (error) {
    updater.message = t('update.restartFailed', { error: errorText(error, t('update.unknownError')) });
    updater.installing = false;
    updater.progress = null;
  }
}

/** How much of the download is done (0 to 1), or null while the size is unknown. */
export function downloadFraction(): number | null {
  const progress = updater.progress;

  if (progress?.phase !== 'downloading' || !progress.total) return null;

  return Math.min(1, progress.downloaded / progress.total);
}

/** What the install is doing now. */
export function installText(): string {
  if (updater.progress?.phase !== 'downloading') return t('update.installing');

  const fraction = downloadFraction();

  return fraction === null ? t('update.downloading') : t('update.downloadingPercent', { percent: Math.round(fraction * 100) });
}
