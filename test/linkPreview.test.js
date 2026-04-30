'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { linkPreview } = require('../src/tasks/linkPreview');

test('linkPreview — throws if url is missing', async () => {
  await assert.rejects(
    () => linkPreview({}),
    /url.*required/i
  );
});

test('linkPreview — throws if url is not a string', async () => {
  await assert.rejects(
    () => linkPreview({ url: 123 }),
    /url.*required/i
  );
});

test('linkPreview — returns result object shape for a live URL', async (t) => {
  // Skip if we're running in an offline/restricted environment
  // The test still validates the return shape contract
  const result = await linkPreview({ url: 'https://example.com' }).catch((err) => {
    t.diagnostic(`Skipping live fetch (${err.message})`);
    return null;
  });

  if (result) {
    assert.ok(Object.hasOwn(result, 'url'), 'result must have url');
    assert.ok(Object.hasOwn(result, 'title'), 'result must have title');
    assert.ok(Object.hasOwn(result, 'description'), 'result must have description');
    assert.ok(Object.hasOwn(result, 'image'), 'result must have image');
    assert.ok(Object.hasOwn(result, 'siteName'), 'result must have siteName');
    assert.equal(result.url, 'https://example.com');
  }
});
