import Anthropic from '@anthropic-ai/sdk';

let client;
const getClient = () => {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
};

// Heuristic fallback for offline demos, unconfigured API keys, or network failures
export const getHeuristicAnalysis = (errorLog = '', _bugContext = '') => {
  const logLower = errorLog.toLowerCase();

  if (logLower.includes('typeerror') || logLower.includes('cannot read properties') || logLower.includes('undefined')) {
    return {
      possibleCause:
        'Null or undefined pointer dereference. An object property is being accessed before the asynchronous data or component state has finished initializing.',
      suggestedFix:
        '1. Use optional chaining (e.g., `data?.property`) to safely guard property access.\n2. Provide initial default state (e.g., `useState([])` instead of `useState(null)`).\n3. Add defensive null checks or loading skeletons before rendering child elements.',
    };
  }

  if (logLower.includes('mongo') || logLower.includes('econnrefused') || logLower.includes('database')) {
    return {
      possibleCause:
        'Database connection refused or network socket timeout. The MongoDB daemon or Atlas cluster is either unreachable or rejecting authentication.',
      suggestedFix:
        '1. Ensure the local MongoDB service is started (`net start MongoDB`) or Atlas IP whitelist includes `0.0.0.0/0`.\n2. Validate that `MONGO_URI` in `server/.env` is correctly structured.\n3. Verify database network latency and connection pool settings in Mongoose.',
    };
  }

  if (logLower.includes('jwt') || logLower.includes('token') || logLower.includes('signature') || logLower.includes('unauthorized')) {
    return {
      possibleCause:
        'Authentication token verification failure. The JWT header was corrupted, expired, or signed with an incompatible secret.',
      suggestedFix:
        '1. Verify that `JWT_SECRET` in `server/.env` is consistent across server restarts.\n2. Check if the token in `localStorage` has expired and prompt re-login.\n3. Inspect the Axios request interceptor to confirm `Bearer <token>` is properly attached.',
    };
  }

  const firstLine = errorLog.trim().split('\n')[0] || 'Unknown runtime error';
  return {
    possibleCause: `Runtime exception triggered during execution: "${firstLine.slice(0, 100)}".`,
    suggestedFix:
      '1. Trace the stack frame pointing to your application code files.\n2. Validate input arguments against expected schema types.\n3. Implement a try/catch block with telemetry logging to isolate the failure point.',
  };
};

/**
 * Service: Analyze an error log using Claude AI (with automatic heuristic fallback)
 */
export const analyzeError = async (errorLog, bugContext = '') => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return getHeuristicAnalysis(errorLog, bugContext);
  }

  try {
    const userMessage = bugContext
      ? `Bug context: ${bugContext}\n\nError log:\n${errorLog}`
      : `Error log:\n${errorLog}`;

    const response = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system:
        'You are a senior debugging expert. Analyze the provided error log and return ONLY a valid JSON object with exactly two fields: possibleCause (string explaining the likely root cause) and suggestedFix (string with actionable fix steps). No markdown, no explanation outside the JSON.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content?.[0]?.text?.trim() || '';

    // Extract JSON even if wrapped in markdown code blocks ```json ... ``` or with surrounding text
    let cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);
    return {
      possibleCause: parsed.possibleCause || '',
      suggestedFix: parsed.suggestedFix || '',
    };
  } catch (apiError) {
    console.warn('AI analysis API request failed, falling back to heuristic analysis:', apiError.message);
    return getHeuristicAnalysis(errorLog, bugContext);
  }
};

/**
 * Service: Generates an AI Git patch (unified diff) and code explanation
 */
