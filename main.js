// main.js — Vibe Coating

// ----- WebSocket config (change URL to point at your TouchDesigner sketch) -----
const WS_URL = location.hostname === 'localhost'
  ? 'ws://localhost:9980'
  : 'wss://vibe-coat-production.up.railway.app';

// ----- elements -----
const videoCam = document.getElementById("video-cam");
const canvas   = document.getElementById("output");
const buttons  = document.querySelectorAll("#controls button");

// Always rotate overlays by this angle (90 or -90). Set to 0 to disable.
const OVERLAY_ROTATE_DEG = 0;

const streams = {
  green:  document.getElementById("video-green"),
  blue:   document.getElementById("video-blue"),
};

// ----- thresholds (tuned to the physical fabric — not the UI colours) -----
const thresholds = {
  green: { hMin:110, hMax:170, sMin:0.4, sMax:1, vMin:0.3, vMax:1 },
  blue:  { hMin:210, hMax:240, sMin:0.4, sMax:1, vMin:0.3, vMax:1 },
};

const enabled = { green: false, blue: false };
let testMode = false;

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

// =====================================================================
//  Renderer — WebGL, with a 2D canvas fallback
// =====================================================================
//
//  The 2D path had to pull the whole frame back off the GPU with
//  getImageData, run the HSV test in JS, then push it back with
//  putImageData — about 30 MB of traffic per colour per frame at DPR.
//  The shader does the same test per-fragment with no readback at all.

const GL_OPTS = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,   // needed for the snapshot button
  powerPreference: 'high-performance',
};

let gl = null;
let ctx2d = null;

try {
  gl = canvas.getContext('webgl2', GL_OPTS) || canvas.getContext('webgl', GL_OPTS);
} catch { gl = null; }

if (!gl) {
  console.warn('WebGL unavailable — falling back to the 2D chroma path');
  ctx2d = canvas.getContext('2d', { willReadFrequently: true });
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;

uniform sampler2D uCam, uGreen, uBlue;
uniform vec4 uCamST, uGreenST, uBlueST;
uniform mat2 uOvRot;
uniform vec3 uGreenMin, uGreenMax, uBlueMin, uBlueMax;
uniform float uGreenOn, uBlueOn, uTest;

vec3 rgb2hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d  = mx - mn;
  float h  = 0.0;
  if (d > 0.0001) {
    if (mx == c.r)      h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else                h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
  }
  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx);
}

bool inRange(vec3 hsv, vec3 lo, vec3 hi) {
  bool inH = lo.x <= hi.x
    ? (hsv.x >= lo.x && hsv.x <= hi.x)
    : (hsv.x >= lo.x || hsv.x <= hi.x);
  return inH && hsv.y >= lo.y && hsv.y <= hi.y && hsv.z >= lo.z && hsv.z <= hi.z;
}

vec2 mapUV(vec2 uv, vec4 st, mat2 rot) {
  vec2 c = rot * (uv - 0.5) + 0.5;
  return c * st.xy + st.zw;
}

