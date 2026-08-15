# Vibe Coat — Setup Runbook

Reconnecting the pipeline after a gap. Written August 2026, picking up from the April build.

Everything is already installed and the repo is already cloned. This is a checklist of things to verify and reconnect, not an install guide. Steps 1 and 2 are near no-ops; the real work is Steps 4–6.

## Pipeline shape

```
Phone (vibeco.at)
  → wss://vibe-coat-production.up.railway.app   [relay.js on Railway]
  → TouchDesigner WebSocket DAT (outbound client)
  → LLM aggregation (last 5 vibes → one prompt)
  → StreamDiffusionTD → Daydream API (cloud GPU)
  → OBS → Cloudflare Stream (WHIP)
  → Phone pulls WHEP → chroma-key overlay
```

Two independent halves. The **vibe half** (phone → relay → TD) and the **video half** (TD → OBS → Cloudflare → phone). Bring them up separately and test each before joining them.

---

## What is already alive

Verified 15 Aug 2026:

| Thing | Status |
| --- | --- |
| `https://vibeco.at` | Live, serving the PWA |
| Railway relay | Responding on HTTPS |
| GitHub repo | Local clone present, 2 commits ahead of `origin/main` |
| `relay.js`, `main.js`, `sw.js` | Parse clean under Node 22 |
| Cloudflare live input | Alive, ID matches `main.js` — no change needed |
| **Full pipeline** | **Working end to end, confirmed 15 Aug 2026** |

The whole chain came back up with **no code changes**. Phone → Railway relay → TouchDesigner → StreamDiffusionTD/Daydream → Spout → OBS → Cloudflare WHIP → phone WHEP. The only work was reconfiguring OBS's encoder and clearing a line-ending mess in git.

Nothing in the code needs repair and nothing needs installing. The only open work is reconnecting the two cloud services and deciding on the StreamDiffusionTD version.

---

## Step 1 — Nothing to install

Git, TouchDesigner, OBS, and the StreamDiffusionTD TOX are all already on the machine. Two version checks are worth doing before you start:

- **TouchDesigner** — 2025 or newer on Windows for the current Daydream path. Help → About.
- **OBS** — v30+ for WHIP output. Anything older has no WHIP service option in Settings → Stream.

You do **not** need Node.js (the relay runs on Railway) or Python/CUDA/NDI (only for the local StreamDiffusion backend, which you no longer need — see Step 3).

The only thing you may need to download is a newer StreamDiffusionTD TOX. See Step 3.

---

## Step 2 — Clear the line-ending noise

The repo is already cloned at `C:\Users\rswhi\OneDrive\Documents\GitHub\vibe-coat`, in sync with `origin/main` at `8046c88`. Nothing to clone, and no `npm install` for normal operation — the app is static files on GitHub Pages and the relay runs on Railway.

One actual task here. `git status` shows all nine tracked files as modified, but it's CRLF/LF noise from OneDrive, not real edits — the diff is 961 insertions against 961 deletions. Clear it:

```bash
git config core.autocrlf true
git checkout -- .
```

Do this before making real changes, otherwise the `main.js` edit in Step 6 will be buried in whitespace.

---

## Step 3 — StreamDiffusionTD (this is what changed most)

**Check your TOX version first** — About page on the operator. Your April copy is most likely v0.2.99.

The big shift since April: **Daydream now hosts inference.** The local path (NVIDIA GPU, Python 3.11, CUDA toolchain, NDI SDK, 20–30 minute TensorRT engine build on first run) is no longer necessary.

Two things follow from that:

- The Daydream backend option only exists in **v0.3.x**. To use hosted inference you need a newer TOX than the one you have.
- v0.3.x is a rebuild and **cannot upgrade in place** from v0.2.99. Install it to a separate folder and leave your existing one alone.

### If you stay on your current v0.2.99 TOX

It still works — it's the setup that ran in April. Local GPU inference, no download needed. Choose this if you want the fastest path back to a known-good state.

### If you move to v0.3.1 + Daydream cloud (recommended)

