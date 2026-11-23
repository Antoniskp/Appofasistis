'use strict';

const config = require('./config');
const logger = require('./logger');
const Connection = require('./connection');
const { startHeartbeat } = require('./heartbeat');
const { createTaskRunner } = require('./taskRunner');
const { startInternalApiServer } = require('./internalApi');
const { createLawApp } = require('./localLaw/app');
const { ensureGraph } = require('./localLaw/runtime');
const { checkLocalStartup } = require('./localLaw/startup');
const { createLawLibraryRelay } = require('./localLaw/relay');

async function main() {
  const startup = await checkLocalStartup(config.internalApiPort);
  if (startup.alreadyRunning) {
    console.log('\nAppofasistis is already running.');
    console.log('Open ' + startup.url);
    console.log('No second copy was started.\n');
    return;
  }
  config.validate();
  const graph = await ensureGraph();
  let connection;
  let stopHeartbeat = () => {};
  let stopInternalApi;
  let stopping = false;
  const taskRunner = createTaskRunner({ send: message => connection && connection.send(message) });
  const lawApp = createLawApp({ storeOptions: { ...graph.settings, dataDirectory: config.legalDataDirectory },
    getWorkerStatus: () => ({ enabled: config.workerEnabled, connected: Boolean(connection?.connected) }) });

  async function shutdown(signal, code = 0) {
    if (stopping) return;
    stopping = true;
    logger.info('Stopping Appofasistis:', signal);
    stopHeartbeat();
    if (stopInternalApi) stopInternalApi();
    if (connection) connection.close();
    await lawApp.close();
    await graph.stop();
    process.exit(code);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  try {
    await lawApp.store.ready;
    stopInternalApi = startInternalApiServer({ port: config.internalApiPort, workerToken: config.workerToken, logger, lawApp });
    stopInternalApi.server.once('error', () => shutdown('Local server failed', 1));
    await new Promise((resolve, reject) => { stopInternalApi.server.once('listening', resolve); stopInternalApi.server.once('error', reject); });
    if (config.workerEnabled) {
      const lawLibrary = config.lawLibraryShare ? createLawLibraryRelay({ port: config.internalApiPort, logger }) : null;
      connection = new Connection(message => taskRunner.handleMessage(message), lawLibrary);
      connection.connect();
      stopHeartbeat = startHeartbeat(connection, () => taskRunner.getActiveTasks());
    }
    logger.info('Greek laws: http://localhost:' + config.internalApiPort + '/');
    logger.info('Graph database: Neo4j on this PC');
    logger.info('Local data directory:', config.legalDataDirectory);
    if (!config.workerEnabled) logger.info('Local mode. Appofa connection is disabled.');
  } catch (error) {
    logger.error(error.message);
    await shutdown('Startup failed', 1);
  }
}

main().catch(error => { logger.error(error.message); process.exitCode = 1; });
