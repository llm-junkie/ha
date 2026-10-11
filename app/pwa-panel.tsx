import { Check, Download, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { installApp, prepareOffline, updateApp, type PwaState } from './pwa';
import './pwa.css';

export function pwaLabel(state: PwaState) {
  if (state.updateAvailable) return 'Update available';
  if (!state.online) return 'Offline';
  if (state.ready) return 'Offline ready';
  if (state.canInstall && !state.installed) return 'Install app';
  return '';
}

export default function PwaPanel({ state, loaded }: { state: PwaState; loaded: boolean }) {
  const available = state.support === 'available';
  const title = state.ready ? (state.online ? 'Ready offline' : 'You’re exploring offline')
    : !state.online ? 'You’re offline'
    : state.support === 'development' ? 'Offline support in the published app'
    : state.support === 'unavailable' ? 'Offline saving unavailable'
    : state.error ? 'Offline copy not saved'
    : !available ? 'Preparing offline support…'
    : !loaded ? 'Waiting for anatomy to finish loading…'
    : `Saving offline copy${state.total ? ` · ${state.saved} of ${state.total} files` : '…'}`;
  return (
    <section className="pwa-panel" aria-labelledby="pwa-title">
      <div className="pwa-heading">
        <Download size={19} aria-hidden="true" />
        <h2 id="pwa-title">Take the atlas with you</h2>
      </div>
      {state.installed ? <p>Human Atlas is installed on this device.</p> : <>
        <p>Install Human Atlas to open it from your home screen or desktop.</p>
        {state.canInstall ? (
          <Button onClick={() => void installApp()} disabled={state.installing}>
            <Download size={16} /> Install Human Atlas
          </Button>
        ) : <p className="pwa-hint">
          If your browser supports installation, choose <strong>Install app</strong> or{' '}
          <strong>Add to Home Screen</strong> in its menu. On iPhone or iPad, use{' '}
          <strong>Share → Add to Home Screen</strong>.
        </p>}
      </>}
      <div className={`pwa-offline ${state.ready ? 'is-ready' : ''}`} role="status">
        {state.ready ? <Check size={17} /> : !state.online ? <WifiOff size={17} /> : <Download size={17} />}
        <span>{title}</span>
      </div>
      <p className="pwa-hint">
        {state.ready
          ? 'The atlas and all anatomy files are saved in this browser. Keep the site data to retain your offline copy and bookmarks.'
          : state.support === 'unavailable'
            ? 'You can continue exploring online. Try a browser that allows offline site storage.'
            : state.support === 'development'
              ? 'Use a production build to try installation and offline access.'
              : state.error
                ? 'Your browser could not keep all anatomy files. Reconnect and retry, or free some device storage.'
                : 'Let the anatomy finish loading while connected. Its download is about 33 MB; the app will confirm when the complete atlas is saved.'}
      </p>
      {available && loaded && !state.ready && (state.error || !state.online) && (
        <Button variant="outline" onClick={prepareOffline} disabled={!state.online}>
          <RefreshCw size={16} /> Retry offline saving
        </Button>
      )}
      {state.updateAvailable && <div className="pwa-update-section">
        <h3>A new version is ready</h3>
        <p className="pwa-hint">Update reloads open atlas windows. Your saved views stay on this device.</p>
        <Button onClick={updateApp} disabled={state.updating}>
          <RefreshCw size={16} /> {state.updating ? 'Updating…' : 'Update now'}
        </Button>
      </div>}
      {state.notice && <p className="pwa-hint" role="status">{state.notice}</p>}
    </section>
  );
}
