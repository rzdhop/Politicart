// Entry point: `npm start -w @kart-republique/server`.
//
//   PORT       port to listen on (default 8080; container hosts set it)
//   HOST       interface to bind (default 0.0.0.0, so the LAN can join)
//   KR_STATIC  the built game to serve (default ../../game/dist)
//   DATABASE_URL  keep accounts in this Postgres database (store.js)
//   KR_DATA    otherwise, keep them in this JSON file (default ../data/kr-accounts.json);
//              ':memory:' keeps them in memory only (the end-to-end suite)
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runRace } from './race.js';
import { startServer } from './server.js';
import { openStore } from './store.js';

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
const staticDir = process.env.KR_STATIC || fileURLToPath(new URL('../../game/dist', import.meta.url));

const store = await openStore({
  databaseUrl: process.env.DATABASE_URL || '',
  file: process.env.KR_DATA === ':memory:' ? null : process.env.KR_DATA || fileURLToPath(new URL('../data/kr-accounts.json', import.meta.url)),
});
const srv = await startServer({ port, host, staticDir, runRace, store });

const lan = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
console.log(`Kart République -- serveur de course en équipe sur le port ${srv.port}`);
console.log(`  ici :        http://127.0.0.1:${srv.port}/`);
for (const ip of lan) console.log(`  réseau local : http://${ip}:${srv.port}/`);
console.log(`  comptes :     ${store.kind === 'postgres' ? 'base Postgres (DATABASE_URL)' : store.kind === 'memory' ? 'en mémoire seulement' : 'fichier ' + (process.env.KR_DATA || 'apps/server/data/kr-accounts.json')}`);

const stop = () => { srv.close().then(() => store.close()).then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
