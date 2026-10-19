// Print the KR_ADMIN_PASSWORD_HASH for a password read from stdin, and
// nothing else on stdout, so the output can go straight into a secret.
//
//   npm run -s admin-hash -w @kart-republique/server              asks twice, echo off
//   printf '%s' "$PW" | npm run -s admin-hash -w @kart-republique/server
//
// `-s` keeps npm's own banner off stdout. The password never leaves this
// process: it is not an argument (shell history, process lists) and is
// never printed.
import { hashPassword } from '../src/auth.js';

const MIN = 12, MAX = 1024;

/** Read one line from the terminal without echoing it. */
function askHidden(prompt) {
  return new Promise((ok, ko) => {
    const { stdin, stderr } = process;
    stderr.write(prompt);
    stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume();
    let pw = '';
    const finish = (fn, v) => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stderr.write('\n'); fn(v); };
    function onData(s) {
      for (const ch of s) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish(ok, pw);
        if (ch === '\u0003') return finish(ko, new Error('Interrompu.'));
        if (ch === '\u007f' || ch === '\b') { pw = [...pw].slice(0, -1).join(''); continue; }
        if (ch >= ' ') pw += ch;
      }
    }
    stdin.on('data', onData);
  });
}

/** Read everything piped in, dropping a BOM and one trailing newline. */
async function readPiped() {
  let s = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) { s += chunk; if (s.length > MAX * 4) break; }
  return s.replace(/^﻿/, '').replace(/\r?\n$/, '');
}

async function main() {
  let pw;
  if (process.stdin.isTTY) {
    pw = await askHidden('Mot de passe admin : ');
    if (await askHidden('Confirmez : ') !== pw) throw new Error('Les deux saisies diffèrent.');
  } else {
    pw = await readPiped();
  }
  const len = [...pw].length;
  if (len < MIN) throw new Error(`Mot de passe trop court : ${MIN} caractères au minimum.`);
  if (len > MAX) throw new Error(`Mot de passe trop long : ${MAX} caractères au maximum.`);
  process.stdout.write(`${await hashPassword(pw)}\n`);
}

main().catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1; });
