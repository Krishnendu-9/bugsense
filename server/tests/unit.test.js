import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedWebhookUrl } from '../utils/webhookUrl.js';
import { generateFingerprint, topFrameOf } from '../utils/fingerprint.util.js';
import { htmlToText, sanitizeRichText } from '../utils/sanitize.js';
import { checkJwtSecret } from '../services/token.service.js';
import { cloudinaryPublicId } from '../services/storage.service.js';
import { getClientOrigins, getPrimaryClientUrl } from '../utils/clientOrigins.js';
import { parseTrustProxy } from '../utils/trustProxy.js';
import { analysisMarkdown, analyzeError, generatePostMortem, getHeuristicAnalysis, setAIClientForTests } from '../services/ai.service.js';
import { buildDiscordPayload, buildSlackPayload, escapeSlack } from '../services/webhook.service.js';
import { errorHandler } from '../middleware/error.middleware.js';
import {
  countResolvedSince,
  median,
  openCountsByDay,
  resolutionStats,
  statusAt,
  timeToFirstResolution,
} from '../utils/bugStats.js';

describe('isAllowedWebhookUrl', () => {
  it('accepts genuine Discord and Slack webhook URLs', () => {
    assert.ok(isAllowedWebhookUrl('discord', 'https://discord.com/api/webhooks/123/abc'));
    assert.ok(isAllowedWebhookUrl('slack', 'https://hooks.slack.com/services/T0/B0/xyz'));
  });

  it('rejects look-alike hosts, other schemes, credentials and ports', () => {
    for (const url of [
      'http://discord.com/api/webhooks/1/a',
      'https://discord.com.evil.test/api/webhooks/1/a',
      'https://evil.test/?https://discord.com/api/webhooks/1',
      'https://user:pw@discord.com/api/webhooks/1/a',
      'https://discord.com:8443/api/webhooks/1/a',
      'https://discord.com/other/path',
      'not a url',
    ]) {
      assert.equal(isAllowedWebhookUrl('discord', url), false, url);
    }
    assert.equal(isAllowedWebhookUrl('slack', 'https://discord.com/api/webhooks/1/a'), false);
  });
});

describe('generateFingerprint', () => {
  it('ignores volatile numbers and line/column positions', () => {
    const a = generateFingerprint('Error: user 42 failed\n    at run (app.js:10:5)', '', 'web');
    const b = generateFingerprint('Error: user 97 failed\n    at run (app.js:88:1)', '', 'web');
    assert.equal(a, b);
  });

  it('keeps projects in separate buckets', () => {
    assert.notEqual(generateFingerprint('Error: x', '', 'web'), generateFingerprint('Error: x', '', 'api'));
  });
});

describe('sanitizeRichText', () => {
  it('keeps Quill formatting', () => {
    const html = '<p><strong>bold</strong> <em>i</em></p><ol><li data-list="bullet">one</li></ol><pre class="ql-syntax">code</pre>';
    assert.equal(sanitizeRichText(html), html);
  });

  it('forces safe link attributes', () => {
    assert.equal(
      sanitizeRichText('<a href="https://x.dev" onclick="evil()">x</a>'),
      '<a href="https://x.dev" target="_blank" rel="noopener noreferrer">x</a>'
    );
  });

  // The sanitize-html advisories fixed in 2.18.0 (GHSA-x3q4-9hxx-gx8m,
  // GHSA-374f-7chj-9948, GHSA-cv27-6wvh-8x7j) and the source-map-js one reached
  // through its CSS parser (GHSA-68fv-2mgg-jv7q) all need a tag or attribute this
  // allowlist leaves out: noscript, svg, meta or style. If this test fails, the
  // allowlist was widened and docs/ARCHITECTURE.md needs revisiting.
  it('neutralises the 2026 advisory payloads under our allowlist', () => {
    for (const html of [
      '<p><noscript></p><a href="javascript:alert(1)">x</a><img src="http://evil.test/t.gif"></noscript>',
      '<svg><a href="#safe"><svg:animate attributeName="href" values="#safe;javascript:alert(1)" dur=".01s"/></a></svg>',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<span style="color:red /*# sourceMappingURL=data:application/json;base64,e30= */">x</span>',
    ]) {
      const out = sanitizeRichText(html);
      assert.doesNotMatch(out, /javascript:|<img|<svg|<meta|<noscript|style=/i, out);
    }
  });
});

