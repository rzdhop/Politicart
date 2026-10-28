// Entry point: `npm start -w @politikart/server`.
//
//   PORT       port to listen on (default 8080; container hosts set it)
//   HOST       interface to bind (default 0.0.0.0, so the LAN can join)
//   POLITIKART_STATIC  the built game to serve (default ../../game/dist)
//   DATABASE_URL  keep accounts in this Postgres database (store.js)
//   POLITIKART_DATA    otherwise, keep them in this JSON file (default ../data/kr-accounts.json);
//              ':memory:' keeps them in memory only (the end-to-end suite).
//              The admin's cast goes next to it, in kr-docs/roster.json;
//              startServer loads and applies it before listening.
//   POLITIKART_ADMIN_USER           the administrator's account name (default rida),
//                           reserved: nobody else can sign up under it
//   POLITIKART_ADMIN_PASSWORD_HASH  its password hash (admin.js); unset or malformed,
//                           nobody is admin
//
// `npm start` also reads the repository's .env and .env.local files when
// they exist (.env.example lists the keys); .env.local wins over .env, and
// variables already set win over both. `neon deploy` writes the Neon
// database's DATABASE_URL into .env.local.
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

import { adminConfig, ensureAdmin } from './admin.js';
import { runRace } from './race.js';
import { startServer } from './server.js';
import { openStore } from './store.js';

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
const staticDir = process.env.POLITIKART_STATIC || fileURLToPath(new URL('../../game/dist', import.meta.url));

const store = await openStore({
  databaseUrl: process.env.DATABASE_URL || '',
  file: process.env.POLITIKART_DATA === ':memory:' ? null : process.env.POLITIKART_DATA || fileURLToPath(new URL('../data/kr-accounts.json', import.meta.url)),
});
// Never log the hash itself: only whether admin is on, and why not.
const admin = adminConfig({ user: process.env.POLITIKART_ADMIN_USER, hash: process.env.POLITIKART_ADMIN_PASSWORD_HASH });
console.log(admin.enabled ? `admin: enabled for the account "${admin.user}"` : `admin: disabled (${admin.reason}); the name "${admin.user}" stays reserved`);
await ensureAdmin(store, admin);
const srv = await startServer({ port, host, staticDir, runRace, store, admin });

const lan = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
console.log(`Politikart -- serveur de course en équipe sur le port ${srv.port}`);
console.log(`  ici :        http://127.0.0.1:${srv.port}/`);
for (const ip of lan) console.log(`  réseau local : http://${ip}:${srv.port}/`);
console.log(`  comptes :     ${store.kind === 'postgres' ? 'base Postgres (DATABASE_URL)' : store.kind === 'memory' ? 'en mémoire seulement' : 'fichier ' + (process.env.POLITIKART_DATA || 'apps/server/data/kr-accounts.json')}`);

const stop = () => { srv.close().then(() => store.close()).then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
