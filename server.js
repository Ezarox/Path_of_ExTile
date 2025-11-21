/**
 * Tiny WebSocket signaling server for 1v1 games.
 * Run: `npm install ws` then `node server.js`
 *
 * Messages are JSON:
 * { type: "create" } -> { type:"created", room }
 * { type: "join", room }
 * { type: "ready", room }
 * { type: "maze", room, payload: { grid, special } }
 * Server emits: "joined", "peer-joined", "peer-left", "ready", "start", "maze", "error"
 */
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const COUNTDOWN_SECONDS = 60;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

/** @type {Record<string, {players: Set<WebSocket>, ready: Set<WebSocket>}>} */
const rooms = {};

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(room, msg) {
  (rooms[room]?.players || []).forEach((ws) => send(ws, msg));
}

function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

wss.on("connection", (ws) => {
  let currentRoom = null;

  ws.on("message", (data) => {
    let msg = null;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      send(ws, { type: "error", error: "Invalid JSON" });
      return;
    }
    const { type } = msg || {};
    if (type === "create") {
      currentRoom = makeRoomCode();
      rooms[currentRoom] = { players: new Set([ws]), ready: new Set() };
      send(ws, { type: "created", room: currentRoom });
      return;
    }
    if (type === "join") {
      const room = msg.room;
      if (!room || !rooms[room]) {
        send(ws, { type: "error", error: "Room not found" });
        return;
      }
      if (rooms[room].players.size >= 2) {
        send(ws, { type: "error", error: "Room full" });
        return;
      }
      currentRoom = room;
      rooms[room].players.add(ws);
      rooms[room].ready.delete(ws);
      send(ws, { type: "joined", room });
      broadcast(room, { type: "peer-joined" });
      return;
    }
    if (!currentRoom || !rooms[currentRoom]) {
      send(ws, { type: "error", error: "Join or create a room first" });
      return;
    }
    const roomState = rooms[currentRoom];
    if (!roomState.players.has(ws)) {
      roomState.players.add(ws);
    }
    if (type === "ready") {
      roomState.ready.add(ws);
      broadcast(currentRoom, { type: "ready", count: roomState.ready.size });
      if (roomState.ready.size === roomState.players.size && roomState.players.size === 2) {
        const seed = Math.floor(Math.random() * 1e9).toString();
        const startTime = Date.now() + 4000; // 4s buffer before build starts
        broadcast(currentRoom, {
          type: "start",
          startsAt: startTime,
          buildSeconds: COUNTDOWN_SECONDS,
          seed
        });
        roomState.ready.clear();
      }
      return;
    }
    if (type === "maze") {
      broadcast(currentRoom, { type: "maze", payload: msg.payload });
      return;
    }
    send(ws, { type: "error", error: "Unknown message type" });
  });

  ws.on("close", () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const roomState = rooms[currentRoom];
    roomState.players.delete(ws);
    roomState.ready.delete(ws);
    broadcast(currentRoom, { type: "peer-left" });
    if (roomState.players.size === 0) delete rooms[currentRoom];
  });
});

server.listen(PORT, () => {
  console.log(`WS signaling server listening on ${PORT}`);
});
