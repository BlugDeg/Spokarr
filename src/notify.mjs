// Notifications: Discord webhook and ntfy
import { state } from './store.mjs';
import { log, trimUrl, UserError } from './util.mjs';

export const EVENTS = ['pending', 'approved', 'available', 'declined', 'failed', 'stalled'];

// Message texts per notification language; {title} is the book, {user} the person who requested it
const TEXT = {
  en: {
    pending: ['New request', '{user} requested “{title}”. It is waiting for approval.'],
    approved: ['Request approved', '“{title}” for {user} is being downloaded.'],
    available: ['Audiobook available', '“{title}” is ready to listen to in Audiobookshelf.'],
    declined: ['Request declined', 'The request for “{title}” by {user} was declined.'],
    failed: ['Request failed', 'No download for “{title}”: {reason}'],
    stalled: ['Download stalled', '“{title}” has not made progress for {hours} h.'],
    test: ['Spokarr test', 'Notifications are working.'],
    requestedBy: 'Requested by', narrator: 'Narrator', open: 'Open in Spokarr',
    reasons: { not_found: 'no matching release found', download_failed: 'download failed', import_failed: 'import failed' },
  },
  de: {
    pending: ['Neue Anfrage', '{user} hat «{title}» angefragt. Die Anfrage wartet auf Freigabe.'],
    approved: ['Anfrage freigegeben', '«{title}» für {user} wird geladen.'],
    available: ['Hörbuch verfügbar', '«{title}» ist bereit zum Hören in Audiobookshelf.'],
    declined: ['Anfrage abgelehnt', 'Die Anfrage von {user} für «{title}» wurde abgelehnt.'],
    failed: ['Anfrage fehlgeschlagen', 'Kein Download für «{title}»: {reason}'],
    stalled: ['Download hängt', '«{title}» macht seit {hours} Std. keinen Fortschritt.'],
    test: ['Spokarr-Test', 'Benachrichtigungen funktionieren.'],
    requestedBy: 'Angefragt von', narrator: 'Sprecher', open: 'In Spokarr öffnen',
    reasons: { not_found: 'kein passendes Release gefunden', download_failed: 'Download fehlgeschlagen', import_failed: 'Einsortieren fehlgeschlagen' },
  },
};
const COLORS = { pending: 0xf59e0b, approved: 0x6366f1, available: 0x22c55e, declined: 0x64748b, failed: 0xef4444, stalled: 0xf97316, test: 0x8b5cf6 };
const NTFY_TAGS = { pending: 'hourglass', approved: 'arrow_down', available: 'headphones', declined: 'no_entry', failed: 'warning', stalled: 'snail', test: 'white_check_mark' };

function compose(event, info) {
  const lang = TEXT[state.settings.general.notifyLanguage] ? state.settings.general.notifyLanguage : 'en';
  const t = TEXT[lang];
  if (info.reasonKey) info = { ...info, reason: (t.reasons[info.reasonKey] || info.reasonKey) + (info.detail ? ` (${info.detail})` : '') };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => info[k] ?? '');
  const [title, body] = t[event];
  const appUrl = trimUrl(state.settings.general.appUrl);
  return {
    t, title: fill(title), body: fill(body),
    url: appUrl && info.asin ? `${appUrl}/#/book/${info.asin}` : appUrl || undefined,
    icon: appUrl ? `${appUrl}/icon-512.png` : undefined,
  };
}

async function post(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`);
}

async function sendDiscord(conf, event, info) {
  const m = compose(event, info);
  const fields = [];
  if (info.user) fields.push({ name: m.t.requestedBy, value: info.user, inline: true });
  if (info.narrator) fields.push({ name: m.t.narrator, value: info.narrator, inline: true });
  await post(conf.webhook, {
    username: 'Spokarr',
    ...(m.icon ? { avatar_url: m.icon } : {}),
    embeds: [{
      title: m.title, description: m.body, color: COLORS[event],
      ...(m.url ? { url: m.url } : {}),
      ...(info.cover ? { thumbnail: { url: info.cover } } : {}),
      fields, footer: { text: 'Spokarr' }, timestamp: new Date().toISOString(),
    }],
  });
}

async function sendNtfy(conf, event, info) {
  const m = compose(event, info);
  const server = trimUrl(conf.server || 'https://ntfy.sh');
  await post(server, {
    topic: conf.topic, title: m.title, message: m.body, tags: [NTFY_TAGS[event]],
    priority: event === 'failed' || event === 'stalled' ? 4 : 3,
    ...(m.url ? { click: m.url } : {}),
    ...(m.icon ? { icon: m.icon } : {}),
  }, conf.token ? { Authorization: `Bearer ${conf.token}` } : {});
}

const AGENTS = { discord: sendDiscord, ntfy: sendNtfy };
const ready = (name, c) => !!c && (name === 'discord' ? !!c.webhook : !!c.topic);

/** Sends an event to every enabled agent that subscribed to it. Never throws. */
export async function notify(event, req, extra = {}) {
  const conf = state.settings.notifications || {};
  const u = state.users.find((x) => x.id === req?.requestedBy);
  const info = {
    title: req?.book?.title || '', asin: req?.asin, cover: req?.book?.coverSmall || req?.book?.cover,
    narrator: (req?.book?.narrators || []).join(', '), user: u?.username || '', ...extra,
  };
  await Promise.all(Object.entries(AGENTS).map(async ([name, send]) => {
    const c = conf[name];
    if (!c?.enabled || !ready(name, c) || !(c.events || []).includes(event)) return;
    try { await send(c, event, info); } catch (e) { log(`Notification via ${name} failed:`, e.message); }
  }));
}

/** Test button in the settings: sends one message with the given (unsaved) values. */
export async function testNotify(name, c) {
  if (!AGENTS[name]) throw new UserError('not_found', {}, 404);
  if (!ready(name, c)) throw new UserError(name === 'discord' ? 'notify_no_webhook' : 'notify_no_topic');
  try {
    await AGENTS[name](c, 'test', { title: 'Spokarr' });
  } catch (e) {
    throw new UserError('notify_failed', { message: e.message });
  }
  return { ok: true };
}
