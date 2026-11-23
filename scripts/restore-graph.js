'use strict';

const { ensureGraph } = require('../src/localLaw/runtime');
const { LawStore } = require('../src/localLaw/store');

(async () => {
  if (!process.argv[2]) throw new Error('Usage: npm run db:restore -- C:/path/to/greek-laws-backup.json');
  const runtime = await ensureGraph();
  const store = new LawStore(runtime.settings);
  try { console.log(JSON.stringify(await store.restore(process.argv[2]))); }
  finally { await store.close(); await runtime.stop(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
