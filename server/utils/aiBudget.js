// Caps how many background AI analyses may start per hour. Each one is a paid
// model call started without the caller asking for it (a new SDK crash, a new
// manual report), so without a ceiling anyone able to create bugs could run
// up the API bill.
//
// Counters are in-process: with several server instances each gets its own
// budget, which is still a hard ceiling rather than an unbounded one.
const WINDOW_MS = 60 * 60 * 1000;

const createHourlyBudget = (envVar, fallback) => {
  let windowStart = Date.now();
  let used = 0;

  const limit = () => {
    const configured = Number.parseInt(process.env[envVar], 10);
    return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
  };

  return () => {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      used = 0;
    }
    if (used >= limit()) return false;
    used += 1;
    return true;
  };
};

// Public SDK endpoint: unauthenticated, so the tighter budget.
export const tryConsumeTelemetryAIBudget = createHourlyBudget('TELEMETRY_AI_HOURLY_BUDGET', 20);

// Signed-in users filing bugs with an error log.
export const tryConsumeReportAIBudget = createHourlyBudget('REPORT_AI_HOURLY_BUDGET', 100);
