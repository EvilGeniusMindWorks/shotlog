#!/usr/bin/env node
// CLI for the persona-evaluation browser daemon (browser-server.mjs).
//
//   node testing/eval/b.mjs <session> <op> [json | shorthand…]
//
//   b A-dinis open http://localhost:5199/enroll/abc          (device from EVAL_DEVICE or "phone")
//   b A-dinis snapshot                                         accessibility tree of the screen
//   b A-dinis click "Sign in"                                  by visible text (buttons, links, rows…)
//   b A-dinis click 12                                          by the number the snapshot gave it (fill 7 text · select 9 value work too)
//   b A-dinis click button "Sign in"                           by role + name
//   b A-dinis dialog accept [text] | dialog dismiss              answer a native dialog the screen shows
//   b A-dinis fill "Email" you@example.com                     by label / placeholder
//   b A-dinis type "some words"                                keyboard into the focused field
//   b A-dinis press Enter
//   b A-dinis select "Role" driller
//   b A-dinis upload testing/eval/assets/face.jpg              into the photo/file input on screen
//   b A-dinis tap 212 640                                      a finger at a spot (CSS px, from a screenshot)
//   b A-dinis scroll 600
//   b A-dinis wait "Synced"
//   b A-dinis back
//   b A-dinis screenshot                                       saves a PNG, prints its path
//   b A-dinis '{"op":"click","role":"button","name":"Send","exact":true}'   full form
//
// Set the device once, on the first command: EVAL_DEVICE=tablet|phone|wide.
const [, , session, op, ...rest] = process.argv;
const PORT = process.env.EVAL_PORT ?? 4790;
if (!session || !op) { console.error('usage: b <session> <op> [args]'); process.exit(2); }

let a;
if (op.startsWith('{')) a = JSON.parse(op);
else {
  a = { op };
  const roles = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'option', 'tab', 'menuitem', 'heading', 'row', 'cell', 'listitem', 'switch', 'img', 'dialog', 'region', 'navigation', 'main', 'banner', 'spinbutton', 'searchbox', 'slider', 'group', 'article', 'list', 'table', 'alert', 'status']);
  switch (op) {
    case 'open': a.url = rest[0]; break;
    case 'click': case 'check':
      if (/^\d+$/.test(rest[0] ?? '')) a.ref = Number(rest[0]);
      else if (rest.length >= 2 && roles.has(rest[0])) { a.role = rest[0]; a.name = rest[1]; if (rest[2] != null) a.nth = Number(rest[2]); }
      else { a.text = rest[0]; if (rest[1] != null) a.nth = Number(rest[1]); }
      break;
    case 'fill': if (/^\d+$/.test(rest[0] ?? '')) { a.ref = Number(rest[0]); a.value = rest.slice(1).join(' '); } else { a.label = rest[0]; a.value = rest.slice(1).join(' '); } break;
    case 'select': if (/^\d+$/.test(rest[0] ?? '')) { a.ref = Number(rest[0]); a.value = rest[1]; } else { a.label = rest[0]; a.value = rest[1]; } break;
    case 'dialog': a.answer = rest[0] === 'dismiss' ? 'dismiss' : 'accept'; if (rest[0] !== 'dismiss' && rest[0] !== 'accept') a.text = rest.join(' '); else if (rest[1] != null) a.text = rest.slice(1).join(' '); break;
    case 'type': a.text = rest.join(' '); break;
    case 'press': a.key = rest[0]; break;
    case 'upload': a.files = rest; break;
    case 'scroll': a.dy = Number(rest[0] ?? 600); break;
    case 'tap': a.x = Number(rest[0]); a.y = Number(rest[1]); break;
    case 'wait': if (/^\d+$/.test(rest[0] ?? '')) a.ms = Number(rest[0]); else a.text = rest[0]; break;
    case 'snapshot': if (rest[0]) a.max = Number(rest[0]); break;
    case 'screenshot': if (rest[0]) a.path = rest[0]; break;
    default: break;
  }
}
a.session = session;
if (process.env.EVAL_DEVICE) a.device = process.env.EVAL_DEVICE;

// `fill` by label falls back to placeholder, then text next to the field
async function post(body) {
  const r = await fetch(`http://localhost:${PORT}/`, { method: 'POST', body: JSON.stringify(body) });
  return { ok: r.ok, text: await r.text() };
}
let r = await post(a);
if (!r.ok && a.op === 'fill' && a.label && a.ref == null) {
  const alt = await post({ ...a, label: undefined, placeholder: a.label });
  if (alt.ok) r = alt;
  else {
    const alt2 = await post({ ...a, label: undefined, selector: `input:near(:text("${a.label}"))` });
    if (alt2.ok) r = alt2;
  }
}
process.stdout.write(r.text + '\n');
process.exit(r.ok ? 0 : 1);
