// Checks GitHub for a newer release (twice a day). Only the public release list is read –
// no data about the installation is sent. Can be switched off (setting or UPDATE_CHECK=false).
import { state } from './store.mjs';
import { log } from './util.mjs';

const REPO = 'BlugDeg/Spokarr';
const EVERY = 12 * 3600e3;
let latest = null; // { version, url, checkedAt }
let timer = null;
let VERSION = '0.0.0';

const parse = (v) => String(v || '').replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
/** true when a is newer than b (major.minor.patch) */
export function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

export const updateCheckEnabled = () => state.settings.general.updateCheck !== false;

async function check() {
  if (!updateCheckEnabled()) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Spokarr/${VERSION}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
    const d = await r.json();
    latest = { version: String(d.tag_name || '').replace(/^v/, ''), url: d.html_url, checkedAt: new Date().toISOString() };
    if (newer(latest.version, VERSION)) log(`Update available: ${latest.version} (running ${VERSION})`);
  } catch (e) {
    log('Update check failed:', e.message);
  }
}

export function startUpdateCheck(version) {
  VERSION = version;
  if (timer) return;
  setTimeout(check, 20e3);
  timer = setInterval(check, EVERY);
}

/** The newer release, if there is one – otherwise null. */
export function availableUpdate() {
  if (!updateCheckEnabled() || !latest || !newer(latest.version, VERSION)) return null;
  return { version: latest.version, url: latest.url };
}
export const latestRelease = () => (updateCheckEnabled() ? latest : null);
/** Check now, e.g. right after the setting was switched on. */
export const checkUpdateNow = () => check();
