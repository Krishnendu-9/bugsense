import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-5';

// Upper bounds on what is forwarded to the model. Stack traces beyond this add
// cost without adding signal.
const MAX_ERROR_LOG_CHARS = 20000;
const MAX_CONTEXT_CHARS = 5000;

let client;
const getClient = () => {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
};

// Lets tests run the Claude path against a stub client, with no network call.
// Pass undefined to go back to the real client.
export const setAIClientForTests = (stub) => {
  client = stub;
};

export const isAIConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const stripHtml = (html = '') => String(html).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();

// Pulls the JSON object out of a model reply, tolerating markdown fences or
// stray prose around it.
const parseJsonReply = (response) => {
  const rawText = response.content?.find((block) => block.type === 'text')?.text?.trim() || '';
  let cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
};

// Heuristic fallback for offline demos, unconfigured API keys, or network failures
export const getHeuristicAnalysis = (errorLog = '') => {
  const logLower = errorLog.toLowerCase();

  if (logLower.includes('typeerror') || logLower.includes('cannot read properties') || logLower.includes('undefined')) {
    return {
      possibleCause:
        'Null or undefined pointer dereference. An object property is being accessed before the asynchronous data or component state has finished initializing.',
      suggestedFix:
        '1. Use optional chaining (e.g., `data?.property`) to safely guard property access.\n2. Provide initial default state (e.g., `useState([])` instead of `useState(null)`).\n3. Add defensive null checks or loading skeletons before rendering child elements.',
      source: 'heuristic',
    };
  }

  if (logLower.includes('mongo') || logLower.includes('econnrefused') || logLower.includes('database')) {
    return {
      possibleCause:
        'Database connection refused or network socket timeout. The MongoDB daemon or Atlas cluster is either unreachable or rejecting authentication.',
      suggestedFix:
        '1. Ensure the local MongoDB service is started (`net start MongoDB`) or the Atlas IP access list includes this host.\n2. Validate that `MONGO_URI` in `server/.env` is correctly structured.\n3. Verify database network latency and connection pool settings in Mongoose.',
      source: 'heuristic',
    };
  }

  if (logLower.includes('jwt') || logLower.includes('token') || logLower.includes('signature') || logLower.includes('unauthorized')) {
    return {
      possibleCause:
        'Authentication token verification failure. The JWT header was corrupted, expired, or signed with an incompatible secret.',
      suggestedFix:
        '1. Verify that `JWT_SECRET` in `server/.env` is consistent across server restarts.\n2. Check if the token in `localStorage` has expired and prompt re-login.\n3. Inspect the Axios request interceptor to confirm `Bearer <token>` is properly attached.',
      source: 'heuristic',
    };
  }

  const firstLine = errorLog.trim().split('\n')[0] || 'Unknown runtime error';
  return {
    possibleCause: `Runtime exception triggered during execution: "${firstLine.slice(0, 100)}".`,
    suggestedFix:
      '1. Trace the stack frame pointing to your application code files.\n2. Validate input arguments against expected schema types.\n3. Implement a try/catch block with telemetry logging to isolate the failure point.',
    source: 'heuristic',
  };
};

/**
 * How a saved analysis is attributed wherever it leaves the bug page, by its
 * recorded source. Only 'claude' is called AI. A missing or unknown source is
 * said to be unrecorded rather than assumed: analyses saved before `source`
 * existed include unlabelled fallback text.
 */
const analysisAttribution = (insights) => {
  if (insights?.source === 'claude') {
    return { label: 'AI Analysis (Claude)' };
  }
  if (insights?.source === 'heuristic') {
    return {
      label: 'Heuristic Analysis',
      note: 'Matched from keywords in the error log by BugSense rules. This is not a model diagnosis.',
    };
  }
  return {
    label: 'Analysis (source not recorded)',
    note: 'BugSense has no record of what produced this analysis, so it is not presented as model output.',
  };
};

/**
 * A saved analysis as a Markdown section for text that leaves BugSense (the
 * GitHub issue body), attributed by its recorded source. Returns '' when there
 * is no analysis.
 */
export const analysisMarkdown = (insights) => {
  if (!insights?.possibleCause) return '';
  const { label, note } = analysisAttribution(insights);
  return [
    `### ${label}`,
    ...(note ? [`_${note}_`, ''] : []),
    `**Possible Cause:** ${insights.possibleCause}`,
    '',
    '**Suggested Fix:**',
    insights.suggestedFix || '',
    '',
  ].join('\n');
};

