// Entry point: `npm start -w @kart-republique/server`.
//
//   PORT       port to listen on (default 8080; container hosts set it)
//   HOST       interface to bind (default 0.0.0.0, so the LAN can join)
//   KR_STATIC  the built game to serve (default ../../game/dist)
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runRace } from './race.js';
import { startServer } from './server.js';

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
const staticDir = process.env.KR_STATIC || fileURLToPath(new URL('../../game/dist', import.meta.url));

const srv = await startServer({ port, host, staticDir, runRace });

const lan = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
console.log(`Kart République -- serveur de course en équipe sur le port ${srv.port}`);
console.log(`  ici :        http://127.0.0.1:${srv.port}/`);
for (const ip of lan) console.log(`  réseau local : http://${ip}:${srv.port}/`);

const stop = () => { srv.close().then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
