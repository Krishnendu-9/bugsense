import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedWebhookUrl } from '../utils/webhookUrl.js';
import { generateFingerprint } from '../utils/fingerprint.util.js';
import { sanitizeRichText } from '../utils/sanitize.js';

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
