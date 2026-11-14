// Preloaded into every agent (NODE_OPTIONS=--import): a fetch with no signal gets a 120 s timeout,
// so one stalled HTTPS connection can't freeze an agent loop forever.
const orig = globalThis.fetch;
globalThis.fetch = (input, init = {}) =>
  init.signal ? orig(input, init) : orig(input, { ...init, signal: AbortSignal.timeout(120_000) });
