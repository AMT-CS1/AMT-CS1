/**
 * Per-student browser storage (P5 / R2).
 *
 * Progress mirrors (submitted sets, solved problems, checkpoint unlocks) are
 * cached client-side so the UI can render ahead of a server refresh. On shared
 * lab machines those caches used to be browser-global, so student B inherited
 * student A's completed/submitted state — and A's unlocked checkpoint. Every
 * per-student key is therefore namespaced `amt:{userId}:{name}` (userId = JWT
 * `sub`, the stable user UUID — see plan §7-Q5), and this module is the only
 * place that knows the prefix.
 *
 * Device preferences (`amt_split_ratio`, `amt_vsplit_ratio`) deliberately stay
 * global: they describe the machine, not the student.
 */

const PREFIX = 'amt:';

// Pre-P5 browser-global keys. Removed on sight so existing browsers self-heal
// on the first load after deploy (localStorage) / first sign-in (sessionStorage).
const LEGACY_EXACT = ['amt_submitted_targets', 'amt_solved_homeworks'];
const LEGACY_PREFIXES = ['amt_solved_problems_', 'amt_lab_pw_'];

/** Namespaced key for one student's cached value. */
export const studentKey = (userId: string, name: string) => `${PREFIX}${userId}:${name}`;

function safeStorages(): Storage[] {
  if (typeof window === 'undefined') return [];
  const out: Storage[] = [];
  try { out.push(window.localStorage); } catch { /* storage blocked */ }
  try { out.push(window.sessionStorage); } catch { /* storage blocked */ }
  return out;
}

export function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch { /* quota / privacy mode — cache only, safe to drop */ }
}

function isLegacyKey(key: string): boolean {
  return LEGACY_EXACT.includes(key) || LEGACY_PREFIXES.some(p => key.startsWith(p));
}

function sweep(storage: Storage, shouldRemove: (key: string) => boolean): void {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && shouldRemove(key)) doomed.push(key);
  }
  doomed.forEach(k => { try { storage.removeItem(k); } catch { /* ignore */ } });
}

/**
 * Mount-time sweep: drop any `amt:*` entry belonging to a *different* user
 * (covers a cookie swap without an explicit sign-out) plus all legacy
 * un-namespaced keys.
 */
export function clearForeignStudentKeys(userId: string): void {
  const mine = `${PREFIX}${userId}:`;
  for (const storage of safeStorages()) {
    sweep(storage, key =>
      (key.startsWith(PREFIX) && !key.startsWith(mine)) || isLegacyKey(key)
    );
  }
}

/**
 * Sign-out wipe: remove every per-student key (any user) from both storages.
 * Called *before* the logout POST — storage removal is synchronous and cannot
 * fail, the network call can; worst case is a logged-in user with a cleared
 * cache that re-hydrates from the server.
 */
export function clearAllStudentKeys(): void {
  for (const storage of safeStorages()) {
    sweep(storage, key => key.startsWith(PREFIX) || isLegacyKey(key));
  }
}
