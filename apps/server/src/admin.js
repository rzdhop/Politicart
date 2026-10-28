// The one administrator account, configured from the environment.
//
//   KR_ADMIN_USER           the admin's account name (default "rida")
//   KR_ADMIN_PASSWORD_HASH  its password, hashed as accounts.js hashes every
//                           password: scrypt$<32 hex salt>$<128 hex key>.
//                           `npm run -s admin-hash -w @politikar/server`
//                           prints one.
//
// The environment is the truth: at boot ensureAdmin() creates the account, or
// resets its stored hash to this one (closing its sessions). The name is
// reserved whether or not a hash is set, so nobody can sign up under it; with
// no valid hash, nobody is admin.
//
// A user is admin when admin is enabled, their name has the admin's nameKey,
// and their stored hash is the configured one. The last condition is defence
// in depth: an account that merely shares the name key (a hand-edited data
// file) or that ensureAdmin has not reset yet is never admin.
import { badName } from './accounts.js';
import { nameKey } from './store.js';

export const DEFAULT_ADMIN_USER = 'rida';

/** Exactly what hashPassword() produces: a 16-byte salt and a 64-byte key, lowercase hex. */
const HASH_FORMAT = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/;

/** Whether `hash` has the format of a stored password hash. */
export const validAdminHash = hash => typeof hash === 'string' && HASH_FORMAT.test(hash);

/**
 * The admin settings from raw values (environment strings, or test values):
 * `{ user, hash, enabled, reason }`, frozen. `hash` is null unless enabled;
 * `reason` says why admin is disabled (never quotes the hash). Idempotent, so
 * every layer can normalise what it is given.
 */
export function adminConfig({ user, hash } = {}) {
  const name = (typeof user === 'string' ? user.trim() : '') || DEFAULT_ADMIN_USER;
  const raw = typeof hash === 'string' ? hash.trim() : '';
  let reason = null;
  if (badName(name)) reason = 'KR_ADMIN_USER is not a valid account name';
  else if (!raw) reason = 'KR_ADMIN_PASSWORD_HASH is not set';
  else if (!validAdminHash(raw)) reason = 'KR_ADMIN_PASSWORD_HASH is malformed (expected scrypt$<32 hex>$<128 hex>)';
  return Object.freeze({ user: name, hash: reason ? null : raw, enabled: !reason, reason });
}

/**
 * The key a name is reserved by: nameKey, then with accents dropped, so
 * "RIDA", "ｒｉｄａ" and "Rídà" all collide with "rida". Only for refusing
 * sign-ups; who is admin is decided by nameKey itself.
 */
const reservedKey = name => nameKey(name).normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC');

/** Whether `name` may not be used by a new account: it looks like the admin's. */
export function isReservedName(admin, name) {
  return reservedKey(name) === reservedKey(adminConfig(admin).user);
}

/** Whether `user` (a store record, with its hash) is the administrator. */
export function isAdminUser(admin, user) {
  const cfg = adminConfig(admin);
  return !!(cfg.enabled && user && typeof user.name === 'string'
    && nameKey(user.name) === nameKey(cfg.user) && user.hash === cfg.hash);
}

/**
 * Make the store match the configuration, before the server listens: create
 * the admin account, or reset its hash (and close its sessions) when it
 * differs. Does nothing when admin is disabled. Resolves to 'disabled',
 * 'created', 'reset' or 'kept'. `log` never receives the hash.
 */
export async function ensureAdmin(store, admin, log = console.log) {
  const cfg = adminConfig(admin);
  if (!cfg.enabled) return 'disabled';
  let user = await store.userByName(cfg.user);
  if (!user) {
    user = await store.createUser({ name: cfg.user, hash: cfg.hash });
    if (user) { log(`admin: created the account "${cfg.user}"`); return 'created'; }
    user = await store.userByName(cfg.user);              // created meanwhile by someone else
    if (!user) throw new Error('admin: cannot create the account "' + cfg.user + '"');
  }
  if (user.hash === cfg.hash) return 'kept';
  if (!(await store.setHash(user.id, cfg.hash))) throw new Error('admin: cannot reset the account "' + cfg.user + '"');
  log(`admin: the existing account "${user.name}" had another password; reset it to KR_ADMIN_PASSWORD_HASH and closed its sessions`);
  return 'reset';
}