void main() {
  mat2 I = mat2(1.0, 0.0, 0.0, 1.0);
  vec3 cam = texture2D(uCam, mapUV(vUv, uCamST, I)).rgb;

  if (uTest > 0.5) {
    gl_FragColor = vec4(texture2D(uGreen, mapUV(vUv, uGreenST, uOvRot)).rgb, 1.0);
    return;
  }

  vec3 hsv = rgb2hsv(cam);
  vec3 col = cam;

  if (uGreenOn > 0.5 && inRange(hsv, uGreenMin, uGreenMax))
    col = texture2D(uGreen, mapUV(vUv, uGreenST, uOvRot)).rgb;
  if (uBlueOn > 0.5 && inRange(hsv, uBlueMin, uBlueMax))
    col = texture2D(uBlue, mapUV(vUv, uBlueST, uOvRot)).rgb;

  gl_FragColor = vec4(col, 1.0);
}`;

let prog = null, uni = {}, texCam = null, texGreen = null, texBlue = null;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
  }
  return s;
}

function makeTexture() {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  // NPOT-safe: clamp + linear, no mipmaps
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 0, 255]));
  return t;
}

function initGL() {
  prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW); // full-screen triangle
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  for (const n of ['uCam','uGreen','uBlue','uCamST','uGreenST','uBlueST','uOvRot',
                   'uGreenMin','uGreenMax','uBlueMin','uBlueMax',
                   'uGreenOn','uBlueOn','uTest']) {
    uni[n] = gl.getUniformLocation(prog, n);
  }

  gl.uniform1i(uni.uCam, 0);
  gl.uniform1i(uni.uGreen, 1);
  gl.uniform1i(uni.uBlue, 2);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  texCam   = makeTexture();
  texGreen = makeTexture();
  texBlue  = makeTexture();
}

if (gl) {
  try {
    initGL();
  } catch (err) {
    console.error('WebGL init failed, falling back to 2D:', err);
    gl = null;
    ctx2d = canvas.getContext('2d', { willReadFrequently: true });
  }
}

// Cover-fit as a scale/offset pair in texture space
function coverST(texW, texH, viewW, viewH, rotated) {
  if (!texW || !texH || !viewW || !viewH) return [1, 1, 0, 0];
  if (rotated) { const t = texW; texW = texH; texH = t; }
  const texA  = texW / texH;
  const viewA = viewW / viewH;
  if (viewA > texA) {
    const sy = texA / viewA;
    return [1, sy, 0, (1 - sy) / 2];
  }
  const sx = viewA / texA;
  return [sx, 1, (1 - sx) / 2, 0];
}

function uploadVideo(tex, unit, video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return false;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  return true;
}

function renderGL() {
  const w = canvas.width, h = canvas.height;
  gl.viewport(0, 0, w, h);

  const rot = OVERLAY_ROTATE_DEG % 180 !== 0;
  const a = (-OVERLAY_ROTATE_DEG * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  gl.uniformMatrix2fv(uni.uOvRot, false, [c, s, -s, c]);

  uploadVideo(texCam, 0, videoCam);
  const gOK = uploadVideo(texGreen, 1, streams.green);
  const bOK = uploadVideo(texBlue,  2, streams.blue);

  gl.uniform4fv(uni.uCamST,
    coverST(videoCam.videoWidth, videoCam.videoHeight, w, h, false));
  gl.uniform4fv(uni.uGreenST,
    coverST(streams.green.videoWidth, streams.green.videoHeight, w, h, rot));
  gl.uniform4fv(uni.uBlueST,
    coverST(streams.blue.videoWidth, streams.blue.videoHeight, w, h, rot));

  const g = thresholds.green, b = thresholds.blue;
  gl.uniform3f(uni.uGreenMin, g.hMin, g.sMin, g.vMin);
  gl.uniform3f(uni.uGreenMax, g.hMax, g.sMax, g.vMax);
  gl.uniform3f(uni.uBlueMin,  b.hMin, b.sMin, b.vMin);
  gl.uniform3f(uni.uBlueMax,  b.hMax, b.sMax, b.vMax);

  gl.uniform1f(uni.uGreenOn, enabled.green && gOK ? 1 : 0);
  gl.uniform1f(uni.uBlueOn,  enabled.blue  && bOK ? 1 : 0);
  gl.uniform1f(uni.uTest,    testMode && gOK ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- 2D fallback ----------

function drawVideoCover(c2, video, dstW, dstH, rotateDeg = 0) {
  const vw = video.videoWidth  || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return;

  c2.save();
  if (rotateDeg % 180 !== 0) {
    c2.translate(dstW / 2, dstH / 2);
    c2.rotate((rotateDeg * Math.PI) / 180);
    const scale = Math.max(dstW / vh, dstH / vw);
    c2.drawImage(video, -vw * scale / 2, -vh * scale / 2, vw * scale, vh * scale);
  } else {
    const scale = Math.max(dstW / vw, dstH / vh);
    const dw = vw * scale, dh = vh * scale;
    c2.drawImage(video, (dstW - dw) / 2, (dstH - dh) / 2, dw, dh);
  }
  c2.restore();
}

const fbOff = { green: null, blue: null };

function applyChroma2D(color, rotateDeg) {
  if (!fbOff[color]) fbOff[color] = document.createElement('canvas');
  const off = fbOff[color];
  if (off.width !== canvas.width || off.height !== canvas.height) {
    off.width = canvas.width; off.height = canvas.height;
  }
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  drawVideoCover(offCtx, streams[color], off.width, off.height, rotateDeg);

  const t  = thresholds[color];
  const bg = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
  const ov = offCtx.getImageData(0, 0, off.width, off.height);
  const bd = bg.data, od = ov.data;

  for (let i = 0; i < bd.length; i += 4) {
    const r = bd[i] / 255, g = bd[i+1] / 255, b = bd[i+2] / 255;
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (mx < t.vMin || mx > t.vMax) continue;
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const d = mx - mn;
    const s = mx ? d / mx : 0;
    if (s < t.sMin || s > t.sMax) continue;
    let h = 0;
    if (d) {
      if (mx === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (mx === g) h = ((b - r) / d + 2) * 60;
      else               h = ((r - g) / d + 4) * 60;
    }
    const inH = t.hMin <= t.hMax
      ? (h >= t.hMin && h <= t.hMax)
      : (h >= t.hMin || h <= t.hMax);
    if (!inH) continue;
    bd[i] = od[i]; bd[i+1] = od[i+1]; bd[i+2] = od[i+2]; bd[i+3] = od[i+3];
  }
  ctx2d.putImageData(bg, 0, 0);
}

function render2D() {
  drawVideoCover(ctx2d, videoCam, canvas.width, canvas.height, 0);
  if (testMode) {
    drawVideoCover(ctx2d, streams.green, canvas.width, canvas.height, OVERLAY_ROTATE_DEG);
  } else {
    for (const color in enabled) {
      if (enabled[color]) applyChroma2D(color, OVERLAY_ROTATE_DEG);
    }
  }
}

// =====================================================================
//  Router
// =====================================================================

const views = {
  home:     document.getElementById('view-home'),
  camera:   document.getElementById('view-camera'),
  menu:     document.getElementById('view-menu'),
  about:    document.getElementById('view-about'),
  starters: document.getElementById('view-starters'),
  current:  document.getElementById('view-current'),
  credits:  document.getElementById('view-credits'),
};

const btnMenu = document.getElementById('btn-menu');
const toolbar = document.getElementById('toolbar');
const utility = document.getElementById('utility');

const CIRCLE_VIEWS = new Set(['home', 'camera']);

let currentView  = 'home';
let cameraActive = false;

function showView(name) {
  if (!views[name]) name = cameraActive ? 'camera' : 'home';
  currentView = name;

  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle('is-active', key === name);
  }

  canvas.classList.toggle('is-live', name === 'camera' && cameraActive);
  toolbar.classList.toggle('is-visible', CIRCLE_VIEWS.has(name));
  utility.classList.toggle('is-visible', name !== 'menu');

  btnMenu.classList.toggle('is-open', name === 'menu');
  btnMenu.setAttribute('aria-expanded', String(name === 'menu'));

  if (name === 'current') renderVibes();
}

function resolveHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw || raw === 'give') return cameraActive ? 'camera' : 'home';
  return raw;
}

function navigate(name) {
  const target = name === 'give' ? (cameraActive ? 'camera' : 'home') : name;
  if (('#' + name) !== location.hash) {
    location.hash = name;
    return;
  }
  showView(target);
}

window.addEventListener('hashchange', () => showView(resolveHash()));

btnMenu.addEventListener('click', () => {
  navigate(currentView === 'menu' ? 'give' : 'menu');
});

// =====================================================================
//  Camera — permission deferred until first circle tap
// =====================================================================

const homeHint = document.getElementById('home-hint');

function syncCanvasToCSS() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round((canvas.clientWidth  || window.innerWidth)  * dpr);
  const h = Math.round((canvas.clientHeight || window.innerHeight) * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', syncCanvasToCSS);
window.addEventListener('orientationchange', syncCanvasToCSS);

async function startCamera() {
  if (cameraActive) return true;
  homeHint.textContent = 'Requesting camera…';

  try {
    const camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });

    videoCam.srcObject = camStream;
    await videoCam.play().catch(console.warn);

    await new Promise(resolve => {
      if (videoCam.readyState >= 1) return resolve();
      videoCam.onloadedmetadata = resolve;
    });

    syncCanvasToCSS();
    cameraActive = true;
    homeHint.textContent = '';
    scheduleFrame();
    return true;

  } catch (err) {
    console.error('Camera error:', err);
    homeHint.textContent =
      err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Enable it in your browser settings, then tap a circle again.'
        : `Camera unavailable (${err.name}).`;
    return false;
  }
}

// ----- render loop -----
function scheduleFrame() {
  if ('requestVideoFrameCallback' in videoCam) {
    videoCam.requestVideoFrameCallback(renderFrame);
  } else {
    requestAnimationFrame(renderFrame);
  }
}

function renderFrame() {
  // Idle whenever the camera view isn't on screen
  if (currentView !== 'camera' || !cameraActive) {
    setTimeout(scheduleFrame, 200);
    return;
  }
  if (gl) renderGL(); else render2D();
  scheduleFrame();
}

// ----- colour circles -----
function toggleColor(color, btn) {
  enabled[color] = !enabled[color];
  btn.classList.toggle('active', enabled[color]);

  const vid = streams[color];
  if (enabled[color]) {
    vid.muted = false;
    vid.play().catch(console.warn);
  } else {
    vid.pause();
    vid.muted = true;
  }
}

buttons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const color = btn.dataset.color;

    if (currentView === 'home') {
      sendVibe(vibeInput.value);
      const ok = await startCamera();
      if (!ok) return;
      toggleColor(color, btn);
      navigate('camera');
      return;
    }

    toggleColor(color, btn);
  });
});

// ----- snapshot -----
document.getElementById('btn-snapshot').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `vibe-coating-${Date.now()}.png`;
  a.click();
});

// ----- test mode -----
const btnTest = document.getElementById('btn-test');
btnTest.addEventListener('click', () => {
  testMode = !testMode;
  btnTest.classList.toggle('active', testMode);
});

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

// =====================================================================
//  Current Vibes — accumulated client-side
// =====================================================================

const MAX_VIBES = 12;
const latestVibes = [];
const elLatest     = document.getElementById('latest-vibes');
const elAtmosBlock = document.getElementById('atmosphere-block');
const elAtmosText  = document.getElementById('atmosphere-text');

function addVibe(text) {
  text = String(text || '').trim();
  if (!text) return;
  latestVibes.unshift(text);
  if (latestVibes.length > MAX_VIBES) latestVibes.length = MAX_VIBES;
  if (currentView === 'current') renderVibes();
}

function renderVibes() {
  if (!latestVibes.length) {
    elLatest.textContent = 'waiting for vibes…';
    elLatest.classList.add('muted');
    return;
  }
  elLatest.textContent = latestVibes.join(' • ');
  elLatest.classList.remove('muted');
}

function setAtmosphere(text) {
  text = String(text || '').trim();
  if (!text) return;
  elAtmosText.textContent = text;
  elAtmosBlock.hidden = false;
}

// =====================================================================
//  WebSocket
// =====================================================================

const vibeInput = document.getElementById('vibe-input');
let ws = null;

function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('message', evt => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }

    // Sent once on connect. Replaces the list rather than appending, so a
    // reconnecting phone doesn't duplicate its own earlier submissions.
    if (msg.type === 'history') {
      if (Array.isArray(msg.vibes)) {
        latestVibes.length = 0;
        msg.vibes.slice(-MAX_VIBES).reverse()
          .forEach(v => { if (typeof v === 'string' && v.trim()) latestVibes.push(v.trim()); });
        if (currentView === 'current') renderVibes();
      }
      if (msg.atmosphere) setAtmosphere(msg.atmosphere);
      return;
    }

    if (msg.type === 'atmosphere' || typeof msg.atmosphere === 'string') {
      setAtmosphere(msg.text || msg.atmosphere);
      return;
    }
    if (typeof msg.vibe === 'string') addVibe(msg.vibe);
  });

  ws.addEventListener('close', () => setTimeout(connectWS, 3000));
  ws.addEventListener('error', () => ws.close());
}

function sendVibe(text) {
  text = String(text || '').trim();
  if (!text) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'vibe', vibe: text }));
  }
  addVibe(text);          // relay never echoes to the sender
  vibeInput.value = '';
}

vibeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); vibeInput.blur(); }
});

connectWS();

// ----- boot -----
syncCanvasToCSS();
showView(resolveHash());
