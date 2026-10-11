import { useSyncExternalStore } from 'react';
import { assetUrl } from './asset-url';
import { findAppUpdate } from './pwa-update';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export interface PwaState {
  support: 'starting' | 'available' | 'unavailable' | 'development';
  online: boolean;
  installed: boolean;
  canInstall: boolean;
  installing: boolean;
  updateAvailable: boolean;
  updating: boolean;
  checking: boolean;
  updateNotice: string;
  ready: boolean;
  saved: number;
  total: number;
  error: boolean;
  notice: string;
}
let state: PwaState = {
  support: import.meta.env.PROD ? 'starting' : 'development',
  online: navigator.onLine,
  installed: false,
  canInstall: false,
  installing: false,
  updateAvailable: false,
  updating: false,
  checking: false,
  updateNotice: '',
  ready: false,
  saved: 0,
  total: 0,
  error: false,
  notice: '',
};
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let installPrompt: InstallPrompt | undefined;
let prepareRequested = false;
let started = false;
const patch = (value: Partial<PwaState>) => {
  state = { ...state, ...value };
  listeners.forEach((listener) => listener());
};
export const usePwa = () => useSyncExternalStore(
  (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => state,
);
const message = (type: 'prepare' | 'status') =>
  registration?.active?.postMessage({ type: `human-atlas:${type}` });

export function prepareOffline() {
  prepareRequested = true;
  patch({ error: false });
  message('prepare');
}

export async function installApp() {
  const prompt = installPrompt;
  if (!prompt || state.installing) return;
  installPrompt = undefined;
  patch({ installing: true, canInstall: false, notice: '' });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') patch({ notice: 'Installation requested. Follow your browser’s instructions.' });
  } catch { patch({ notice: 'Use your browser’s menu to install Human Atlas.' }); }
  finally { patch({ installing: false }); }
}

export async function updateApp() {
  if (!registration || state.checking || state.updating) return;
  if (!state.online && !registration.waiting) {
    patch({ updateNotice: 'Connect to check for updates.' });
    return;
  }
  patch({ checking: true, updateNotice: 'Checking for updates…' });
  try {
    const worker = await findAppUpdate(registration, () =>
      patch({ updateNotice: 'Preparing the new version for offline use…' }),
    );
    if (worker) {
      patch({ updating: true, updateAvailable: true, updateNotice: 'Updating Human Atlas…' });
      worker.postMessage({ type: 'human-atlas:update' });
    } else patch({ updateAvailable: false, updateNotice: 'You’re up to date.' });
  } catch {
    patch({ updating: false, updateNotice: 'Couldn’t update. Check your connection and available storage, then try again.' });
  } finally { patch({ checking: false }); }
}

export function startPwa() {
  if (started) return;
  started = true;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => standalone.matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone;
  patch({ installed: isInstalled() });
  standalone.addEventListener('change', () => patch({ installed: isInstalled() }));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    patch({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    patch({ installed: true, canInstall: false, notice: 'Human Atlas is installed.' });
  });
  const connectivity = () => {
    patch({ online: navigator.onLine });
    message('status');
    if (navigator.onLine) {
      void registration?.update().catch(() => {});
      if (prepareRequested && !state.ready) message('prepare');
    }
  };
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  // Development remains uncached so edits appear immediately.
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    patch({ support: 'unavailable' });
    return;
  }
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // All open atlas windows reload together when an update is activated.
    if (controlled) location.reload();
    else { controlled = true; message('status'); }
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.source !== registration?.active) return;
    const value = event.data;
    if (value?.type !== 'human-atlas:status' || !Number.isInteger(value.saved) ||
        !Number.isInteger(value.total) || value.total < 1 || value.saved < 0 || value.saved > value.total)
      return;
    patch({ ready: value.ready === true, saved: value.saved, total: value.total, error: value.error === true });
  });
  void navigator.serviceWorker.register(assetUrl('sw.js'), {
    scope: import.meta.env.BASE_URL,
    updateViaCache: 'none',
  }).then((value) => {
    registration = value;
    const checkWaiting = () => patch({
      updateAvailable: !!value.waiting,
      ...(value.waiting && !state.checking && !state.updating ? { updateNotice: '' } : {}),
    });
    checkWaiting();
    const watchInstalling = () => {
      const worker = value.installing;
      worker?.addEventListener('statechange', () => {
        checkWaiting();
        if (worker.state === 'redundant' && !value.active) patch({ support: 'unavailable' });
      });
    };
    watchInstalling();
    value.addEventListener('updatefound', watchInstalling);
    void navigator.serviceWorker.ready.then(() => {
      patch({ support: 'available' });
      message('status');
      if (prepareRequested) message('prepare');
    });
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      message('status');
      if (navigator.onLine && Date.now() - lastCheck > 5 * 60_000) {
        lastCheck = Date.now();
        void value.update().catch(() => {});
      }
    });
  }).catch(() => patch({ support: 'unavailable' }));
}
