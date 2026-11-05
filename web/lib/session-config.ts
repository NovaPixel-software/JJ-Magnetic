/** Shared by the server (which enforces them) and the browser (which warns and signs out). */

/** Signed out after this long with no activity. */
export const IDLE_MINUTES = 30;
/** The warning appears this long before that. */
export const WARN_SECONDS = 60;
/** While the person is active, the server is told at most this often, which is what keeps the session alive. */
export const PING_EVERY_MS = 60_000;
