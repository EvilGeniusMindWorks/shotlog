// Transactional email through Resend. ONE sender for the whole server so
// the People page and /health can say truthfully whether email is on.
//
// Env: RESEND_API_KEY (off when unset), INVITE_FROM ("ShotLog <x@y>"),
// APP_URL (links in the mail). Every message ships HTML + a plain-text
// alternative; the HTML is table-based and inline-styled because mail
// clients ignore stylesheets.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM = process.env.INVITE_FROM ?? 'ShotLog <onboarding@resend.dev>';
export const APP_URL = (process.env.APP_URL ?? 'https://shotlog-app.vercel.app').replace(/\/$/, '');
/** 'testing' (default until go-live): the invite reads as an invitation to
 *  try the app and send feedback; 'production': the set-up-your-account
 *  wording. Matthew, S8: "less ordering them — more polite". */
export const INVITE_MODE: 'testing' | 'production' = process.env.INVITE_MODE === 'production' ? 'production' : 'testing';

/** True when the server can send mail at all (key present) */
export function emailEnabled(): boolean {
  return Boolean(RESEND_API_KEY);
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Send one message. Returns false (never throws) when email is off or
 *  Resend rejects it — callers fall back to a copyable link. */
export async function sendEmail(mail: Mail): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) console.error('email failed:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('email failed:', err);
    return false;
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One sentence per role bucket: what this person will actually do in the app */
export function roleBlurb(role: string): string {
  switch (role) {
    case 'blaster':
    case 'supervisor':
      return 'You will record each work day — drilling, shots, seismo readings — and file the daily report from your tablet or phone, even with no signal.';
    case 'driller':
      return 'You will log holes as you drill them, file the rig checklist, and enter your hours — right from the rig, even with no signal.';
    case 'mechanic':
      return 'You will see what is down, work the repair queue, and log services on each machine.';
    case 'office':
      return 'You will review and approve filed days and time cards, and keep the company record book.';
    case 'admin':
      return 'You will set up people, roles, and company settings, and see everything the crews file.';
    default:
      return 'You will use it for the day-to-day paperwork your crew already does — without the paper.';
  }
}

function layout(opts: { company: string; title: string; intro: string; steps: string[]; cta: { label: string; url: string }; footer: string }): string {
  const steps = opts.steps
    .map(
      (s, i) => `<tr><td style="padding:6px 10px 6px 0;vertical-align:top;color:#EE7A2E;font-weight:700;font-family:Arial,sans-serif">${i + 1}.</td><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:15px;color:#172338;line-height:1.45">${s}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F3F5F8">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F5F8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1C3859;padding:14px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td style="vertical-align:middle"><img src="${APP_URL}/shotlog-lockup-dark.png" width="147" height="36" alt="ShotLog" style="display:block;border:0;height:36px;width:147px"></td>
<td align="right" style="vertical-align:middle;font-family:Arial,sans-serif;color:#ffffff;font-size:12px;opacity:.85">${esc(opts.company)}</td>
</tr></table></td></tr>
<tr><td style="padding:26px 24px 8px;font-family:Arial,sans-serif">
<h1 style="margin:0 0 10px;font-size:22px;color:#172338">${esc(opts.title)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#4E5D75">${opts.intro}</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 18px">${steps}</table>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#EE7A2E;border-radius:8px"><a href="${opts.cta.url}" style="display:inline-block;padding:12px 22px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${esc(opts.cta.label)}</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#7A8698">If the button does not work, copy this link into your browser:<br><a href="${opts.cta.url}" style="color:#2B5FA8;word-break:break-all">${opts.cta.url}</a></p>
</td></tr>
<tr><td style="padding:14px 24px 22px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#7A8698;border-top:1px solid #E9EDF3">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export function inviteMail(opts: {
  to: string;
  name: string;
  company: string;
  role: string;
  invitedBy: string;
  link: string;
  ttlDays: number;
}): Mail {
  const first = opts.name.split(' ')[0] || opts.name;
  if (INVITE_MODE === 'testing') return testingInviteMail(opts, first);
  const blurb = roleBlurb(opts.role);
  const steps = [
    'Tap the button below and choose a password.',
    'Pick a 6-digit PIN — it unlocks ShotLog on your device when there is no signal.',
    'Install ShotLog on your tablet or phone when it offers to, so it opens like any other app.',
  ];
  const text =
    `Hi ${first},\n\n${opts.invitedBy} set you up on ShotLog for ${opts.company}. ${blurb}\n\n` +
    steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
    `\n\nSet up your account: ${opts.link}\n\nThe link works once and expires in ${opts.ttlDays} days. ` +
    `If you were not expecting this, you can ignore it.`;
  return {
    to: opts.to,
    subject: `${opts.company} — set up your ShotLog account`,
    text,
    html: layout({
      company: opts.company,
      title: `Welcome to ShotLog, ${esc(first)}`,
      intro: `<b>${esc(opts.invitedBy)}</b> set you up on ShotLog for ${esc(opts.company)}. ${esc(blurb)}`,
      steps: steps.map(esc),
      cta: { label: 'Set up my account', url: opts.link },
      footer: `The link works once and expires in ${opts.ttlDays} days. If you were not expecting this, you can ignore it.`,
    }),
  };
}

/** Testing-period invite (S8, Matthew's wording): an invitation, feedback
 *  through the app only, no assignment sentence, honest about rough edges. */
function testingInviteMail(
  opts: { to: string; name: string; company: string; invitedBy: string; link: string; ttlDays: number },
  first: string,
): Mail {
  const steps = [
    'Tap the button below and choose a password.',
    'Pick a 6-digit PIN so the app opens on your device even without signal.',
    'When it offers, add ShotLog to your home screen so it opens like any other app.',
  ];
  const intro = `${opts.invitedBy} has invited you to try ShotLog, a new app ${opts.company} is testing for the paperwork we do every day — blast logs, drill logs, rig checklists and daily reports. It is built to work in the field, with or without signal.`;
  const ask =
    'Feel free to give it a shot and see whether it makes filling out your daily compliance documents quicker and easier. There is no wrong way to use it, and nothing you do in it during testing is a problem.';
  const feedback =
    'If something is confusing, wrong, or missing, we would genuinely like to know. The ? menu in the app has Send feedback — a couple of words is plenty, and a screenshot goes with it automatically.';
  const text =
    `Hi ${first},\n\n${intro}\n\n${ask}\n\n${feedback}\n\nTo get started:\n` +
    steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
    `\n\nSet up my account: ${opts.link}\n\nThanks for helping us get this right.\n\n` +
    `This is a test version: expect rough edges, and expect changes as feedback comes in. The link works once and expires in ${opts.ttlDays} days. If you were not expecting this, you can ignore it.`;
  return {
    to: opts.to,
    subject: 'An invitation to try ShotLog',
    text,
    html: layout({
      company: opts.company,
      title: `Hi ${esc(first)}`,
      intro: `${esc(intro)}<br><br>${esc(ask)}<br><br>${esc(feedback).replace('? menu', '<b>?</b> menu').replace('Send feedback', '<i>Send feedback</i>')}<br><br><b>To get started:</b>`,
      steps: steps.map(esc),
      cta: { label: 'Set up my account', url: opts.link },
      footer: `Thanks for helping us get this right.<br><br>This is a test version: expect rough edges, and expect changes as feedback comes in. The link works once and expires in ${opts.ttlDays} days. If you were not expecting this, you can ignore it.`,
    }),
  };
}

/** A user's in-app feedback / crash report, forwarded to the platform admin */
export function feedbackMail(opts: {
  to: string;
  id: string;
  kind: string;
  message: string;
  name: string;
  email: string;
  role: string;
  company: string;
  route: string;
  buildId: string;
  online: boolean;
}): Mail {
  const kindLabel =
    opts.kind === 'crash' ? 'Crash report' : opts.kind === 'bug' ? 'Bug' : opts.kind === 'idea' ? 'Idea' : 'Question';
  const link = `${APP_URL}/admin/feedback?id=${encodeURIComponent(opts.id)}`;
  const snippet = opts.message.replace(/\s+/g, ' ').trim().slice(0, 70);
  const where = [
    `Who: ${opts.name} (${opts.role}, ${opts.company}) — ${opts.email}`,
    `Where: ${opts.route || '/'}${opts.online ? '' : ' — sent from an offline queue'}`,
    `Build: ${opts.buildId || 'unknown'}`,
  ];
  const text =
    `${kindLabel} from ${opts.name}:\n\n${opts.message}\n\n` +
    where.join('\n') +
    `\n\nOpen in ShotLog: ${link}`;
  return {
    to: opts.to,
    subject: `ShotLog ${kindLabel.toLowerCase()} — ${opts.name}: ${snippet}${opts.message.length > 70 ? '…' : ''}`,
    text,
    html: layout({
      company: opts.company,
      title: `${kindLabel} from ${esc(opts.name)}`,
      intro: `<span style="display:block;white-space:pre-wrap;border-left:3px solid #EE7A2E;padding:6px 12px;color:#172338">${esc(opts.message)}</span>`,
      steps: where.map(esc),
      cta: { label: 'Open in ShotLog', url: link },
      footer: 'Sent by ShotLog when a user files feedback or the app catches an error. Reply notes live in Admin › Feedback.',
    }),
  };
}

export function resetMail(opts: { to: string; name: string; company: string; link: string; ttlMinutes: number }): Mail {
  const first = opts.name.split(' ')[0] || opts.name;
  const text =
    `Hi ${first},\n\nSomeone asked to reset the ShotLog password for ${opts.to}. ` +
    `If that was you, choose a new password here:\n\n${opts.link}\n\n` +
    `The link works once and expires in ${opts.ttlMinutes} minutes. If you did not ask for this, ignore it — your password stays the same.`;
  return {
    to: opts.to,
    subject: 'Reset your ShotLog password',
    text,
    html: layout({
      company: opts.company,
      title: `Reset your password, ${esc(first)}`,
      intro: `Someone asked to reset the ShotLog password for <b>${esc(opts.to)}</b>. If that was you, choose a new one below. If not, ignore this — your password stays the same.`,
      steps: ['Tap the button and choose a new password.', 'You are signed in straight away on that device; other devices ask you to sign in again.'],
      cta: { label: 'Choose a new password', url: opts.link },
      footer: `The link works once and expires in ${opts.ttlMinutes} minutes.`,
    }),
  };
}
