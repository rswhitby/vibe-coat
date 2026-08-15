# Vibe Coating — Front-end redesign plan

Against `260804_WebApp.pdf` (8 pages, Aug 2026). Scope is the PWA only; the relay, TouchDesigner, and streaming pipeline are untouched except for one new message type.

## The shift

Today the app is **one screen**: camera composite with a bottom toolbar. The design makes it a **seven-view app** with a menu. That's the structural change — everything else is styling.

| View | Contents |
| --- | --- |
| Home | Hero background, "Vibe Coating", instructions, text input, blue + green circles, hamburger |
| Camera | Live chroma composite, same two circles, hamburger |
| Menu | Blue texture, five links |
| About | Underlined title, body, date range |
| Vibe Starters | Underlined title, guidance, example list |
| Current Vibes | Underlined title, body, **live** latest-vibes list + current atmosphere |
| Credits | Underlined title, six credit blocks |

Also a rename: **Vibe Coat → Vibe Coating** in `<title>`, `manifest.json`, and the Apple web-app title. The `vibeco.at` domain stays.

---

## Decisions already made

**The settings button and tuning panel stay visible**, exactly as they work today. The HSV sliders remain reachable from the toolbar — you'll want them on site when the light changes.

---

## Open decisions

### 1. Where does "Current Vibes" get its data?

`main.js` sends over the WebSocket but has **no `message` listener** — it never receives anything. This screen is the only genuinely new functionality in the redesign.

The useful accident: `relay.js` already broadcasts each message to *all other* clients. Every phone therefore already sees every other phone's vibe. So the **latest vibes list costs nothing** — just start listening.

The **current atmosphere** is the LLM-combined prompt and can only come from TouchDesigner.

**Recommended split:** phones accumulate the list locally; TouchDesigner pushes the atmosphere. Degrades gracefully — if TD is offline, visitors still see vibes streaming in.

### 2. Splash screen

The PDF has none; page 1 is the landing. Recommend dropping it and landing straight on Home, which retires the "look around / key a color / make a vibe" animation and the `vibe.coat` logo. Say the word if you'd rather keep it restyled.

---

## Assets needed from you

1. **Home hero background** — the green/blue fabric collage on page 1
2. **Blue texture background** — pages 3–7 appear to reuse one image

Ideal: ~1080×2340 or larger, WebP with JPG fallback. I'll handle compression and `srcset`.

3. **Typeface.** The PDF uses a tight grotesk with very tight leading — reads like Helvetica Now Display or Söhne. Send the web font files if it's licensed, otherwise name it and I'll pick the closest free match (Inter Tight and Archivo are both near).

---

## Build order

**Phase 1 — Routing shell.** Add a hash-based view router (`#about`, `#camera`) so the phone back button works, which matters in an installed PWA. Move the existing camera UI into a `camera` view. No visual change yet; verifies nothing breaks.

**Phase 2 — Home, menu, content.** Build the six new views with real copy from the PDF, backgrounds dropped in. Static content only.

**Phase 3 — Current Vibes live.** Add `ws.onmessage`, accumulate the list, render the atmosphere. Add a `type` field to messages:

```json
{"type": "vibe", "vibe": "golden fog"}
{"type": "atmosphere", "text": "A rainy Y2K train ride..."}
```

Phones ignore unknown types, so this stays backward compatible with the current bare `{"vibe": "..."}` shape. TouchDesigner needs a small addition to send `atmosphere` after each aggregation — the only pipeline-side work in this plan.

**Phase 4 — Polish.** Bump the service worker cache, decide whether backgrounds precache for offline, verify safe-area insets on iOS.

---

## Things that will bite

**Don't let UI colors touch the chroma thresholds.** The circle buttons are affordances; the HSV ranges target the physical fabric. They're already separate (`#controls button` CSS vs. `THRESHOLDS` in JS) and must stay that way. Restyling a button to match the PDF's green must not change what the key matches.

**Defer the camera permission.** Today it's requested on load. With a landing page in front, request it when someone first taps a circle. Better UX, and permission prompts that arrive with context get denied far less often.

**The keyboard will shove the Home layout.** The input sits mid-page with circles below it. On iOS the keyboard will push or overlay them — needs testing on a real handset, not a simulator.

**Cache bump is mandatory.** `sw.js` pins `vibe-coat-v7`. Every phone that installed the PWA in April will keep serving the old bundle until that string changes.

**Background weight.** Full-bleed photographic backgrounds on seven views is the main new payload. Visitors arrive on cell, so these want aggressive compression and probably lazy-loading on the content views.

---

## Not in scope

Relay, Railway, Cloudflare, OBS, and the TouchDesigner pipeline stay as they are. The only pipeline change is TD emitting the `atmosphere` message in Phase 3.
