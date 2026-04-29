// main.js

// ----- WebSocket config (change URL to point at your TouchDesigner sketch) -----
const WS_URL = location.hostname === 'localhost'
  ? 'ws://localhost:9980'
  : 'wss://vibe-coat-production.up.railway.app';

// ----- elements -----
const videoCam = document.getElementById("video-cam");
const canvas   = document.getElementById("output");
const ctx      = canvas.getContext("2d", { willReadFrequently: true });
const buttons  = document.querySelectorAll("#controls button");

// Always rotate overlays by this angle (90 or -90). Set to 0 to disable.
const OVERLAY_ROTATE_DEG = 0;

const streams = {
  green:  document.getElementById("video-green"),
  blue:   document.getElementById("video-blue"),
};

// ----- WebRTC WHEP playback -----
const WHEP_URL = 'https://customer-faum3k08z80qrv3z.cloudflarestream.com/4b0713bf32dbda7e64ebbf6e9a00ae21/webRTC/play';

async function setupWHEP(video, url) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    bundlePolicy: 'max-bundle',
  });

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = (e) => {
    if (!video.srcObject) {
      video.srcObject = e.streams[0];
      video.play().catch(console.warn);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // wait for ICE gathering (3s fallback)
  await new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve();
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') resolve();
    };
    setTimeout(resolve, 3000);
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription.sdp,
  });
  const body = await resp.text();
  if (!resp.ok) throw new Error(`WHEP ${resp.status}: ${body}`);
  await pc.setRemoteDescription({ type: 'answer', sdp: body });
  return pc;
}

Object.values(streams).forEach(video => {
  video.muted = true;
  video.playsInline = true;
  setupWHEP(video, WHEP_URL).catch(console.error);
});

// enabled flags + buttons
const enabled = { green: false, blue: false };

buttons.forEach(btn => {
  btn.addEventListener("click", () => {
    const color = btn.dataset.color;
    enabled[color] = !enabled[color];
    btn.classList.toggle("active", enabled[color]);

    const vid = streams[color];
    if (enabled[color]) {
      vid.muted = false;                // let audio through when active (optional)
      vid.play().catch(console.warn);
    } else {
      vid.pause();
      vid.muted = true;
    }
  });
});

// ----- splash sequence -----
const splash      = document.getElementById('splash');
const splashLines = splash.querySelector('.splash-lines');
const splashLogo  = document.getElementById('splash-logo');

let sequenceDone = false;
let cameraReady  = false;
let coatInterval = null;

const splashCoat = document.getElementById('splash-coat');

function startCoatColors() {
  splashCoat.style.color = `hsl(${Math.random() * 360 | 0}, 100%, 72%)`;
  coatInterval = setInterval(() => {
    splashCoat.style.color = `hsl(${Math.random() * 360 | 0}, 100%, 72%)`;
  }, 550);
}


function dismissSplash() {
  clearInterval(coatInterval);
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 1500); // matches transition duration
}

function tryDismiss() {
  if (sequenceDone && cameraReady) dismissSplash();
}

// Phase 1 — lines fade in via CSS (0.9s, 2.4s, 3.9s delays, 1.2s each)
// Line 3 fully visible at ~5.1s. Give 0.5s to read then fade them out.
setTimeout(() => splashLines.classList.add('fade-out'), 5600);
// Phase 2 — logo fades in after lines are gone (~6.3s), start color cycling
setTimeout(() => {
  splashLogo.classList.add('visible');
  startCoatColors();
}, 6300);
// Phase 3 — hold ~3s, then signal sequence done (~10.1s)
setTimeout(() => { sequenceDone = true; tryDismiss(); }, 10100);

// ----- camera -----
navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: "environment" } }
})
.then(camStream => {
  videoCam.srcObject = camStream;
  videoCam.play().catch(console.warn);

  videoCam.onloadedmetadata = () => {
    syncCanvasToCSS();
    cameraReady = true;
    tryDismiss();
    if ('requestVideoFrameCallback' in videoCam) {
      videoCam.requestVideoFrameCallback(renderFrame);
    } else {
      requestAnimationFrame(renderFrame);
    }
  };
})
.catch(err => {
  console.error("Camera error:", err);
  cameraReady = true;
  tryDismiss();
  alert(`Camera access failed: ${err.name}`);
});

// keep canvas pixels matching its CSS size
function syncCanvasToCSS() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth  * dpr || window.innerWidth  * dpr);
  const h = Math.round(canvas.clientHeight * dpr || window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', syncCanvasToCSS);
window.addEventListener('orientationchange', syncCanvasToCSS);

// ----- drawing helpers (cover fit + optional rotation) -----
function drawVideoCover(ctx, video, dstW, dstH, rotateDeg = 0) {
  const vw = video.videoWidth  || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return;

  ctx.save();

  if (rotateDeg % 180 !== 0) {
    // rotate about canvas center
    ctx.translate(dstW / 2, dstH / 2);
    ctx.rotate((rotateDeg * Math.PI) / 180);

    // after rotation, width/height swap for cover math
    const scale = Math.max(dstW / vh, dstH / vw);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
  } else {
    const scale = Math.max(dstW / vw, dstH / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (dstW - dw) / 2;
    const dy = (dstH - dh) / 2;
    ctx.drawImage(video, dx, dy, dw, dh);
  }

  ctx.restore();
}

// ----- snapshot -----
document.getElementById('btn-snapshot').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `vibe-coat-${Date.now()}.png`;
  a.click();
});