export const generateGitPatch = async (errorLog = '', bugDescription = '', steps = []) => {
  const stepsText = Array.isArray(steps) && steps.length ? `\nReproduction steps:\n${steps.join('\n')}` : '';
  const context = `Description: ${bugDescription}${stepsText}\n\nStack Trace:\n${errorLog}`;

  // Heuristic diff fallback for offline / unconfigured demo mode
  const getFallbackDiff = () => {
    // Attempt to parse a file name from the stack trace
    const match = errorLog.match(/at\s+(?:.*?\s+\()?([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+):(\d+)/);
    const targetFile = match ? match[1].replace(/\\/g, '/') : 'src/handlers/index.js';
    const lineNum = match ? parseInt(match[2], 10) : 42;

    return {
      diff: `--- a/${targetFile}
+++ b/${targetFile}
@@ -${Math.max(1, lineNum - 2)},5 +${Math.max(1, lineNum - 2)},7 @@
  function processPayload(payload) {
-   const data = payload.data;
-   return data.map(item => item.id);
+   if (!payload || !payload.data) {
+     console.warn('Payload data missing or uninitialized, returning empty fallback');
+     return [];
+   }
+   return payload.data.map(item => item?.id ?? null);
  }`,
      explanation:
        'Added defensive guard checks to verify object references before accessing member properties, avoiding runtime TypeError null pointer exceptions.',
      generatedAt: new Date(),
    };
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return getFallbackDiff();
  }

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system:
        'You are an elite staff software engineer. Given an error log and bug context, construct an exact, production-ready unified Git diff patch resolving the issue. Return ONLY a valid JSON object with exactly two fields: "diff" (string in standard unified diff format with --- a/... +++ b/... @@ ... @@ lines) and "explanation" (concise paragraph describing the code modification). No markdown fences outside the JSON.',
      messages: [{ role: 'user', content: context }],
    });

    const rawText = response.content?.[0]?.text?.trim() || '';
    let cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);
    return {
      diff: parsed.diff || getFallbackDiff().diff,
      explanation: parsed.explanation || 'Applied defensive code patch to prevent runtime dereference.',
      generatedAt: new Date(),
    };
  } catch (err) {
    console.warn('AI patch generation failed, using fallback patch:', err.message);
    return getFallbackDiff();
  }
};

/**
 * Service: Generates a formal Engineering Incident Post-Mortem in Markdown
 */
export const generatePostMortem = async (bug) => {
  const breadcrumbsSummary = (bug.breadcrumbs || [])
    .map((b) => `- **${new Date(b.timestamp).toISOString().slice(11, 19)}** [${b.category.toUpperCase()}]: ${b.message}`)
    .join('\n');

  const context = `
Incident Title: ${bug.title}
Priority: ${bug.priority} | Severity: ${bug.severity} | Occurrences: ${bug.occurrences || 1}
First Seen: ${bug.firstSeenAt || bug.createdAt}
Last Seen: ${bug.lastSeenAt || bug.updatedAt}
Description: ${bug.description}
Error Log: ${bug.errorLog || 'None recorded'}
AI Insights: ${bug.aiInsights?.possibleCause || 'None'}
Suggested Fix: ${bug.aiInsights?.suggestedFix || 'None'}
Telemetry Flight Recorder Breadcrumbs:
${breadcrumbsSummary || 'None captured'}
`;

  const fallbackPostMortem = `# Incident Post-Mortem: ${bug.title}

## Executive Summary
On ${new Date(bug.createdAt).toLocaleDateString()}, BugSense detected a **${bug.severity?.toUpperCase() || 'MAJOR'}** incident affecting the **${bug.project || 'Production'}** environment. The defect caused repeated runtime exceptions with **${bug.occurrences || 1} total occurrence(s)** before mitigation.

---

## Impact & Scope
- **Impacted Components**: Application Client & API Gateway
- **Severity**: ${bug.severity || 'major'}
- **Occurrences**: ${bug.occurrences || 1} recorded events
- **User Experience**: End-users experienced client-side degradation or unhandled exception states during user interaction.

---

## Timeline of Events (Flight Recorder Telemetry)
${breadcrumbsSummary || '- *No interactive breadcrumbs recorded prior to crash.*'}
- **Crash Point**: ${bug.errorLog ? bug.errorLog.split('\n')[0] : 'Exception thrown'}

---

## Root Cause Analysis (RCA)
${bug.aiInsights?.possibleCause || 'An unhandled exception was triggered due to an unverified object property access or network timeout during client state transition.'}

---

## Resolution & Mitigations
${bug.aiInsights?.suggestedFix || '1. Deployed defensive object checking.\n2. Added automated error boundary handling.\n3. Verified backend API response schema.'}

---

## Action Items & Preventative Measures
1. [ ] Implement automated regression tests for this user flow.
2. [ ] Add schema validation contracts between frontend and backend.
3. [ ] Set up real-time telemetry threshold alerts in BugSense Discord/Slack webhook.
`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { markdown: fallbackPostMortem, generatedAt: new Date() };
  }

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system:
        'You are a Principal Site Reliability Engineer (SRE). Given the incident details, generate a comprehensive, executive-ready Incident Post-Mortem in professional GitHub-flavored Markdown. Include sections: Executive Summary, Impact & Scope, Timeline of Events, Root Cause Analysis, Resolution, and Action Items. Return ONLY the markdown document without additional conversational filler.',
      messages: [{ role: 'user', content: context }],
    });

    const markdown = response.content?.[0]?.text?.trim() || fallbackPostMortem;
    return { markdown, generatedAt: new Date() };
  } catch (err) {
    console.warn('Post-mortem generation failed, using fallback:', err.message);
    return { markdown: fallbackPostMortem, generatedAt: new Date() };
  }
};
