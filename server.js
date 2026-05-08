const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname));

const rooms = {};

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function sendRoomUpdate(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit('room-update', {
    roomId,
    hostId: room.hostId,
    players: room.players,
    aiCount: room.aiCount,
  });
}

io.on('connection', (socket) => {
  console.log('client connected:', socket.id);

  socket.on('create-room', ({ name, aiCount }) => {
    const code = genRoomCode();
    rooms[code] = {
      hostId: socket.id,
      players: [{ id: socket.id, name }],
      aiCount: aiCount || 0,
      gameStarted: false,
    };
    socket.join(code);
    socket.emit('room-created', { roomId: code });
    sendRoomUpdate(code);
  });

  socket.on('join-room', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('join-error', '房间不存在'); return; }
    if (room.gameStarted) { socket.emit('join-error', '游戏已开始'); return; }
    if (room.players.find(p => p.id === socket.id)) { socket.emit('join-error', '已在房间中'); return; }
    room.players.push({ id: socket.id, name });
    socket.join(roomId);
    socket.emit('room-joined', { roomId });
    sendRoomUpdate(roomId);
  });

  socket.on('leave-room', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(roomId);
    if (room.players.length === 0) {
      delete rooms[roomId];
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }
      sendRoomUpdate(roomId);
    }
  });

  socket.on('set-ai-count', ({ roomId, aiCount }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    room.aiCount = aiCount;
    sendRoomUpdate(roomId);
  });

  socket.on('start-game', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 1) return;
    room.gameStarted = true;
    const shuffled = room.players.slice().sort(() => Math.random() - 0.5);
    io.to(roomId).emit('game-start', {
      players: shuffled.map((p, i) => ({ id: p.id, name: p.name, slot: i })),
      aiCount: room.aiCount,
    });
  });

  socket.on('game-action', ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;
    // Forward action to the host
    const host = io.sockets.sockets.get(room.hostId);
    if (host) host.emit('guest-action', { playerId: socket.id, action });
  });

  socket.on('game-state', ({ roomId, state }) => {
    // Host broadcasts game state to all guests
    socket.to(roomId).emit('game-sync', state);
  });

  socket.on('game-over', ({ roomId }) => {
    const room = rooms[roomId];
    if (room) {
      room.gameStarted = false;
      io.to(roomId).emit('back-to-lobby');
      sendRoomUpdate(roomId);
    }
  });

  socket.on('disconnect', () => {
    for (const [code, room] of Object.entries(rooms)) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) { delete rooms[code]; }
        else {
          if (room.hostId === socket.id) room.hostId = room.players[0].id;
          sendRoomUpdate(code);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
