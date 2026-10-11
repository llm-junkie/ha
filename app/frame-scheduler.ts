interface FrameEnvironment {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  hidden: () => boolean;
}

// Coalesce loading, state and controls events into one pending frame. The
// callback requests another frame only while animation or damping continues.
export function createFrameScheduler(
  callback: FrameRequestCallback,
  environment: FrameEnvironment = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
    hidden: () => document.hidden,
  },
) {
  let frame = 0,
    disposed = false;
  const pause = () => {
    if (frame) environment.cancel(frame);
    frame = 0;
  };
  const request = () => {
    if (disposed || frame || environment.hidden()) return;
    frame = environment.request((time) => {
      frame = 0;
      if (!disposed) callback(time);
    });
  };
  return {
    request,
    pause,
    get pending() {
      return frame !== 0;
    },
    dispose() {
      disposed = true;
      pause();
    },
  };
}