// The saved analysis as post-mortem prompt lines. Source says who produced it;
// Status says nobody has confirmed it.
//
// Every analysis is UNVERIFIED, Claude's included, and that is deliberate:
// nothing in BugSense confirms an analysis -- there is no human-confirmation
// state anywhere -- so "verified" can never be true today. A flag that is true
// for Claude and false for heuristics would record provenance, not
// confirmation, and the Source line already records provenance. Only drop the
// UNVERIFIED line once a person can actually confirm an analysis.
const analysisPromptLines = (insights) => {
  if (!insights?.possibleCause) return 'Saved Analysis: None';
  const { label, note } = analysisAttribution(insights);
  return [
    `Saved Analysis Source: ${label}${note ? ` -- ${note}` : ''}`,
    'Saved Analysis Status: UNVERIFIED',
    `Saved Possible Cause: ${insights.possibleCause}`,
    `Saved Suggested Fix: ${insights.suggestedFix || 'None'}`,
  ].join('\n');
};

const OWNER_TODO = '_To be completed by the incident owner._';

/**
 * Service: Analyze an error log using Claude AI (with automatic heuristic fallback).
 * The result's `source` says which one produced it, so the UI never labels a
 * keyword match as a model diagnosis.
 */
export const analyzeError = async (errorLog = '', bugContext = '') => {
  const log = String(errorLog).slice(0, MAX_ERROR_LOG_CHARS);
  const context = stripHtml(bugContext).slice(0, MAX_CONTEXT_CHARS);

  if (!isAIConfigured()) {
    return getHeuristicAnalysis(log);
  }

  try {
    const userMessage = context ? `Bug context: ${context}\n\nError log:\n${log}` : `Error log:\n${log}`;

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        'You are a senior debugging expert. Analyze the provided error log and return ONLY a valid JSON object with exactly two fields: possibleCause (string explaining the likely root cause) and suggestedFix (string with actionable fix steps). No markdown, no explanation outside the JSON.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const parsed = parseJsonReply(response);
    if (!parsed.possibleCause || !parsed.suggestedFix) throw new Error('AI reply was missing required fields');

    return {
      possibleCause: String(parsed.possibleCause),
      suggestedFix: String(parsed.suggestedFix),
      source: 'claude',
    };
  } catch (apiError) {
    console.warn('AI analysis API request failed, falling back to heuristic analysis:', apiError.message);
    return getHeuristicAnalysis(log);
  }
};

/**
 * Service: Generates an AI Git patch (unified diff) and code explanation.
 *
 * There is deliberately no offline fallback diff: a patch the model did not
 * write would be invented code. Without the API the result says so plainly.
 */
export const generateGitPatch = async (errorLog = '', bugDescription = '', steps = []) => {
  const unavailable = (reason) => ({
    diff: '',
    explanation: reason,
    source: 'unavailable',
    generatedAt: new Date(),
  });

  if (!isAIConfigured()) {
    return unavailable('AI patch generation needs ANTHROPIC_API_KEY to be configured on the server. No patch was generated.');
  }

  const stepsText = Array.isArray(steps) && steps.length ? `\nReproduction steps:\n${steps.join('\n')}` : '';
  const context = `Description: ${stripHtml(bugDescription).slice(0, MAX_CONTEXT_CHARS)}${stepsText}\n\nStack Trace:\n${String(errorLog).slice(0, MAX_ERROR_LOG_CHARS)}`;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system:
        'You are a senior software engineer. Given an error log and bug context, write a minimal unified Git diff patch resolving the issue. Return ONLY a valid JSON object with exactly two fields: "diff" (string in standard unified diff format with --- a/... +++ b/... @@ ... @@ lines) and "explanation" (concise paragraph describing the code modification). No markdown fences outside the JSON.',
      messages: [{ role: 'user', content: context }],
    });

    const parsed = parseJsonReply(response);
    if (!parsed.diff) throw new Error('AI reply did not contain a diff');

    return {
      diff: String(parsed.diff),
      explanation: String(parsed.explanation || ''),
      source: 'claude',
      generatedAt: new Date(),
    };
  } catch (err) {
    console.warn('AI patch generation failed:', err.message);
    return unavailable('The AI service could not produce a patch for this bug. Try again later.');
  }
};