// ----- test mode -----
let testMode = false;
const btnTest = document.getElementById('btn-test');
btnTest.addEventListener('click', () => {
  testMode = !testMode;
  btnTest.classList.toggle('active', testMode);
});

// ----- render loop -----
function renderFrame() {
  // 1) draw camera (no rotation)
  drawVideoCover(ctx, videoCam, canvas.width, canvas.height, 0);

  // 2) composite enabled overlays; rotate when landscape
  const overlayRotate = OVERLAY_ROTATE_DEG;

  if (testMode) {
    drawVideoCover(ctx, streams.green, canvas.width, canvas.height, overlayRotate);
  } else {
    for (const color in enabled) {
      if (enabled[color]) applyChroma(streams[color], thresholds[color], overlayRotate);
    }
  }

  if ('requestVideoFrameCallback' in videoCam) {
    videoCam.requestVideoFrameCallback(renderFrame);
  } else {
    requestAnimationFrame(renderFrame);
  }
}

// ----- chroma key with rotated overlay -----
function applyChroma(srcVideo, t, rotateDeg) {
  const off = document.createElement("canvas");
  off.width  = canvas.width;
  off.height = canvas.height;
  const offCtx = off.getContext("2d", { willReadFrequently: true });

  // draw the overlay with cover-fit + optional rotation
  drawVideoCover(offCtx, srcVideo, off.width, off.height, rotateDeg);

  const bg = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const ov = offCtx.getImageData(0, 0, off.width, off.height);

  for (let i = 0; i < bg.data.length; i += 4) {
    const r = bg.data[i], g = bg.data[i + 1], b = bg.data[i + 2];
    if (matchColor({ r, g, b }, t)) {
      bg.data[i]     = ov.data[i];
      bg.data[i + 1] = ov.data[i + 1];
      bg.data[i + 2] = ov.data[i + 2];
      bg.data[i + 3] = ov.data[i + 3];
    }
  }
  ctx.putImageData(bg, 0, 0);
}

// ----- thresholds -----
const thresholds = {
  green: { hMin:110, hMax:170, sMin:0.4, sMax:1, vMin:0.3, vMax:1 },
  blue:  { hMin:210, hMax:240, sMin:0.4, sMax:1, vMin:0.3, vMax:1 },
};

// ----- settings panel -----
const btnSettings      = document.getElementById('btn-settings');
const settingsPanel    = document.getElementById('settings-panel');
const settingsBackdrop = document.getElementById('settings-backdrop');

function openSettings() {
  settingsPanel.classList.add('open');
  settingsPanel.setAttribute('aria-hidden', 'false');
  settingsBackdrop.classList.add('open');
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsPanel.setAttribute('aria-hidden', 'true');
  settingsBackdrop.classList.remove('open');
}

btnSettings.addEventListener('click', () =>
  settingsPanel.classList.contains('open') ? closeSettings() : openSettings()
);
settingsBackdrop.addEventListener('click', closeSettings);

// Wire each slider to its threshold key + readout
[
  { id: 'green-hmin', color: 'green', key: 'hMin', scale: 1,    fmt: v => Math.round(v).toString() },
  { id: 'green-hmax', color: 'green', key: 'hMax', scale: 1,    fmt: v => Math.round(v).toString() },
  { id: 'green-smin', color: 'green', key: 'sMin', scale: 0.01, fmt: v => v.toFixed(2) },
  { id: 'green-smax', color: 'green', key: 'sMax', scale: 0.01, fmt: v => v.toFixed(2) },
  { id: 'blue-hmin',  color: 'blue',  key: 'hMin', scale: 1,    fmt: v => Math.round(v).toString() },
  { id: 'blue-hmax',  color: 'blue',  key: 'hMax', scale: 1,    fmt: v => Math.round(v).toString() },
  { id: 'blue-smin',  color: 'blue',  key: 'sMin', scale: 0.01, fmt: v => v.toFixed(2) },
  { id: 'blue-smax',  color: 'blue',  key: 'sMax', scale: 0.01, fmt: v => v.toFixed(2) },
].forEach(({ id, color, key, scale, fmt }) => {
  const slider  = document.getElementById(id);
  const readout = document.getElementById(id + '-val');
  slider.addEventListener('input', () => {
    const val = Number(slider.value) * scale;
    thresholds[color][key] = val;
    readout.textContent = fmt(val);
  });
});

// ----- helpers -----
function matchColor({ r, g, b }, { hMin, hMax, sMin, sMax, vMin, vMax }) {
  const { h, s, v } = rgbToHsv(r / 255, g / 255, b / 255);
  const inHue = hMin <= hMax ? (h >= hMin && h <= hMax) : (h >= hMin || h <= hMax);
  return inHue && s >= sMin && s <= sMax && v >= vMin && v <= vMax;
}
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = max ? d / max : 0, v = max;
  if (d) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s, v };
}

// ----- WebSocket to TouchDesigner -----
const vibeInput = document.getElementById('vibe-input');
const vibeSend  = document.getElementById('vibe-send');
let ws = null;

function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    vibeSend.classList.remove('disconnected');
  });

  ws.addEventListener('close', () => {
    vibeSend.classList.add('disconnected');
    setTimeout(connectWS, 3000); // auto-reconnect
  });

  ws.addEventListener('error', () => {
    ws.close(); // triggers the close handler above
  });
}

function sendVibe(text) {
  text = text.trim();
  if (!text) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ vibe: text }));
  }
  vibeInput.value = '';
}

vibeSend.addEventListener('click', () => sendVibe(vibeInput.value));
vibeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendVibe(vibeInput.value);
});

connectWS();
