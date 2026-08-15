// relay.js — WebSocket relay between the browser app and TouchDesigner
// Run with: node relay.js
//
// Browser connects and sends   {"type":"vibe","vibe":"golden fog"}
// TouchDesigner connects and sends {"type":"atmosphere","text":"..."}
//
// Messages are stamped with the sender's ip + a timestamp, then broadcast
// to every OTHER client. The relay also keeps a short history so that a
// phone opening the app cold sees the current state instead of an empty
// screen — see HISTORY below.

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 9980;
const MAX_VIBES = 12;          // how many recent vibes to retain
const MAX_MESSAGE = 4096;      // ignore anything larger

// ----- history -----
// Without this the relay is stateless, so anyone who connects between
// broadcasts sees nothing until the next message arrives. At an
// installation that is most visitors.
const recentVibes = [];        // oldest first, plain strings
let lastAtmosphere = null;     // plain string
let lastState = null;          // whole stamped {type:'state'} message from TD

// NOTE: all of this is in-process memory. It resets on every deploy and
// on any Railway restart. TouchDesigner re-sends its full state whenever
// the prompt changes, so the gap closes on the next agent run.

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`Relay listening on port ${PORT}`);
});

function historyPayload() {
  return JSON.stringify({
    type: 'history',
    vibes: recentVibes,
    atmosphere: lastAtmosphere,
  });
}

wss.on('connection', (socket, req) => {
  const id = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log(`[+] connected   ${id}  (${wss.clients.size} total)`);

  // Bring the newcomer up to date. Sent as one message the client
  // replaces its list with, rather than replaying each vibe — that way a
  // reconnecting phone doesn't receive its own earlier submissions back
  // and end up with duplicates.
  // TouchDesigner's state is authoritative when we have it; the locally
  // accumulated history is only a fallback for when TD hasn't sent yet.
  try {
    if (lastState) socket.send(lastState);
    else if (recentVibes.length || lastAtmosphere) socket.send(historyPayload());
  } catch { /* socket already gone */ }

  socket.on('message', (data) => {
    const text = data.toString();
    if (text.length > MAX_MESSAGE) return;

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    payload.from      = req.socket.remoteAddress;
    payload.timestamp = new Date().toISOString();

    const stamped = JSON.stringify(payload);

    // Record for late joiners
    if (payload.type === 'state') {
      lastState = stamped;
      console.log(`[=] state       ${(payload.vibes || []).length} vibes, ` +
                  `atmosphere ${payload.atmosphere ? 'set' : 'empty'}`);
    } else if (payload.type === 'atmosphere' || typeof payload.atmosphere === 'string') {
      const atmos = payload.text || payload.atmosphere;
      if (typeof atmos === 'string' && atmos.trim()) {
        lastAtmosphere = atmos.trim();
        console.log(`[~] atmosphere  ${lastAtmosphere}`);
      }
    } else if (typeof payload.vibe === 'string' && payload.vibe.trim()) {
      recentVibes.push(payload.vibe.trim());
      while (recentVibes.length > MAX_VIBES) recentVibes.shift();
      console.log(`[>] ${id}  ${payload.vibe.trim()}`);
    }

    // Broadcast to everyone except the sender
    wss.clients.forEach(client => {
      if (client !== socket && client.readyState === client.OPEN) {
        client.send(stamped);
      }
    });
  });

  socket.on('close', () => {
    console.log(`[-] disconnected ${id}  (${wss.clients.size} total)`);
  });

  socket.on('error', (err) => {
    console.warn(`[!] socket error ${id}: ${err.message}`);
  });
});