/**
 * Service: Generates a formal Engineering Incident Post-Mortem in Markdown.
 * Without the API it returns a template filled with the incident's real data,
 * marked `source: 'template'`.
 */
export const generatePostMortem = async (bug) => {
  const breadcrumbsSummary = (bug.breadcrumbs || [])
    .map((b) => `- **${new Date(b.timestamp).toISOString().slice(11, 19)}** [${String(b.category).toUpperCase()}]: ${b.message}`)
    .join('\n');

  const description = stripHtml(bug.description);
  const insights = bug.aiInsights;
  const hasAnalysis = Boolean(insights?.possibleCause);
  const { label: analysisLabel, note: analysisNote } = analysisAttribution(insights);

  const context = `
Incident Title: ${bug.title}
Priority: ${bug.priority} | Severity: ${bug.severity} | Occurrences: ${bug.occurrences || 1}
First Seen: ${bug.firstSeenAt || bug.createdAt}
Last Seen: ${bug.lastSeenAt || bug.updatedAt}
Description: ${description.slice(0, MAX_CONTEXT_CHARS)}
Error Log: ${(bug.errorLog || 'None recorded').slice(0, MAX_ERROR_LOG_CHARS)}
${analysisPromptLines(insights)}
Telemetry Flight Recorder Breadcrumbs:
${breadcrumbsSummary || 'None captured'}
`;

  const templatePostMortem = `# Incident Post-Mortem: ${bug.title}

## Executive Summary
On ${new Date(bug.createdAt).toLocaleDateString()}, BugSense recorded a **${bug.severity?.toUpperCase() || 'MAJOR'}** incident in the **${bug.project || 'Production'}** project with **${bug.occurrences || 1} total occurrence(s)**.

${description ? `> ${description.slice(0, 500)}\n` : ''}
---

## Impact & Scope
- **Priority**: ${bug.priority || 'medium'}
- **Severity**: ${bug.severity || 'major'}
- **Occurrences**: ${bug.occurrences || 1} recorded events
- **Current status**: ${bug.status}

---

## Timeline of Events (Flight Recorder Telemetry)
${breadcrumbsSummary || '- *No interactive breadcrumbs recorded prior to crash.*'}
- **Crash Point**: ${bug.errorLog ? bug.errorLog.split('\n')[0] : 'No error log recorded'}

---

## Root Cause Analysis (RCA)
${hasAnalysis ? `_Source: ${analysisLabel}.${analysisNote ? ` ${analysisNote}` : ''}_\n\n${insights.possibleCause}` : OWNER_TODO}

---

## Resolution & Mitigations
${hasAnalysis && insights.suggestedFix ? `_Suggested by: ${analysisLabel}. Not confirmed as the applied fix._\n\n${insights.suggestedFix}` : OWNER_TODO}

---

## Action Items & Preventative Measures
1. [ ] Add a regression test covering this failure.
2. [ ] Confirm the fix in the affected environment.
3. [ ] Review alerting so a recurrence is caught early.
`;

  if (!isAIConfigured()) {
    return { markdown: templatePostMortem, source: 'template', generatedAt: new Date() };
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system:
        'You are a senior site reliability engineer. Given the incident details, write a clear, factual Incident Post-Mortem in professional GitHub-flavored Markdown. Include sections: Executive Summary, Impact & Scope, Timeline of Events, Root Cause Analysis, Resolution, and Action Items. The Saved Analysis Source line says what produced the saved cause and fix; attribute them accordingly, and call them AI or model output only when that source is Claude. If the saved analysis is marked UNVERIFIED, present its cause and fix as hypotheses still to be confirmed, never as the established root cause or as the fix that was applied. Return ONLY the markdown document without additional conversational filler.',
      messages: [{ role: 'user', content: context }],
    });

    const markdown = response.content?.find((block) => block.type === 'text')?.text?.trim();
    if (!markdown) throw new Error('AI reply was empty');
    return { markdown, source: 'claude', generatedAt: new Date() };
  } catch (err) {
    console.warn('Post-mortem generation failed, using template:', err.message);
    return { markdown: templatePostMortem, source: 'template', generatedAt: new Date() };
  }
};
