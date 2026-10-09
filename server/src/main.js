/* Beacon server entry point. */
'use strict';

import { loadConfig } from './config.js';
import { jellyfinClient } from './jellyfin.js';
import { openStore } from './store.js';
import { createApp } from './app.js';

const config = loadConfig();
const jellyfin = jellyfinClient({ url: config.jellyfinUrl, apiKey: config.jellyfinApiKey });
const store = openStore(config.dataDir);
const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  error: (...a) => console.error(new Date().toISOString(), ...a)
};

const server = createApp({ config, jellyfin, store, log });
server.listen(config.port, config.host, () => log.info(`Beacon listening on ${config.host}:${config.port}, Jellyfin at ${config.jellyfinUrl}`));

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
