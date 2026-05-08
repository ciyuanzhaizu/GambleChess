class Network {
  constructor() {
    this.socket = null;
    this.callbacks = {};
    this.roomId = null;
    this.isHost = false;
    this.myId = null;
    this.isMultiplayer = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io({ transports: ['websocket'] });
      this.socket.on('connect', () => {
        this.myId = this.socket.id;
        resolve();
      });
      this.socket.on('connect_error', reject);

      this.socket.on('room-created', ({ roomId }) => {
        this.roomId = roomId;
        this.isHost = true;
        this._trigger('room-created', roomId);
      });
      this.socket.on('room-joined', ({ roomId }) => {
        this.roomId = roomId;
        this.isHost = false;
        this._trigger('room-joined', roomId);
      });
      this.socket.on('join-error', (msg) => { this._trigger('join-error', msg); });
      this.socket.on('room-update', (data) => { this._trigger('room-update', data); });
      this.socket.on('game-start', (data) => { this._trigger('game-start', data); });
      this.socket.on('game-sync', (state) => { this._trigger('game-sync', state); });
      this.socket.on('guest-action', ({ playerId, action }) => {
        this._trigger('guest-action', { playerId, action });
      });
      this.socket.on('back-to-lobby', () => { this._trigger('back-to-lobby'); });
    });
  }

  createRoom(name, aiCount) {
    this.socket.emit('create-room', { name, aiCount: aiCount || 0 });
  }

  joinRoom(roomId, name) {
    this.socket.emit('join-room', { roomId: roomId.toUpperCase(), name });
  }

  leaveRoom() {
    this.socket.emit('leave-room', { roomId: this.roomId });
    this.roomId = null;
    this.isHost = false;
  }

  setAiCount(aiCount) {
    this.socket.emit('set-ai-count', { roomId: this.roomId, aiCount });
  }

  startGame() {
    this.socket.emit('start-game', { roomId: this.roomId });
  }

  sendAction(action) {
    this.socket.emit('game-action', { roomId: this.roomId, action });
  }

  broadcastState(state) {
    this.socket.emit('game-state', { roomId: this.roomId, state });
  }

  signalGameOver() {
    this.socket.emit('game-over', { roomId: this.roomId });
  }

  on(event, callback) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(callback);
  }

  _trigger(event, ...args) {
    (this.callbacks[event] || []).forEach(cb => cb(...args));
  }
}
