'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const collection = require('../config/law-collection.json');
const { prepareCollection } = require('../scripts/import-collection-laws');

test('collection import rejects changed PDFs and incomplete or misidentified sources before saving', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'law-collection-'));
  try {
    for (const guide of Object.values(collection).filter(guide => guide.article_count)) {
      const name = `law-${guide.number}-${guide.year}`;
      const bytes = Buffer.from('%PDF-1.7 source fixture');
      fs.writeFileSync(path.join(directory, name + '.pdf'), bytes);
      fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify({
        number: String(guide.number), year: String(guide.year), title: guide.short_title,
        published_at: guide.published_at, fek_number: guide.fek_number, source_url: `https://api.et.gr/apiLAW/1/${guide.year}/${guide.number}/pdf`,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'), page_count: 1,
        text: 'Source', sections: Array.from({ length: guide.article_count }, (_, index) => ({ number: String(index + 1), label: 'Άρθρο ' + (index + 1), text: 'Διάταξη.', source_page: 1 })),
      }));
    }
    const prepared = prepareCollection(directory);
    assert.equal(prepared.length, 7);
    assert.equal(prepared.reduce((sum, item) => sum + item.graph.units.length, 0), 1074);
    const file = path.join(directory, 'law-4624-2019.json');
    const source = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...source, number: '1' }));
    assert.throws(() => prepareCollection(directory), /identity mismatch/);
    fs.writeFileSync(file, JSON.stringify({ ...source, sections: source.sections.slice(1) }));
    assert.throws(() => prepareCollection(directory), /Incomplete article sequence/);
    fs.writeFileSync(file, JSON.stringify(source));
    fs.appendFileSync(path.join(directory, 'law-4624-2019.pdf'), 'changed');
    assert.throws(() => prepareCollection(directory), /checksum mismatch/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