1. Download the current `StreamDiffusionTD.tox` from [Dotsimulate's Patreon](https://www.patreon.com/dotsimulate)
2. Drag it into TouchDesigner — **do not overwrite the old one**
3. Install page → select **Daydream** as backend
4. Paste your Daydream API key
5. Start Stream

No Python, CUDA, or GPU. Works on Mac and Windows. Trade-off: FX Processors, StreamV2V, and custom processors are **Local backend only** — your April build didn't use them, so this shouldn't cost you anything.

Full local install guide, if you ever want it: https://dotsimulate.com/docs/streamdiffusiontd/install

---

## Step 4 — Open the TouchDesigner project

Latest file: `Touchdesigner/Vibe_Coat_Websocket_v3.7.toe` in the repo.

The repo is the source of truth: `OneDrive/Documents/GitHub/vibe-coat/Touchdesigner/` holds v3 and v3.7, plus Backup v3.1–v3.3.

An older copy exists on Google Drive (`Freelance/Je-Le/Vibe-Coat/`) that only goes up to v2.2. It is stale and out of scope — don't open TD files from there.

### Verify the WebSocket DAT

Once open, confirm the WebSocket DAT still reads:

| Parameter | Value |
| --- | --- |
| Active | On |
| Mode | Client |
| Network Address | `vibe-coat-production.up.railway.app` |
| Network Port | `443` |
| SSL | Enabled (TLS 1.2) |

Toggle Active off and on to reconnect.

---

## Step 5 — Test the vibe half

Before touching video, prove text flows end to end.

1. Open `https://vibeco.at` on your phone
2. Type a vibe, hit Send
3. Watch the WebSocket DAT in TouchDesigner

You should see JSON arrive:

```json
{"vibe": "golden fog", "from": "<ip>", "timestamp": "2026-08-15T..."}
```

If nothing arrives, the relay broadcasts to *other* clients only — a client never receives its own message. Make sure both the phone and TD are connected, and check the Railway logs for connect lines.

To run the relay locally instead, `npm run relay` starts it on `ws://localhost:9980`, and the app auto-switches to local when served from `localhost`.

---

## Step 6 — Reconnect the video half

**Why OBS is here.** WebRTC replaced HLS on 27 Apr, not OBS. The same day's commit "Remove overlay rotation for square 512x512 OBS source" confirms OBS was still the source when the project was last working. It captures TouchDesigner's output and pushes it to Cloudflare via WHIP; the phone pulls the result via WHEP. Something has to fill the Cloudflare input, and that something is OBS.

This is the most likely thing to be broken, because `main.js` hardcodes a Cloudflare Stream URL from April:

```js
const WHEP_URL = 'https://customer-faum3k08z80qrv3z.cloudflarestream.com/4b0713bf32dbda7e64ebbf6e9a00ae21/webRTC/play';
```

Work through the three links in order: TD → OBS, OBS → Cloudflare, Cloudflare → phone.

### 6a. TouchDesigner → OBS (Spout)

Spout shares GPU textures between Windows apps on the same machine. No network hop, no encode step.

**In TouchDesigner:**

1. Add a **Spout Out TOP** and wire your final 512x512 output into it
2. Set **Sender Name** to something identifiable, e.g. `VibeCoat`
3. Confirm resolution is `512x512` — the April commit "Remove overlay rotation for square 512x512 OBS source" means downstream geometry assumes square

**In OBS:**

1. Install the Spout2 plugin if it isn't already: https://github.com/Off-World-Live/obs-spout2-plugin
2. Restart OBS
3. Add source → **Spout2 Capture**
4. Pick the `VibeCoat` sender
5. Resize the source to fill the 512x512 canvas exactly — letterboxing here shifts the chroma-key regions on the phone

Spout can drop more frames than NDI on the same machine. If that shows up as stutter, NDI is the fallback; it costs an encode/decode round trip but is steadier.

### 6b. OBS → Cloudflare (WHIP)

**The April live input still exists** — confirmed 15 Aug. Live Input ID `4b0713bf…` and customer subdomain `customer-faum3k08z…` both match what `main.js` already points at. Nothing to recreate.

#### Which URL goes where

Two different URLs, two different IDs, and mixing them up is the easy mistake:

| Use | Where in dashboard | ID it contains |
| --- | --- | --- |
| **WHIP** → OBS | Broadcast tab → WebRTC | the publish **secret** |
| **WHEP** → `main.js` | Playback tab → Protocol URLs → WebRTC (WHEP) Playback URL | the public **input ID** |

Per [Cloudflare's docs](https://developers.cloudflare.com/stream/webrtc-beta/), `webRTC.url` is `.../<SECRET>/webRTC/publish` and `webRTCPlayback.url` is `.../<INPUT_UID>/webRTC/play`. The publish URL is a credential — anyone holding it can broadcast to the input. Never commit it to this repo, which is public.

#### Do not use RTMPS or SRT

The dashboard offers both, but Cloudflare does not support ingesting over RTMP/SRT and playing back over WHEP — the protocols must be paired. Since the app plays via WHEP, OBS must publish via WHIP. The RTMPS and SRT tabs are a dead end here.

#### OBS settings

**Settings → Stream:** Service `WHIP`, Server = the WHIP URL from the Broadcast tab, **Bearer Token = blank**. Cloudflare carries auth in the URL path, so no token is needed. (An earlier version of this doc said to paste the stream key here — that was wrong, and carried over from RTMPS.)

**Settings → Output** (Output Mode `Advanced` → Streaming tab):

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

**Use x264, not NVENC.** Cloudflare's WHEP accepts h264 **Constrained Baseline Profile Level 3.1** only, and NVENC on recent cards has dropped baseline support. At 512x512 x264 costs almost nothing.

Defaults that break low-latency WebRTC, if you're wondering why so many fields change: keyframe interval `0 s` (auto) lets gaps run several seconds so joining viewers wait; `Two Passes` and `Look-ahead` buffer frames ahead; B-Frames add reordering delay. `zerolatency` disables all of it. And OBS's default 10000 Kbps is roughly 40x what a 512x512 frame needs — it stalls on cell before it ever looks better.

**Settings → Video:** base and output resolution both `512x512`.

Hit **Start Streaming**. The dashboard preview should flip from "Disconnected" to live within a few seconds. If it doesn't, the problem is here, not in the app.

### 6c. Cloudflare → phone (WHEP)

**Nothing to do.** The existing `WHEP_URL` in `main.js` already points at the live input that still exists, so no edit and no service worker bump are needed.

Only if you ever recreate the input, update the constant and then bump the cache (Step 7):

```js
const WHEP_URL = 'https://customer-<id>.cloudflarestream.com/<input-id>/webRTC/play';
```

**Test order matters.** Confirm the Cloudflare dashboard shows "Live" *before* testing on the phone. Tapping TEST on the phone can't tell a deleted input apart from a live-but-idle one — both render as nothing.

Source in OBS is the TouchDesigner output carrying the StreamDiffusion result.

---

## Step 7 — Bust the service worker cache

Not needed this time — `main.js` was never edited, since the Cloudflare input survived.

`sw.js` is on cache `vibe-coat-v7`. If you ever *do* edit `main.js`, bump that string or phones will keep serving the old cached bundle:

```js
const CACHE = 'vibe-coat-v8';
```

Shell assets are network-first as of commit `8e385ba`, so this mainly matters for testers who already installed the PWA to their home screen.

---

## Open questions to resolve

1. ~~**Cloudflare Stream** — does the April live input still exist?~~ **Resolved 15 Aug: it does.** ID and subdomain both match `main.js`. No changes needed on the app side.
2. ~~**Daydream** — does the API key still work?~~ **Resolved: yes.** The pipeline generates end to end.
2a. **StreamDiffusionTD version** — still unchecked. Worth knowing before the next install run: if you're on v0.2.99 you're running local GPU inference, and moving to v0.3.1 + Daydream hosted would free the machine from that. Not urgent now that it works.
3. **The stale Google Drive copy** — holds `Vibe_Coat_Websocket.toe` through v2.2 plus its own Backup folder. Superseded by the repo's v3.x, but never checked for anything unique. Archive or delete it at some point so there's one source of truth.

3a. **Can Daydream replace OBS + Cloudflare?** Daydream is a streaming platform in its own right and may expose a playback URL directly, which would let you drop two moving parts from the path and point `WHEP_URL` at Daydream instead. Untested — this is a change you never made, not a step you forgot. Worth investigating before the next install run, but don't attempt it while trying to get back to a known-good state.
4. **Which .toe is actually current** — `v3.toe` and `v3.7.toe` are the same file, confirmed by matching MD5 (`b5784c39...`). One is a redundant copy. Backup holds three genuinely distinct earlier versions (v3.1, v3.2, v3.3).

---

## Sources

- [StreamDiffusionTD install guide](https://dotsimulate.com/docs/streamdiffusiontd/install)
- [Hosted StreamDiffusion for TouchDesigner — Daydream](https://daydream.live/streamdiffusiontd)
- [Daydream API docs](https://docs.daydream.live/api/introduction)
- Project README, `rswhitby/vibe-coat`
