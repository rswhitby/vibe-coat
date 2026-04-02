# Vibe Coat

A Progressive Web App that uses your phone camera to detect colored objects via chroma-keying, then replaces those color regions with live video streams.

## How it works

Point your camera at a red, green, blue, or yellow object. Tap the matching color button in the toolbar — the app replaces that color in the live camera feed with a video stream, composited in real time on a canvas.

## Features

- Full-screen camera viewfinder
- Real-time chroma-key compositing (HSV-based color matching)
- Two color channels: green, blue
- HLS video stream overlay per channel
- Overlay rotation support for landscape sources
- Vibe text input — sends requests to a TouchDesigner sketch via WebSocket
- Installable PWA (works offline, add to home screen)

## Tech stack

- Vanilla JS / HTML / CSS — no framework
- [hls.js](https://github.com/video-dev/hls.js/) for HLS stream playback
- Canvas 2D API for per-pixel compositing
- Service worker for app shell caching

## Install

Open in Chrome on Android or Safari on iOS and use **Add to Home Screen**. The app shell is cached for offline launch.

## Usage

1. Allow camera access when prompted
2. Tap a color button to activate that chroma channel
3. Hold a colored object in front of the camera — it will be replaced by the stream for that color
4. Tap the button again to deactivate

## TouchDesigner integration

The vibe input sends JSON over WebSocket to a TouchDesigner sketch:

```json
{"vibe": "user text"}
```

**Setup in TD:**
1. Add a **WebSocket DAT**
2. Set **Server Port** to `9980`
3. Enable the DAT — incoming vibes appear in the received data

To change the WebSocket endpoint, edit `WS_URL` at the top of `main.js`.

## Development

No build step. Install dependencies, then run the static file server and (optionally) the WebSocket relay:

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

This starts the WebSocket relay on port `9980`. Run both commands in separate terminals to get the full stack.

Alternatively, serve the files with any static server:

```bash
python -m http.server 3000
```
