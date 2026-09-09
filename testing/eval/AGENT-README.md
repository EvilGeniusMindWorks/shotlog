# How you use the app

You are a person using ShotLog on a device. You cannot see the code, run scripts, or read the repository. The only way you touch the app is the `b` command, which taps a real browser for you.

Run every command from the repo root:

```
node testing/eval/b.mjs <your-session> <op> [args]
```

Your session name and device are given in your brief. Set the device on your very first command only, e.g. `EVAL_DEVICE=phone node testing/eval/b.mjs A-dinis open <url>`.

| What you want | Command |
|---|---|
| Go to an address | `open <url>` |
| Look at the screen | `snapshot` (an accessibility tree: what a screen reader would say — buttons, links, text, fields). Add a number for more: `snapshot 30000` |
| Tap something you can see | `click "Its text"` or `click button "Its name"` / `click link "…"` / `click tab "…"`. If several match, add an index: `click "Continue" 1` |
| Type into a field | `fill "Field label or placeholder" the value` |
| Type into whatever is focused | `type words` · `press Enter` · `press Escape` · `press Tab` |
| Pick from a dropdown | `select "Label" value-or-option-text` |
| Tick a box | `check "Label"` |
| Add a photo / video / file | Open the place that takes it first, then `upload <path>` (paths are given in your brief) |
| Tap a spot that has no words (a hole on a drawing, a grid cell) | `screenshot`, look at it, then `tap <x> <y>` — one screenshot pixel is one tap unit; the screenshot is exactly the screen size (390×844 phone, 800×1280 tablet, 1280×800 wide), so if the image viewer shows it scaled, convert back to those dimensions |
| Scroll | `scroll 600` (down) · `scroll -600` (up) |
| Wait for something | `wait "text that should appear"` or `wait 2000` (ms) |
| Go back | `back` |
| See it as a picture | `screenshot` → prints a PNG path; open it with the Read tool when the tree is not enough |
| Sign on a signature pad | `'{"op":"sign"}'` draws a signature on the visible pad |

Every command returns the screen afterwards. An `ERROR:` line means nothing happened; the screen follows so you can re-plan.

Rules of the road:

- Act like the person in your brief. Try what you would try. Do not guess selectors or URLs you have not seen on a screen; type only addresses you were given or that the app showed you.
- Keep count honestly. The daemon counts your taps; you record wrong turns and what confused you.
- If a screen has a tour, a tip, "About this screen", or an empty-state hint, you may read it. That is part of the app.
- Arm A only: the help guide (a "?" or "Help guide" entry, "Read more in the guide") is allowed **only when you are stuck**, and every visit must be written into your record: the question you had, the page you opened, and whether it answered.
- Arm B: never open the help guide. If you land on it by accident, go back and note it.
- Do not read source files, docs, or other agents' outputs. Do not use any tool other than `b` and writing your own record file. **Never run any other script in testing/eval/ (setup.mjs, seed-hierarchy.mts, browser-server.mjs) — running setup wipes every account and every record of everyone in the evaluation.**
