# Vibe Coat — Setup Runbook

Rebuilding the full pipeline on a fresh machine. Written August 2026, picking up from the April build.

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
| GitHub repo | Local clone in sync with `origin/main` at `8046c88` |
| `relay.js`, `main.js`, `sw.js` | Parse clean under Node 22 |

Nothing in the code needs repair. The work is machine setup plus reconnecting the two cloud services.

---

## Step 1 — Nothing to install

Git, TouchDesigner, OBS, and the StreamDiffusionTD TOX are all already on the machine. Two version checks are worth doing before you start:

- **TouchDesigner** — 2025 or newer on Windows for the current Daydream path. Help → About.
- **OBS** — v30+ for WHIP output. Anything older has no WHIP service option in Settings → Stream.

You do **not** need Node.js (the relay runs on Railway) or Python/CUDA/NDI (only for the local StreamDiffusion backend, which you no longer need — see Step 3).

The only thing you may need to download is a newer StreamDiffusionTD TOX. See Step 3.

---

## Step 2 — Clone

```bash
git clone https://github.com/rswhitby/vibe-coat.git
cd vibe-coat
```

No install step for normal operation. The app is static files served from GitHub Pages, and the relay runs on Railway. `npm install` (one dependency, `ws`) is only needed if you want a local relay — see Step 5.

### Line endings

`git status` currently shows all nine tracked files as modified. This is CRLF/LF noise from OneDrive, not real edits — every file shows equal insertions and deletions. Clear it with:

```bash
git config core.autocrlf true
git checkout -- .
```

Do this before making real changes, otherwise every diff will be unreadable.

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

Note there are two parallel copies of the TD work and they have diverged:

- **Repo** (`OneDrive/Documents/GitHub/vibe-coat/Touchdesigner/`) — v3, v3.7, plus Backup v3.1–v3.3
- **Google Drive** (`Freelance/Je-Le/Vibe-Coat/`) — only up to v2.2

The repo copy is newer. Use v3.7 and ignore the Drive folder, or you will lose four versions of work.

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

Check whether that live input still exists in your Cloudflare dashboard. If it was deleted or the account lapsed, create a new one:

1. dash.cloudflare.com → **Stream** → **Live Inputs** → **Create Live Input**
2. Enable **WebRTC / Low Latency**
3. Playback policy → **Public**
4. Copy the WHEP URL into `WHEP_URL` in `main.js`
5. Copy the WHIP URL and key into OBS

### OBS settings

**Settings → Stream:** Service `WHIP`, Server = Cloudflare WHIP URL, Bearer Token = stream key.

**Settings → Output → Advanced → Streaming:** x264, keyframe interval `1s`, preset `veryfast`, profile `baseline`, tune `zerolatency`, 512x512.

**Settings → Video:** output resolution `512x512`.

Source in OBS is the TouchDesigner output carrying the StreamDiffusion result.

---

## Step 7 — Bust the service worker cache

`sw.js` is on cache `vibe-coat-v7`. If you edit `main.js` (which Step 6 requires), bump that string or phones will keep serving the old cached bundle:

```js
const CACHE = 'vibe-coat-v8';
```

Shell assets are network-first as of commit `8e385ba`, so this mainly matters for testers who already installed the PWA to their home screen.

---

## Open questions to resolve

1. **Cloudflare Stream** — does the April live input still exist, or does the WHEP URL need regenerating? This is the single most likely blocker.
2. **Daydream** — you said credits are still active. Confirm the API key works from the Builder Dashboard, since the key format may have changed when the hosted operator shipped.
2a. **StreamDiffusionTD version** — check the operator's About page. Determines whether Step 3 is a download or a no-op.
3. **The two TouchDesigner folders** — worth deleting or archiving the Google Drive copy so there's one source of truth.

3a. **Can Daydream replace OBS + Cloudflare?** Daydream is a streaming platform in its own right and may expose a playback URL directly, which would let you drop two moving parts from the path and point `WHEP_URL` at Daydream instead. Untested — this is a change you never made, not a step you forgot. Worth investigating before the next install run, but don't attempt it while trying to get back to a known-good state.
4. **Which .toe is actually current** — `v3.toe` and `v3.7.toe` are the same file, confirmed by matching MD5 (`b5784c39...`). One is a redundant copy. Backup holds three genuinely distinct earlier versions (v3.1, v3.2, v3.3).

---

## Sources

- [StreamDiffusionTD install guide](https://dotsimulate.com/docs/streamdiffusiontd/install)
- [Hosted StreamDiffusion for TouchDesigner — Daydream](https://daydream.live/streamdiffusiontd)
- [Daydream API docs](https://docs.daydream.live/api/introduction)
- Project README, `rswhitby/vibe-coat`
