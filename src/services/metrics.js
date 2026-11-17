// Tiny in-memory request metrics for the System Overview page
const state = { startedAt: Date.now(), requests: 0, errors: 0, totalMs: 0, perMinute: [], ai: { lastOk: null, lastAt: null, lastMs: null, lastError: "", calls: 0, failures: 0 } };

export const metricsMiddleware = (req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    state.requests++; state.totalMs += ms;
    if (res.statusCode >= 500) state.errors++;
    const minute = Math.floor(Date.now() / 60000);
    const last = state.perMinute[state.perMinute.length - 1];
    if (last && last.minute === minute) last.count++; else state.perMinute.push({ minute, count: 1 });
    if (state.perMinute.length > 30) state.perMinute.shift();
  });
  next();
};

export const recordAi = ({ ok, ms, error = "" }) => {
  state.ai = { lastOk: ok, lastAt: Date.now(), lastMs: Math.round(ms), lastError: error, calls: state.ai.calls + 1, failures: state.ai.failures + (ok ? 0 : 1) };
};

export const snapshot = () => ({
  uptimeSec: Math.round((Date.now() - state.startedAt) / 1000),
  requests: state.requests,
  errors: state.errors,
  avgMs: state.requests ? Math.round(state.totalMs / state.requests) : 0,
  perMinute: state.perMinute.map((p) => ({ t: new Date(p.minute * 60000).toISOString(), count: p.count })),
  ai: state.ai,
  memoryMb: Math.round(process.memoryUsage().rss / 1048576),
  node: process.version,
});
