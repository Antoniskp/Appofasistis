'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const neo4j = require('neo4j-driver');

const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, '.runtime');
const credentialFile = path.join(runtime, 'credentials.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function graphSettings() {
  const saved = fs.existsSync(credentialFile) ? JSON.parse(fs.readFileSync(credentialFile, 'utf8')) : {};
  return { uri: process.env.NEO4J_URI || 'bolt://127.0.0.1:7687', username: process.env.NEO4J_USER || saved.username || 'neo4j',
    password: process.env.NEO4J_PASSWORD || saved.password, database: process.env.NEO4J_DATABASE || 'neo4j',
    dataDirectory: path.resolve(process.env.LEGAL_DATA_DIR || path.join(root, 'data')) };
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

async function verify(settings) {
  const driver = neo4j.driver(settings.uri, neo4j.auth.basic(settings.username, settings.password), { connectionTimeout: 2000 });
  try { await driver.verifyConnectivity(); }
  finally { await driver.close(); }
}

async function ensureGraph() {
  let owned;
  const layoutFile = path.join(runtime, 'layout.json');
  const settings = graphSettings();
  const endpoint = new URL(settings.uri);
  if (!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)) throw new Error('Neo4j must be hosted on this PC.');
  const port = Number(endpoint.port || 7687);
  if (!await portOpen(port)) {
    if (!fs.existsSync(layoutFile) || port !== 7687) throw new Error('Neo4j is not running. Run npm run db:setup, then npm run local.');
    const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8').replace(/^\uFEFF/, ''));
    const neo4jHome = path.join(runtime, layout.neo4jHome);
    const javaHome = path.join(runtime, layout.javaHome);
    fs.mkdirSync(settings.dataDirectory, { recursive: true });
    const log = fs.openSync(path.join(settings.dataDirectory, 'neo4j-launcher.log'), 'a');
    console.log('Starting local Neo4j Community...');
    owned = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(neo4jHome,'bin','neo4j.ps1'),'console'],
      { cwd: neo4jHome, env: { ...process.env, NEO4J_HOME: neo4jHome, JAVA_HOME: javaHome }, stdio: ['ignore',log,log], windowsHide: true });
    fs.closeSync(log);
    let error;
    owned.once('error', value => { error = value; });
    for (let attempt = 0; attempt < 120 && !await portOpen(port); attempt++) {
      if (error || owned.exitCode !== null) throw new Error('Neo4j failed to start. Check data/neo4j-launcher.log. ' + (error?.message || ''));
      await delay(500);
    }
    if (!await portOpen(port)) throw new Error('Neo4j startup timed out. Check data/neo4j-launcher.log.');
  }
  if (!settings.password) {
    if (!owned) throw new Error('An existing Neo4j instance is running. Configure NEO4J_USER and NEO4J_PASSWORD to use it.');
    settings.password = crypto.randomBytes(32).toString('base64url');
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(credentialFile, JSON.stringify({ username: settings.username, password: settings.password }), { mode: 0o600, flag: 'wx' });
  }
  try { await verify(settings); }
  catch (originalError) {
    if (!owned) throw originalError;
    // Provision a fresh local instance without exposing its generated password in arguments or logs.
    const initial = neo4j.driver(settings.uri, neo4j.auth.basic(settings.username, 'neo4j'), { connectionTimeout: 2000 });
    const session = initial.session({ database: 'system' });
    try { await session.run('ALTER CURRENT USER SET PASSWORD FROM $old TO $next', { old: 'neo4j', next: settings.password }); }
    catch { throw originalError; }
    finally { await session.close(); await initial.close(); }
    await verify(settings);
  }
  return { settings, owned, async stop() {
    if (owned && owned.exitCode === null) {
      await new Promise(resolve => execFile('taskkill.exe', ['/PID',String(owned.pid),'/T','/F'], { windowsHide: true }, () => resolve()));
    }
  } };
}

module.exports = { graphSettings, ensureGraph };
