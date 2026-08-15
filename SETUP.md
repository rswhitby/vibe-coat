# Vibe Coat — Setup & Operations

How to bring the full installation up from cold. Last verified working **15 August 2026**.

## Pipeline

```
Phone (vibeco.at)
  └─ WSS ─→ Railway relay (relay.js)
              └─→ TouchDesigner  ── WebSocket DAT
                    └─→ Table DAT (vibe log)
                          └─→ LLM aggregation (last 5 vibes → one prompt)
                                └─→ StreamDiffusionTD → Daydream API
                                      └─→ Spout ─→ OBS ─ WHIP ─→ Cloudflare Stream
                                                                    └─ WHEP ─→ Phone overlay
```

Two halves that fail independently:

- **Vibe half** — phone → relay → TouchDesigner. Text only.
- **Video half** — TouchDesigner → Spout → OBS → Cloudflare → phone. Pixels only.

Test them separately. The vibe half needs nothing but TouchDesigner and a phone.

---

## Prerequisites

Already installed on the current machine: Git, TouchDesigner, OBS Studio, StreamDiffusionTD.

**Not needed:**

- **Node.js** — the relay is deployed on Railway; TouchDesigner connects outbound to it. Only required to run a local relay for offline dev.
- **Python / CUDA / NDI SDK** — only for StreamDiffusionTD's local backend.

Version floors: TouchDesigner 2025+ on Windows, OBS 30+ (earlier versions have no WHIP service).

---

## Bring-up sequence

### 1. Clear git line endings

OneDrive rewrites line endings, which makes every file look modified.

```bash
git config core.autocrlf true
```

That alone clears it. Do **not** run `git checkout -- .` — tracked docs live here now and it will discard real work.

### 2. Open the TouchDesigner project

Latest file is the highest-numbered `.toe` in `Touchdesigner/`. Confirm the **WebSocket DAT**:

| Parameter | Value |
| --- | --- |
| Active | On |
| Mode | Client |
| Network Address | `vibe-coat-production.up.railway.app` |
| Network Port | `443` |
| SSL | Enabled (TLS 1.2) |

Toggle Active off and on to reconnect.

### 3. Test the vibe half

Open `https://vibeco.at` on a phone, type a vibe, Send. Watch the WebSocket DAT:

```json
{"vibe": "golden fog", "from": "<ip>", "timestamp": "2026-08-15T..."}
```

The relay broadcasts to *other* clients only — a client never receives its own message. Both phone and TouchDesigner must be connected.

### 4. TouchDesigner → OBS (Spout)

Spout shares GPU textures between Windows apps on one machine. No network hop, no encode.

**TouchDesigner:** add a **Spout Out TOP**, wire the final output in, set Sender Name to `VibeCoat`. Resolution must be `512x512`.

