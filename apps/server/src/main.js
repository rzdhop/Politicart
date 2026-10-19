// Entry point: `npm start -w @kart-republique/server` (it loads the repo-root
// .env when there is one; variables already set in the shell win).
//
//   PORT                    port to listen on (default 8080; container hosts set it)
//   HOST                    interface to bind (default 0.0.0.0, so the LAN can join)
//   KR_STATIC               the built game to serve (default ../../game/dist)
//   KR_ADMIN_USER           the admin account's name (default rida)
//   KR_ADMIN_PASSWORD_HASH  its scrypt hash (`npm run -s admin-hash -w @kart-republique/server`);
//                           unset or malformed, admin is disabled
//   KR_TRUST_PROXY          1 only behind Fly's proxy: client IP from Fly-Client-IP,
//                           scheme from X-Forwarded-Proto
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

import { isPasswordHash } from './auth.js';
import { runRace } from './race.js';
import { startServer } from './server.js';

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
const staticDir = process.env.KR_STATIC || fileURLToPath(new URL('../../game/dist', import.meta.url));
const admin = {
  user: process.env.KR_ADMIN_USER || 'rida',
  passwordHash: process.env.KR_ADMIN_PASSWORD_HASH || '',
  trustProxy: process.env.KR_TRUST_PROXY === '1',
};

const srv = await startServer({ port, host, staticDir, runRace, admin });

const lan = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
console.log(`Kart République -- serveur de course en équipe sur le port ${srv.port}`);
console.log(`  ici :        http://127.0.0.1:${srv.port}/`);
for (const ip of lan) console.log(`  réseau local : http://${ip}:${srv.port}/`);
// Never print the hash itself: say only whether admin is on.
if (!admin.passwordHash) console.log('  administration : désactivée (KR_ADMIN_PASSWORD_HASH absent)');
else if (!isPasswordHash(admin.passwordHash)) console.log('  administration : désactivée (KR_ADMIN_PASSWORD_HASH mal formé, voir .env.example)');
else console.log('  administration : activée');

const stop = () => { srv.close().then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
