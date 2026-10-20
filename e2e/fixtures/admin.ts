/**
 * The admin account the e2e suite logs in with -- test-only.
 *
 * The game server under test (playwright.config.ts, webServer[1]) gets this
 * user and the scrypt hash of this password, computed when the config loads,
 * with its accounts and roster in memory (KR_DATA=:memory:). Nothing here is,
 * or may become, a real credential: the real admin's hash lives only in the
 * host's secrets and an untracked .env.
 */
export const ADMIN_USER = 'rida';
export const ADMIN_PASSWORD = 'e2e-test-only-not-a-real-password';