**OBS:** install the [Spout2 plugin](https://github.com/Off-World-Live/obs-spout2-plugin), restart, add a **Spout2 Capture** source, select `VibeCoat`. Size it to fill the canvas exactly — letterboxing shifts the chroma-key regions on the phone.

If Spout stutters, NDI is the fallback: steadier, at the cost of an encode/decode round trip.

### 5. OBS → Cloudflare (WHIP)

**Settings → Stream**

| Field | Value |
| --- | --- |
| Service | `WHIP` |
| Server | WHIP URL (see [URLs](#urls)) |
| Bearer Token | **blank** — Cloudflare authenticates via the URL path |
| Total Layers | `1` |

**Settings → Output** — Output Mode `Advanced`, Streaming tab

| Field | Value |
| --- | --- |
| Video Encoder | `x264` |
| Rate Control | `CBR` |
| Bitrate | `2500 Kbps` |
| Keyframe Interval | `1 s` |
| CPU Usage Preset | `veryfast` |
| Profile | `baseline` |
| Tune | `zerolatency` |
| Rescale Output | `Disabled` |
| Audio Encoder | `FFmpeg Opus` |

**Settings → Video** — base and output resolution both `512x512`.

Hit **Start Streaming**. Cloudflare's preview flips off "Disconnected" within seconds.

### 6. Verify on the phone

Open `vibeco.at`, tap **TEST** for the full overlay, or hold a green or blue object in frame for the chroma key.

**Check Cloudflare shows live before testing the phone.** A deleted input and an idle one both render as nothing, so testing in the wrong order sends you hunting in the app for an upstream problem.

---

## URLs

| Purpose | Value |
| --- | --- |
| App | `https://vibeco.at` (GitHub Pages, CNAME) |
| Relay | `wss://vibe-coat-production.up.railway.app` |
| Local relay | `ws://localhost:9980` (`npm run relay`; app auto-switches on localhost) |
| WHIP → OBS | Cloudflare **Broadcast** tab → WebRTC |
| WHEP → app | Cloudflare **Playback** tab → Protocol URLs → WebRTC (WHEP) Playback URL |

**The two WebRTC URLs carry different IDs and are not interchangeable.** Per [Cloudflare's docs](https://developers.cloudflare.com/stream/webrtc-beta/), publish is `.../<SECRET>/webRTC/publish` and playback is `.../<INPUT_UID>/webRTC/play`. The publish URL is a credential — anyone holding it can broadcast to the input. **Never commit it; this repo is public.**

---

## Gotchas

**Use x264, not NVENC.** Cloudflare's WHEP accepts h264 Constrained Baseline Profile Level 3.1 only, and recent NVENC dropped baseline support. At 512x512 x264 is nearly free.

**Never ingest over RTMPS or SRT.** The dashboard offers both, but Cloudflare cannot ingest RTMP/SRT and play back over WHEP — the protocols must be paired. The app is WHEP, so OBS must be WHIP.

**OBS defaults fight low latency.** Keyframe interval `0 s` (auto) leaves multi-second gaps so joining viewers wait; `Two Passes` and `Look-ahead` buffer ahead; B-frames add reordering delay. `zerolatency` disables all of it. The default 10000 Kbps is ~40x what 512x512 needs and stalls on cell before it looks better.

**Bump the service worker after editing `main.js`.** `sw.js` pins `CACHE = 'vibe-coat-v7'`; increment it or installed PWAs keep serving the old bundle.

**Keep everything 512x512.** Overlay rotation was removed on the assumption of a square source; non-square input misaligns the chroma-key regions.

---

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| No vibes reach TouchDesigner | WebSocket DAT Active; Railway logs; confirm both clients connected |
| Vibes arrive, no prompt | Table DAT populating? LLM API key in the aggregation script |
| Cloudflare stays "Disconnected" | WHIP URL truncated on copy; must end `/webRTC/publish`. Bearer token must be blank |
| Cloudflare live, phone black | `WHEP_URL` in `main.js`; service worker cache; playback policy must be Public |
| Stream stutters | Bitrate too high; Spout frame drops (try NDI); confirm `zerolatency` |
| Overlay misaligned | OBS source not filling a 512x512 canvas |

---

## Repo layout

```
index.html  main.js  style.css  sw.js  manifest.json   PWA
relay.js                                               WebSocket relay (Railway)
CNAME                                                  vibeco.at
icons/                                                 PWA icons
Touchdesigner/                                         .toe project + Backup/
```

Deployment: static frontend on GitHub Pages from `main` root; relay on Railway running `npm start`.

---

## Open items

1. **StreamDiffusionTD version** — check the operator's About page. v0.2.99 means local GPU inference; v0.3.1 adds a Daydream hosted backend that removes the Python/CUDA/GPU burden entirely. v0.3.x cannot upgrade in place — it installs to a separate folder.
2. **Could Daydream replace OBS + Cloudflare?** Daydream may expose a playback URL directly, which would drop two moving parts and point `WHEP_URL` at Daydream. Untested.
3. **Repo size** — `.toe` files are ~7 MB each and don't delta-compress, so every save adds its full size permanently. Consider gitignoring `Touchdesigner/Backup/`.
4. **Stale Google Drive copy** — `Freelance/Je-Le/Vibe-Coat/` holds versions up to v2.2, superseded by the repo's v3.x. Never checked for anything unique. Archive or delete.

---

## Sources

- [Cloudflare Stream WebRTC (WHIP/WHEP)](https://developers.cloudflare.com/stream/webrtc-beta/)
- [StreamDiffusionTD install guide](https://dotsimulate.com/docs/streamdiffusiontd/install)
- [Hosted StreamDiffusion for TouchDesigner](https://daydream.live/streamdiffusiontd)
- [OBS Spout2 plugin](https://github.com/Off-World-Live/obs-spout2-plugin)
