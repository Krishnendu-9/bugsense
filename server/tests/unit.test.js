import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedWebhookUrl } from '../utils/webhookUrl.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { sanitizeRichText } from '../utils/sanitize.js';
import { checkJwtSecret } from '../services/token.service.js';
import { cloudinaryPublicId } from '../services/storage.service.js';
import { getClientOrigins, getPrimaryClientUrl } from '../utils/clientOrigins.js';
import { parseTrustProxy } from '../utils/trustProxy.js';
import { errorHandler } from '../middleware/error.middleware.js';

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