describe('checkJwtSecret', () => {
  const strong = 'a'.repeat(64);

  it('ignores development and test environments', () => {
    assert.equal(checkJwtSecret({ NODE_ENV: 'development' }).fatal, false);
  });

  it('refuses to start production without a secret, even when insecure secrets are allowed', () => {
    assert.equal(checkJwtSecret({ NODE_ENV: 'production', ALLOW_INSECURE_JWT_SECRET: 'true' }).fatal, true);
  });

  it('refuses published and short secrets in production', () => {
    assert.equal(checkJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'bugsense_local_demo_secret_change_me' }).fatal, true);
    assert.equal(checkJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' }).fatal, true);
  });

  it('allows a weak secret only with an explicit opt-in, and still warns', () => {
    const result = checkJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short', ALLOW_INSECURE_JWT_SECRET: 'true' });
    assert.equal(result.fatal, false);
    assert.ok(result.warnings.length > 0);
  });

  it('accepts a long random secret', () => {
    assert.deepEqual(checkJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong }), { fatal: false, warnings: [] });
  });
});

describe('cloudinaryPublicId', () => {
  it('extracts ids only from our own folder and cloud', () => {
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';
    try {
      assert.equal(cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v17/bugsense/a1.png'), 'bugsense/a1');
      assert.equal(cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/bugsense/nested/a1.webp'), 'bugsense/nested/a1');
      assert.equal(cloudinaryPublicId('https://res.cloudinary.com/other/image/upload/v1/bugsense/a1.png'), null);
      assert.equal(cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v1/someone-else/a1.png'), null);
      assert.equal(cloudinaryPublicId('https://evil.example/demo/image/upload/v1/bugsense/a1.png'), null);
      assert.equal(cloudinaryPublicId('/uploads/a1.png'), null);
    } finally {
      delete process.env.CLOUDINARY_URL;
    }
  });
});

describe('getClientOrigins', () => {
  it('splits a comma-separated CLIENT_URL and uses the first entry for links', () => {
    const previous = process.env.CLIENT_URL;
    process.env.CLIENT_URL = ' https://bugsense.app/ , https://bugsense-git-feature.vercel.app ';
    try {
      assert.deepEqual(getClientOrigins(), ['https://bugsense.app', 'https://bugsense-git-feature.vercel.app']);
      assert.equal(getPrimaryClientUrl(), 'https://bugsense.app');
    } finally {
      if (previous === undefined) delete process.env.CLIENT_URL;
      else process.env.CLIENT_URL = previous;
    }
  });

  it('defaults to the Vite dev server', () => {
    const previous = process.env.CLIENT_URL;
    delete process.env.CLIENT_URL;
    try {
      assert.deepEqual(getClientOrigins(), ['http://localhost:5173']);
    } finally {
      if (previous !== undefined) process.env.CLIENT_URL = previous;
    }
  });
});

describe('parseTrustProxy', () => {
  it('defaults to one hop and understands counts, booleans and address lists', () => {
    assert.equal(parseTrustProxy(undefined), 1);
    assert.equal(parseTrustProxy('2'), 2);
    assert.equal(parseTrustProxy('0'), 0);
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('true'), true);
    assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
  });
});

describe('errorHandler', () => {
  const run = (err) => {
    const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const originalError = console.error;
    console.error = () => {};
    try {
      errorHandler(err, {}, res, () => {});
    } finally {
      console.error = originalError;
    }
    return res;
  };

  it('maps a query time-out to 503 with guidance', () => {
    const res = run(Object.assign(new Error('operation exceeded time limit'), { code: 50 }));
    assert.equal(res.statusCode, 503);
    assert.match(res.body.message, /more specific/);
  });

  it('maps duplicate keys to 409 and unknown errors to 500', () => {
    assert.equal(run(Object.assign(new Error('dup'), { code: 11000, keyValue: { email: 'a' } })).statusCode, 409);
    assert.equal(run(new Error('boom')).statusCode, 500);
  });
});

describe('bug history statistics', () => {
  const at = (iso) => new Date(iso);
  const change = (status, iso) => ({ status, changedAt: at(iso) });
  // Noon UTC, so the window is 12-18 October and no fixture sits on a boundary.
  const NOW = at('2026-10-18T12:00:00Z');

  // Created open on the 13th, picked up on the 15th, resolved on the 17th.
  const worked = {
    createdAt: at('2026-10-13T10:00:00Z'),
    status: 'resolved',
    statusHistory: [change('in-progress', '2026-10-15T09:00:00Z'), change('resolved', '2026-10-17T09:00:00Z')],
  };
  // Reported on the evening of the 16th and untouched since.
  const fresh = { createdAt: at('2026-10-16T20:00:00Z'), status: 'open', statusHistory: [] };
  // Resolved on the 14th, regressed back to open on the 17th.
  const regressed = {
    createdAt: at('2026-10-10T08:00:00Z'),
    status: 'open',
    statusHistory: [change('resolved', '2026-10-14T12:00:00Z'), change('open', '2026-10-17T08:00:00Z')],
  };
  // Closed without ever being resolved, before the window's first day ended.
  const dismissed = {
    createdAt: at('2026-10-01T08:00:00Z'),
    status: 'closed',
    statusHistory: [change('closed', '2026-10-12T05:00:00Z')],
  };

  it('replays a status at a past moment backward from the current status', () => {
    assert.equal(statusAt(worked, at('2026-10-12T00:00:00Z')), null, 'did not exist yet');
    assert.equal(statusAt(worked, at('2026-10-14T00:00:00Z')), 'open', 'before any change: created open');
    assert.equal(statusAt(worked, at('2026-10-16T00:00:00Z')), 'in-progress');
    assert.equal(statusAt(worked, NOW), 'resolved');
    // No history at all (a gap, or a bug never touched): the current status
    // holds for its whole life, so "now" can never disagree with the record.
    assert.equal(statusAt({ createdAt: at('2026-10-01T00:00:00Z'), status: 'closed' }, NOW), 'closed');
  });

  it('counts open bugs per UTC day, oldest first, with today measured now', () => {
    assert.deepEqual(openCountsByDay([worked, fresh, regressed, dismissed], NOW), [
      { date: '2026-10-12', open: 1 }, // regressed
      { date: '2026-10-13', open: 2 }, // regressed, worked
      { date: '2026-10-14', open: 1 }, // worked (regressed was resolved at noon)
      { date: '2026-10-15', open: 0 }, // worked went in-progress that morning
      { date: '2026-10-16', open: 1 }, // fresh
      { date: '2026-10-17', open: 2 }, // fresh, regressed reopened
      { date: '2026-10-18', open: 2 }, // fresh, regressed
    ]);
  });

  it('measures time to the FIRST resolution, not the last', () => {
    const day = 24 * 60 * 60 * 1000;
    const fixedThenRegressed = {
      createdAt: at('2026-10-01T00:00:00Z'),
      statusHistory: [
        change('resolved', '2026-10-02T00:00:00Z'),
        change('open', '2026-10-06T00:00:00Z'),
        change('resolved', '2026-10-21T00:00:00Z'),
      ],
    };
    assert.equal(timeToFirstResolution(fixedThenRegressed), day);
  });

  it('does not treat closed as resolved', () => {
    assert.equal(timeToFirstResolution(dismissed), null);
    const closedThenResolved = {
      createdAt: at('2026-10-01T00:00:00Z'),
      statusHistory: [change('closed', '2026-10-02T00:00:00Z'), change('resolved', '2026-10-04T00:00:00Z')],
    };
    assert.equal(timeToFirstResolution(closedThenResolved), 3 * 24 * 60 * 60 * 1000);
  });

  it('floors a resolution recorded before creation at zero', () => {
    const seeded = { createdAt: at('2026-10-01T00:00:05Z'), statusHistory: [change('resolved', '2026-10-01T00:00:00Z')] };
    assert.equal(timeToFirstResolution(seeded), 0);
  });

  it('counts bugs resolved since a moment, once each, never closures', () => {
    const since = at('2026-10-12T00:00:00Z');
    const beforeWindow = {
      createdAt: at('2026-10-01T00:00:00Z'),
      statusHistory: [change('resolved', '2026-10-11T23:59:59Z')],
    };
    const twiceInWindow = {
      createdAt: at('2026-10-11T00:00:00Z'),
      statusHistory: [change('resolved', '2026-10-13T00:00:00Z'), change('open', '2026-10-14T00:00:00Z'), change('resolved', '2026-10-15T00:00:00Z')],
    };
    // worked: resolved in the window. regressed: resolved in the window, then
    // reopened -- still resolved this week. dismissed: closed, never resolved.
    assert.equal(countResolvedSince([worked, regressed, dismissed, fresh, beforeWindow, twiceInWindow], since), 3);
  });

  it('takes the median over resolved bugs only', () => {
    assert.equal(median([]), null);
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);

    const hours = (n) => n * 60 * 60 * 1000;
    const resolvedAfter = (h) => ({
      createdAt: at('2026-10-01T00:00:00Z'),
      statusHistory: [change('resolved', new Date(at('2026-10-01T00:00:00Z').getTime() + hours(h)).toISOString())],
    });
    const stats = resolutionStats([resolvedAfter(2), resolvedAfter(10), resolvedAfter(4), dismissed, fresh]);
    assert.deepEqual(stats, { medianMs: hours(4), sampleSize: 3 });
    assert.deepEqual(resolutionStats([dismissed, fresh]), { medianMs: null, sampleSize: 0 });
  });
});

// topFrameOf shows the frame the v2 key selects (docs/fingerprint-eval-v2.md,
// 2.3; Amendment 1, P22).
describe('topFrameOf', () => {
  it('shows the top app frame as written, the frame the v2 key selects', () => {
    const log = 'TypeError: x is undefined\n    at render (App.jsx:12:3)\n    at commit (react.js:1:1)';
    assert.equal(topFrameOf(log), 'at render (App.jsx:12:3)');
    // The v1 key is kept for the migration and still ignores line numbers.
    assert.equal(generateFingerprint(log, '', 'p'), generateFingerprint(log.replace(':12:3', ':99:9'), '', 'p'));
  });

  it('reads Firefox and Safari frames too, and skips native, SDK and library frames', () => {
    assert.equal(topFrameOf('render@App.jsx:12:3'), 'render@App.jsx:12:3');
    const log = [
      'json@[native code]',
      'window.fetch@https://bugsense.example/sdk/bugsense.js:185:20',
      'settle@http://localhost:7120/node_modules/.vite/deps/axios.js:1203:12',
      'placeOrder@http://localhost:7120/src/checkout/placeOrder.js:22:9',
    ].join('\n');
    assert.equal(topFrameOf(log), 'placeOrder@http://localhost:7120/src/checkout/placeOrder.js:22:9');
  });

  it('returns null when there is no usable frame to show', () => {
    assert.equal(topFrameOf(''), null);
    assert.equal(topFrameOf(undefined), null);
    assert.equal(topFrameOf('Script error. at /products/reviews-widget:0:0'), null);
    assert.equal(topFrameOf('at JSON.parse (<anonymous>)'), null);
  });

  it('caps a very long frame', () => {
    assert.equal(topFrameOf(`Error\n at ${'x'.repeat(500)}`).length, 160);
  });
});

describe('analysisMarkdown', () => {
  const insights = { possibleCause: 'Null reference', suggestedFix: 'Guard the access' };

  it('calls only claude output AI', () => {
    const md = analysisMarkdown({ ...insights, source: 'claude' });
    assert.match(md, /^### AI Analysis \(Claude\)$/m);
    assert.match(md, /\*\*Possible Cause:\*\* Null reference/);
  });

  it('labels the keyword fallback as heuristic and says it is not a model diagnosis', () => {
    const md = analysisMarkdown({ ...insights, source: 'heuristic' });
    assert.match(md, /^### Heuristic Analysis$/m);
    assert.match(md, /not a model diagnosis/);
    assert.doesNotMatch(md, /\bAI\b|Claude/);
  });

  it('never attributes a missing or unknown source to AI', () => {
    for (const source of [undefined, null, '', 'template', 'something-new']) {
      const md = analysisMarkdown({ ...insights, source });
      assert.match(md, /^### Analysis \(source not recorded\)$/m, `source=${source}`);
      assert.doesNotMatch(md, /\bAI\b|Claude/, `source=${source}`);
    }
  });

  it('returns nothing without an analysis', () => {
    assert.equal(analysisMarkdown(undefined), '');
    assert.equal(analysisMarkdown({ possibleCause: '', source: 'claude' }), '');
  });
});

describe('generatePostMortem', () => {
  const insights = { possibleCause: 'Null reference in render', suggestedFix: 'Guard the access' };
  const bugWith = (aiInsights) => ({
    title: 'Checkout crashes',
    description: '<p>Clicking Pay crashes the page</p>',
    priority: 'high',
    severity: 'major',
    status: 'open',
    errorLog: 'TypeError: Cannot read properties of undefined',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-02T10:00:00Z'),
    aiInsights,
  });
  const unrecordedSources = [undefined, null, '', 'template', 'something-new'];
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const restoreKey = () => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  };

  describe('prompt sent to Claude', () => {
    let requests;

    beforeEach(() => {
      requests = [];
      // The stub goes in before the key is set, so a real client is never built.
      setAIClientForTests({
        beta: {
          messages: {
            create: async (params) => {
              requests.push(params);
              return { stop_reason: 'end_turn', content: [{ type: 'text', text: '# Incident Post-Mortem' }] };
            },
          },
        },
      });
      process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    });

    afterEach(() => {
      setAIClientForTests(undefined);
      restoreKey();
    });

    const promptFor = async (aiInsights) => {
      const result = await generatePostMortem(bugWith(aiInsights));
      assert.equal(result.source, 'claude');
      assert.equal(requests.length, 1);
      return requests[0].messages[0].content;
    };

    // Nothing in BugSense confirms an analysis, so a Claude one is unverified too.
    it('labels a Claude analysis as model output, still unverified', async () => {
      const prompt = await promptFor({ ...insights, source: 'claude' });
      assert.match(prompt, /^Saved Analysis Source: AI Analysis \(Claude\)$/m);
      assert.match(prompt, /^Saved Analysis Status: UNVERIFIED$/m);
      assert.match(prompt, /^Saved Possible Cause: Null reference in render$/m);
      assert.match(prompt, /^Saved Suggested Fix: Guard the access$/m);
      assert.doesNotMatch(prompt, /AI Insights/);
    });

    it('labels a keyword match as heuristic and unverified', async () => {
      const prompt = await promptFor({ ...insights, source: 'heuristic' });
      assert.match(prompt, /^Saved Analysis Source: Heuristic Analysis -- .*not a model diagnosis\.$/m);
      assert.match(prompt, /^Saved Analysis Status: UNVERIFIED$/m);
      assert.match(prompt, /^Saved Possible Cause: Null reference in render$/m);
      assert.doesNotMatch(prompt, /AI Insights|AI Analysis|Claude/);
    });

    it('labels a missing or unknown source as unrecorded and unverified', async () => {
      for (const source of unrecordedSources) {
        requests.length = 0;
        const prompt = await promptFor({ ...insights, source });
        assert.match(prompt, /^Saved Analysis Source: Analysis \(source not recorded\) -- /m, `source=${source}`);
        assert.match(prompt, /^Saved Analysis Status: UNVERIFIED$/m, `source=${source}`);
        assert.doesNotMatch(prompt, /AI Insights|AI Analysis|Claude/, `source=${source}`);
      }
    });

    it('says there is no saved analysis when there is none', async () => {
      const prompt = await promptFor(undefined);
      assert.match(prompt, /^Saved Analysis: None$/m);
      assert.doesNotMatch(prompt, /Saved Analysis Source|UNVERIFIED/);
    });

    it('tells the model to treat an unverified analysis as a hypothesis', async () => {
      await promptFor({ ...insights, source: 'heuristic' });
      const { system } = requests[0];
      assert.match(system, /Saved Analysis Source/);
      assert.match(system, /UNVERIFIED/);
      assert.match(system, /hypothes[ie]s/);
      assert.match(system, /never as the established root cause or as the fix that was applied/);
    });

    it('tells the model to call the analysis AI output only when Claude produced it', async () => {
      await promptFor({ ...insights, source: 'claude' });
      assert.match(requests[0].system, /call them AI or model output only when that source is Claude/);
    });

    it('falls back to the attributed template when the call fails', async () => {
      setAIClientForTests({ beta: { messages: { create: async () => { throw new Error('offline'); } } } });
      const original = console.warn;
      console.warn = () => {};
      try {
        const result = await generatePostMortem(bugWith({ ...insights, source: 'heuristic' }));
        assert.equal(result.source, 'template');
        assert.match(result.markdown, /_Source: Heuristic Analysis\. .*not a model diagnosis\._/);
      } finally {
        console.warn = original;
      }
    });
  });

  describe('template without the API', () => {
    beforeEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(restoreKey);

    // The body of one "## heading" section, up to the next rule.
    const section = (markdown, heading) => {
      const start = markdown.indexOf(`## ${heading}\n`);
      assert.notEqual(start, -1, `missing section ${heading}`);
      const body = markdown.slice(start + heading.length + 4);
      return body.slice(0, body.indexOf('\n---')).trim();
    };

    const templateFor = async (aiInsights) => {
      const result = await generatePostMortem(bugWith(aiInsights));
      assert.equal(result.source, 'template');
      return {
        markdown: result.markdown,
        rca: section(result.markdown, 'Root Cause Analysis (RCA)'),
        resolution: section(result.markdown, 'Resolution & Mitigations'),
      };
    };

    it('attributes a Claude analysis and does not claim its fix was applied', async () => {
      const { rca, resolution } = await templateFor({ ...insights, source: 'claude' });
      assert.equal(rca, '_Source: AI Analysis (Claude)._\n\nNull reference in render');
      assert.equal(resolution, '_Suggested by: AI Analysis (Claude). Not confirmed as the applied fix._\n\nGuard the access');
    });

    it('attributes a keyword match as heuristic, never as AI', async () => {
      const { markdown, rca, resolution } = await templateFor({ ...insights, source: 'heuristic' });
      assert.equal(
        rca,
        '_Source: Heuristic Analysis. Matched from keywords in the error log by BugSense rules. This is not a model diagnosis._\n\nNull reference in render'
      );
      assert.equal(resolution, '_Suggested by: Heuristic Analysis. Not confirmed as the applied fix._\n\nGuard the access');
      assert.doesNotMatch(markdown, /\bAI\b|Claude/);
    });

    it('attributes a missing or unknown source as unrecorded, never as AI', async () => {
      for (const source of unrecordedSources) {
        const { markdown, rca, resolution } = await templateFor({ ...insights, source });
        assert.match(rca, /^_Source: Analysis \(source not recorded\)\. BugSense has no record/, `source=${source}`);
        assert.match(rca, /\n\nNull reference in render$/, `source=${source}`);
        assert.match(resolution, /^_Suggested by: Analysis \(source not recorded\)\. Not confirmed as the applied fix\._/, `source=${source}`);
        assert.doesNotMatch(markdown, /\bAI\b|Claude/, `source=${source}`);
      }
    });

    it('leaves both sections to the incident owner without an analysis', async () => {
      const { rca, resolution } = await templateFor(undefined);
      assert.equal(rca, '_To be completed by the incident owner._');
      assert.equal(resolution, '_To be completed by the incident owner._');
    });
  });
});

describe('htmlToText', () => {
  it('keeps paragraphs and list items apart and decodes entities', () => {
    assert.equal(
      htmlToText('<p>Tom &amp; Jerry</p><ol><li data-list="bullet">a &lt; b</li><li>c</li></ol>'),
      'Tom & Jerry\na < b\nc'
    );
  });

  it('decodes once, so encoded entities stay encoded', () => {
    assert.equal(htmlToText('<p>&amp;lt;b&amp;gt;</p>'), '&lt;b&gt;');
  });

  it('returns an empty string for anything that is not a string', () => {
    assert.equal(htmlToText(undefined), '');
    assert.equal(htmlToText({}), '');
  });
});

describe('alert payloads', () => {
  const bug = { _id: 'b1', title: 'Ping <!channel> & <@U1>', description: '<p>Tom &amp; Jerry</p>', priority: 'critical', severity: 'minor' };

  it('escapes Slack control characters in report text', () => {
    assert.equal(escapeSlack('<!here> & <https://x|y>'), '&lt;!here&gt; &amp; &lt;https://x|y&gt;');
    const { text } = buildSlackPayload(bug, 'created', 'https://app/bugs/b1');
    assert.match(text, /Ping &lt;!channel&gt; &amp; &lt;@U1&gt;/);
    // The link BugSense builds itself stays a link.
    assert.match(text, /<https:\/\/app\/bugs\/b1\|View Bug in BugSense>$/);
  });

  it('never lets a Discord alert mention anyone, and shows the description as text', () => {
    const payload = buildDiscordPayload(bug, 'escalated', 'https://app/bugs/b1');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].description, 'Tom & Jerry');
    assert.match(payload.embeds[0].title, /^⚠️ \[ESCALATED\]/);
  });
});

describe('getHeuristicAnalysis', () => {
  const causeOf = (log) => getHeuristicAnalysis(log).possibleCause;

  it('reads a JSON parse error as one, not as an auth failure', () => {
    // "token" is in the message; the old rules matched it as a JWT problem.
    assert.match(causeOf("SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"), /JSON parse failure/);
    assert.match(causeOf('SyntaxError: Unexpected token < in JSON at position 0'), /JSON parse failure/);
  });

  it('matches each failure shape to its own rule', () => {
    assert.match(causeOf("TypeError: Cannot read properties of undefined (reading 'id')"), /Null or undefined/);
    assert.match(causeOf('TypeError: cart.items.map is not a function'), /called as a function/);
    assert.match(causeOf('JsonWebTokenError: invalid signature'), /Authentication token/);
    assert.match(causeOf('MongoServerError: connection refused'), /Database connection/);
    assert.match(causeOf('TypeError: Failed to fetch'), /never got a response/);
  });

  it('does not treat a log as a null dereference just because it says undefined', () => {
    assert.match(causeOf('ReferenceError: process is undefined in this bundle'), /Runtime exception/);
  });

  it('always labels itself heuristic', () => {
    assert.equal(getHeuristicAnalysis('anything').source, 'heuristic');
  });
});

describe('analyzeError against a stub model', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  let requests;
  let reply;

  beforeEach(() => {
    requests = [];
    setAIClientForTests({ beta: { messages: { create: async (params) => { requests.push(params); return reply; } } } });
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  });
  afterEach(() => {
    setAIClientForTests(undefined);
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  const quietly = async (fn) => {
    const original = console.warn;
    console.warn = () => {};
    try {
      return await fn();
    } finally {
      console.warn = original;
    }
  };

  it('asks the current model, with room for thinking and the refusal fallback on', async () => {
    reply = {
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"possibleCause":"c","suggestedFix":"f"}' }],
    };
    const result = await analyzeError('TypeError: boom');
    assert.deepEqual(result, { possibleCause: 'c', suggestedFix: 'f', source: 'claude' });

    const [params] = requests;
    assert.equal(params.model, 'claude-sonnet-5-5');
    assert.ok(params.max_tokens >= 16000, 'thinking counts toward max_tokens');
    assert.equal(params.fallbacks, 'default');
    assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(params.output_config.effort, 'low');
  });

  it('falls back to the labelled heuristic when the reply is cut off or declined', async () => {
    for (const stopReason of ['max_tokens', 'refusal']) {
      reply = { stop_reason: stopReason, content: [{ type: 'text', text: '{"possibleCause":"half' }] };
      const result = await quietly(() => analyzeError('TypeError: Cannot read properties of null'));
      assert.equal(result.source, 'heuristic', stopReason);
    }
  });
});

describe('codeBlock', async () => {
  const { codeBlock } = await import('../controllers/bug.controller.js');

  it('uses a fence longer than any backtick run in the text', () => {
    assert.equal(codeBlock('plain'), '```\nplain\n```');
    assert.equal(codeBlock('a ``` b'), '````\na ``` b\n````');
    assert.equal(codeBlock('`````'), '``````\n`````\n``````');
  });
});

describe('environment checks', async () => {
  const { environmentWarnings, exposesErrorDetails } = await import('../utils/environment.js');

  it('shows error details only when the environment says development or test', () => {
    assert.equal(exposesErrorDetails({ NODE_ENV: 'development' }), true);
    assert.equal(exposesErrorDetails({ NODE_ENV: 'test' }), true);
    // A host that leaves NODE_ENV unset gets no stack traces.
    assert.equal(exposesErrorDetails({}), false);
    assert.equal(exposesErrorDetails({ NODE_ENV: 'production' }), false);
  });

  it('warns about a missing NODE_ENV and an open ingest endpoint in production', () => {
    assert.match(environmentWarnings({}).join(' '), /NODE_ENV is not set/);
    assert.match(environmentWarnings({ NODE_ENV: 'production' }).join(' '), /Telemetry ingest is open/);
    assert.deepEqual(environmentWarnings({ NODE_ENV: 'production', TELEMETRY_ALLOWED_ORIGINS: 'https://shop.example' }), []);
    assert.deepEqual(environmentWarnings({ NODE_ENV: 'development' }), []);
  });
});
