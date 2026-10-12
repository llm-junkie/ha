import { Check, Download, RefreshCw, Share, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import { installApp, prepareOffline, updateApp, type PwaState } from './pwa';
import { APP_VERSION } from './version';
import './pwa.css';

export function pwaLabel(state: PwaState) {
  if (state.updateAvailable) return 'Update available';
  if (!state.online) return 'Offline';
  if (!state.installed && state.support === 'available') return 'Install app';
  if (state.ready) return 'Offline ready';
  return '';
}

export default function PwaPanel({ state, loaded, updateTitleRef }: {
  state: PwaState; loaded: boolean; updateTitleRef?: Ref<HTMLHeadingElement>;
}) {
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const installHelp = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showInstallHelp) installHelp.current?.scrollIntoView({ block: 'nearest' });
  }, [showInstallHelp]);
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
      {state.installed ? <p>Human Atlas + is installed on this device.</p> : <>
        <p>Install Human Atlas + to open it from your home screen or desktop.</p>
        <Button onClick={() => {
          if (state.canInstall) void installApp();
          else setShowInstallHelp((open) => !open);
        }} disabled={!available || state.installing}
          aria-expanded={!state.canInstall ? showInstallHelp : undefined}
          aria-controls={!state.canInstall ? 'pwa-install-help' : undefined}>
          <Download size={16} aria-hidden="true" /> Install Human Atlas +
        </Button>
        {!state.canInstall && <p className="pwa-hint">
          {state.support === 'development' ? 'Installation is available in the published atlas.'
            : 'This button shows installation steps for browsers that use their own menu.'}
        </p>}
        {showInstallHelp && !state.canInstall && <div ref={installHelp} id="pwa-install-help" className="pwa-install-help">
          <h3>Install on iPhone or iPad</h3>
          <ol>
            <li>Open this page in <strong>Safari</strong> and tap <Share size={14} aria-hidden="true" />{' '}
              <strong>Share</strong>. In the compact toolbar, open the page menu first.</li>
            <li>Choose <strong>Add to Home Screen</strong>. Tap <strong>More</strong> or{' '}
              <strong>View More</strong> first if needed.</li>
            <li>Keep <strong>Open as Web App</strong> turned on if shown, then tap <strong>Add</strong>.</li>
          </ol>
          <p className="pwa-hint">In other browsers, look for <strong>Install app</strong> or{' '}
            <strong>Add to Home Screen</strong> in the browser menu.</p>
        </div>}
      </>}
      <div className={`pwa-offline ${state.ready ? 'is-ready' : ''}`} role="status">
        {state.ready ? <Check size={17} /> : !state.online ? <WifiOff size={17} /> : <Download size={17} />}
        <span>{title}</span>
      </div>
      <p className="pwa-hint">
        {state.ready
          ? 'The atlas and all anatomy files are saved in this browser. Offline saving is separate from installation. Keep the site data to retain your offline copy and bookmarks.'
          : state.support === 'unavailable'
            ? 'You can continue exploring online. Try a browser that allows offline site storage.'
            : state.support === 'development'
              ? 'Use a production build to try installation and offline access.'
              : state.error
                ? 'Your browser could not keep all anatomy files. Reconnect and retry, or free some device storage.'
                : 'Stay connected while both anatomy models are saved (about 68 MB combined). The app will confirm when both are ready offline.'}
      </p>
      {available && loaded && !state.ready && (state.error || !state.online) && (
        <Button variant="outline" onClick={prepareOffline} disabled={!state.online}>
          <RefreshCw size={16} /> Retry offline saving
        </Button>
      )}
      <div className="pwa-update-section">
        <h3 ref={updateTitleRef} tabIndex={-1}>{state.updateAvailable ? 'A new version is ready' : 'App updates'}</h3>
        <p className="pwa-version">Current version <strong>{APP_VERSION}</strong></p>
        <p className="pwa-hint">
          {state.support === 'development' ? 'Updates are available in the published atlas.'
            : 'Check for the latest version. Updating reloads open atlas windows; saved views stay on this device.'}
        </p>
        <Button onClick={() => void updateApp()} disabled={!available || state.checking || state.updating}
          aria-busy={state.checking || state.updating}>
          <RefreshCw size={16} aria-hidden="true" />
          {state.updating ? 'Updating…' : state.checking ? 'Checking…' : 'Update'}
        </Button>
        {state.updateNotice && <p className="pwa-update-notice" role="status">{state.updateNotice}</p>}
      </div>
      {state.notice && <p className="pwa-hint" role="status">{state.notice}</p>}
    </section>
  );
}
