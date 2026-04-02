// relay.js — WebSocket relay between the browser app and TouchDesigner
// Run with: node relay.js
// Browser connects to ws://localhost:9980  (sends vibes)
// TouchDesigner connects to ws://localhost:9980  (receives vibes)

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 9980;
const wss = new WebSocketServer({ port: PORT });

console.log(`Relay listening on ws://localhost:${PORT}`);

wss.on('connection', (socket, req) => {
  const id = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log(`[+] connected   ${id}  (${wss.clients.size} total)`);

  socket.on('message', (data) => {
    const text = data.toString();
    console.log(`[>] ${id}  ${text}`);

    // Parse incoming JSON and stamp with ip + timestamp before forwarding
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    payload.from      = req.socket.remoteAddress;
    payload.timestamp = new Date().toISOString();

    const stamped = JSON.stringify(payload);

    wss.clients.forEach(client => {
      if (client !== socket && client.readyState === client.OPEN) {
        client.send(stamped);
      }
    });
  });

  socket.on('close', () => {
    console.log(`[-] disconnected ${id}  (${wss.clients.size} total)`);
  });
});
