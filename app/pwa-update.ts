type UpdateRegistration = Pick<ServiceWorkerRegistration, 'waiting' | 'installing' | 'update'>;

export async function findAppUpdate(
  registration: UpdateRegistration,
  onPreparing: () => void,
): Promise<ServiceWorker | null> {
  if (registration.waiting) return registration.waiting;
  if (!registration.installing) await registration.update();
  if (registration.waiting) return registration.waiting;
  const worker = registration.installing;
  if (!worker) return null;
  onPreparing();
  // update() can resolve before the new offline copy has finished installing.
  await new Promise<void>((resolve, reject) => {
    const changed = () => {
      if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', changed);
        reject(new Error('The updated atlas could not be prepared.'));
      } else if (['installed', 'activating', 'activated'].includes(worker.state)) {
        worker.removeEventListener('statechange', changed);
        resolve();
      }
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
  return registration.waiting;
}
