# Vibe Coat

A Progressive Web App that uses your phone camera to detect colored objects via chroma-keying, then replaces those color regions with live video streams.

## Live

**App:** https://rswhitby.github.io/vibe-coat/
**Relay:** wss://vibe-coat-production.up.railway.app

## How it works

Point your camera at a colored object. Tap the matching color button in the toolbar — the app replaces that color in the live camera feed with a video stream, composited in real time on a canvas.

## Features

- Full-screen camera viewfinder
- Real-time chroma-key compositing (HSV-based color matching)
- Two color channels: green, blue
- WebRTC (WHEP) video stream overlay per channel — sub-second latency
- TEST button to show full overlay without chroma key
- Vibe text input — sends requests to a TouchDesigner sketch via WebSocket
- Installable PWA (works offline, add to home screen)

## Tech stack

- Vanilla JS / HTML / CSS — no framework
- Native `RTCPeerConnection` (WHEP) for WebRTC stream playback
- Canvas 2D API for per-pixel compositing
- Service worker for app shell caching

## Stream setup

The overlay streams are delivered via WebRTC using Cloudflare Stream as the media server. OBS pushes the stream in via WHIP; the browser pulls it via WHEP with sub-second latency.

### Cloudflare Stream

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Stream** → **Live Inputs** → **Create Live Input**
2. Enable **WebRTC / Low Latency** on the input
3. Set playback policy to **Public**
4. Note the **WHIP URL** (for OBS) and **WHEP URL** (for the app — update `WHEP_URL` in `main.js`)

### OBS setup (v30+)

**Settings → Stream**

| Field | Value |
|---|---|
| Service | `WHIP` |
| Server | Your Cloudflare WHIP URL |
| Bearer Token | Your Cloudflare stream key |

**Settings → Output → Advanced → Streaming**

| Field | Value |
|---|---|
| Video Encoder | `x264` |
| Keyframe Interval | `1 s` |
| CPU Usage Preset | `veryfast` |
| Profile | `baseline` |
| Tune | `zerolatency` |
| Resolution | `512x512` |

**Settings → Video** — set output resolution to `512x512`

## Install

Open https://rswhitby.github.io/vibe-coat/ in Chrome on Android or Safari on iOS and use **Add to Home Screen**. The app shell is cached for offline launch.

## Usage

1. Allow camera access when prompted
2. Tap a color button to activate that chroma channel
3. Hold a colored object in front of the camera — it will be replaced by the stream for that color
4. Tap the button again to deactivate

## Vibe text pipeline

The app includes a text input field where participants type a "vibe" — a short phrase describing a mood, scene, or feeling. Submitting sends it as JSON over WebSocket to a TouchDesigner sketch:

```json
{"vibe": "user text"}
```

### Full pipeline

```
Phone UI  →  wss://vibe-coat-production.up.railway.app  →  TouchDesigner (local)  →  LLM  →  Daydream.live API  →  live visual
```

1. **Phone UI** — user types a vibe and taps Send (or hits Enter). The message is sent via WSS to the cloud relay on Railway.
2. **Relay** — `relay.js` runs on Railway and broadcasts incoming messages to all connected clients. Both the browser and TouchDesigner connect to it.
3. **TouchDesigner receives** — a WebSocket DAT in TD connects outbound to the Railway relay and receives the JSON messages. Each `vibe` value is appended to a Table DAT, building up a log of all submitted vibes.
4. **LLM aggregation** — a script in TD takes the last 5 entries from the table and sends them to an LLM with a system prompt that combines them into a single cohesive visual prompt (e.g. merging "golden fog", "deep ocean", "neon forest" into one descriptive scene).
5. **Daydream.live** — the combined prompt is sent to the Daydream.live API, which returns a live generative video stream. That stream feeds into the chroma-key overlay channels in the app.

### TouchDesigner setup

TD runs locally and connects outbound to the cloud relay — no port forwarding or firewall changes needed.

**1. Connect to the relay**

Add a **WebSocket DAT** and set:

| Parameter | Value |
|---|---|
| Active | On |
| Mode | Client |
| Network Address | `vibe-coat-production.up.railway.app` |
| Network Port | `443` |
| SSL | Enabled (TLS 1.2) |

Click **Active** to connect. Incoming messages will appear in the DAT.

**2. Parse incoming vibes**

Each message is JSON in this shape:

```json
{"vibe": "user text", "from": "ip address", "timestamp": "2026-04-02T17:00:00.000Z"}
```

Use a **DAT Execute** or **Script DAT** to parse the `vibe` field and append it to a **Table DAT**.

**3. Aggregate and generate**

Add a script that:
1. Reads the last 5 rows from the Table DAT
2. Sends them to an LLM with a system prompt to combine them into a single visual prompt
3. Passes the result to the Daydream.live API to update the live video stream

## Development

No build step. Install dependencies, then run the static file server and WebSocket relay locally:

```bash
npm install
```

**Serve the app:**

```bash
npm run serve
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**WebSocket relay** (required for the vibe/TouchDesigner integration):

```bash
npm run relay
```

This starts the relay on `ws://localhost:9980`. The app auto-detects localhost and connects to the local relay instead of the production one. Run both commands in separate terminals.

## Deployment

- **Static frontend** — GitHub Pages, deployed from the `main` branch root
- **WebSocket relay** — Railway, runs `npm start` (`node relay.js`), auto-exposes WSS via Railway's proxy
