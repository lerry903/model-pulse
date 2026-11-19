// Node.js and browsers overflow longer native timer delays to a short delay.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Repeat at the requested interval, splitting long waits into safe timer chunks. */
export function setLongInterval(callback: () => void, intervalMs: number): () => void {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("Interval must be a positive safe integer in milliseconds");
  }

  let remainingMs = intervalMs;
  let timer: ReturnType<typeof setTimeout>;

  function schedule() {
    const delay = Math.min(remainingMs, MAX_TIMER_DELAY_MS);
    timer = setTimeout(() => {
      remainingMs -= delay;
      const due = remainingMs === 0;
      if (due) remainingMs = intervalMs;
      // Schedule before invoking the callback so it can cancel its own interval.
      schedule();
      if (due) callback();
    }, delay);
  }

  schedule();
  return () => clearTimeout(timer);
}
