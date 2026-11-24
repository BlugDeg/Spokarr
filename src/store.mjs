// Persistent state: settings, users, sessions and requests as JSON files in DATA_DIR
import fs from 'node:fs/promises';
import path from 'node:path';
import { log, randomId, trimUrl } from './util.mjs';

const env = process.env;
export const DATA_DIR = env.DATA_DIR || '/data';
// Container path of the audiobook library – fixed by the volume mount, therefore not editable in the UI
export const LIBRARY_DIR = env.LIBRARY_DIR || '/audiobooks';

const files = {};
async function readJson(name, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
}
function writer(name, get) {
  let chain = Promise.resolve();
  return () => {
    chain = chain.then(async () => {
      const f = path.join(DATA_DIR, name);
      await fs.writeFile(f + '.tmp', JSON.stringify(get(), null, 2), { mode: 0o600 });
      await fs.rename(f + '.tmp', f);
    }).catch((e) => log(`Saving ${name} failed:`, e.message));
    return chain;
  };
}

export const DEFAULT_PERMISSIONS = { request: true, autoApprove: false, manageRequests: false };

/** Settings seeded from environment variables on first start (keeps older .env setups working). */
function settingsFromEnv() {
  const rows = String(env.DISCOVER_ROWS || '').split(';').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [title, keywords = '', narrator = ''] = r.split('|').map((x) => x.trim());
    return { title, keywords: keywords || title, narrator };
  });
  return {
    general: {
      region: (env.AUDIBLE_REGION || 'us').toLowerCase(),
      contentLanguage: (env.CONTENT_LANGUAGE || '').toLowerCase(),
      discoverRows: rows,
      defaultPermissions: { ...DEFAULT_PERMISSIONS },
      tagRequester: true,
    },
    abs: {
      url: trimUrl(env.ABS_URL),
      publicUrl: trimUrl(env.ABS_PUBLIC_URL || env.ABS_URL),
      apiKey: env.ABS_API_KEY || '',
      libraryId: env.ABS_LIBRARY_ID || '',
      libraryMount: env.ABS_LIBRARY_MOUNT || LIBRARY_DIR,
    },
    sab: {
      enabled: true,
      url: trimUrl(env.SAB_URL),
      apiKey: env.SAB_API_KEY || '',
      category: env.SAB_CATEGORY || 'spokarr',
      pathFrom: '', pathTo: '',
    },
    qbit: {
      enabled: !!env.QBIT_URL,
      url: trimUrl(env.QBIT_URL),
      username: env.QBIT_USERNAME || '',
      password: env.QBIT_PASSWORD || '',
      category: env.QBIT_CATEGORY || 'spokarr',
      pathFrom: '', pathTo: '',
    },
    prowlarr: {
      enabled: !!env.PROWLARR_URL,
      url: trimUrl(env.PROWLARR_URL),
      apiKey: env.PROWLARR_API_KEY || '',
      categories: env.PROWLARR_CATEGORIES || '3030',
    },
    indexers: env.NEWZNAB_URL ? [{
      id: randomId(4), name: 'Indexer', url: trimUrl(env.NEWZNAB_URL), apiKey: env.NEWZNAB_API_KEY || '',
      categories: env.NEWZNAB_CATEGORIES || '3030', enabled: true,
    }] : [],
  };
}

export const state = { settings: null, users: [], sessions: {}, requests: [] };
export const save = {
  settings: writer('settings.json', () => state.settings),
  users: writer('users.json', () => state.users),
  sessions: writer('sessions.json', () => state.sessions),
  requests: writer('requests.json', () => state.requests),
};

export async function loadState() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const seed = settingsFromEnv();
  const stored = await readJson('settings.json', null);
  state.settings = stored
    ? {
      ...seed, ...stored,
      general: { ...seed.general, ...stored.general },
      abs: { ...seed.abs, ...stored.abs },
      sab: { ...seed.sab, ...stored.sab },
      qbit: { ...seed.qbit, ...stored.qbit },
      prowlarr: { ...seed.prowlarr, ...stored.prowlarr },
    }
    : seed;
  if (!stored) { await save.settings(); log('Created settings.json from environment variables'); }
  state.users = await readJson('users.json', []);
  state.sessions = await readJson('sessions.json', {});
  state.requests = await readJson('requests.json', []);
  // Requests from versions before user accounts belong to the owner
  const owner = state.users.find((u) => u.owner);
  let migrated = false;
  for (const r of state.requests) if (!r.requestedBy && owner) { r.requestedBy = owner.id; migrated = true; }
  if (migrated) await save.requests();
  return files;
}
