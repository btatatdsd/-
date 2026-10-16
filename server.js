const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map(); // code -> { driver, navigator }

function genCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create') {
      const code = genCode();
      ws.roomCode = code;
      ws.role = 'driver';
      rooms.set(code, { driver: ws, navigator: null });
      send(ws, { type: 'created', code });
      console.log(`[+] Room ${code} created`);
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code).trim();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: 'الغرفة ما كاينة. تحقق من الكود.' });
        return;
      }
      if (room.navigator) {
        send(ws, { type: 'error', message: 'الغرفة عامرة.' });
        return;
      }
      ws.roomCode = code;
      ws.role = 'navigator';
      room.navigator = ws;
      send(ws, { type: 'joined', code });
      send(room.driver, { type: 'ready' });
      send(room.navigator, { type: 'ready' });
      console.log(`[+] Room ${code} joined`);
      return;
    }

    // Relay all other messages to peer
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const peer = room.driver === ws ? room.navigator : room.driver;
    send(peer, msg);
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const peer = room.driver === ws ? room.navigator : room.driver;
    send(peer, { type: 'peerLeft' });
    if (room.driver === ws) room.driver = null;
    if (room.navigator === ws) room.navigator = null;
    if (!room.driver && !room.navigator) {
      rooms.delete(ws.roomCode);
      console.log(`[-] Room ${ws.roomCode} deleted`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚗 Co-Drive running on http://localhost:${PORT}`);
});
