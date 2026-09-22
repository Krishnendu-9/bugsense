// Caps how many background AI analyses the public telemetry endpoint may start
// per hour. Each new fingerprint would otherwise trigger a paid model call, so
// anyone able to reach the endpoint could run up the API bill.
//
// The counter is in-process: with several server instances each gets its own
// budget, which is still a hard ceiling rather than an unbounded one.
const WINDOW_MS = 60 * 60 * 1000;
let windowStart = Date.now();
let used = 0;

const hourlyBudget = () => {
  const configured = Number.parseInt(process.env.TELEMETRY_AI_HOURLY_BUDGET, 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : 20;
};

export const tryConsumeTelemetryAIBudget = () => {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    used = 0;
  }
  if (used >= hourlyBudget()) return false;
  used += 1;
  return true;
};
