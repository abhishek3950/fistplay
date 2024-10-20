const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Root route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Player matching logic
let waitingPlayers = [];
const rematchRequests = {};

function matchmaking(socket) {
  console.log(`${socket.id} is entering matchmaking`);

  // Remove the socket from waitingPlayers if already present
  waitingPlayers = waitingPlayers.filter(id => id !== socket.id);

  // Find an opponent who is not the current socket
  const opponentId = waitingPlayers.find(id => id !== socket.id);

  if (opponentId) {
    // Remove the opponent from the waiting list
    waitingPlayers = waitingPlayers.filter(id => id !== opponentId);

    console.log(`Matching ${socket.id} with ${opponentId}`);

    // Notify both players of the match
    io.to(socket.id).emit('matchFound', { opponent: opponentId });
    io.to(opponentId).emit('matchFound', { opponent: socket.id });

    // WebRTC connection setup
    io.to(socket.id).emit('startPeerConnection', { isInitiator: true, opponent: opponentId });
    io.to(opponentId).emit('startPeerConnection', { isInitiator: false, opponent: socket.id });

    socket.opponent = opponentId;
    const opponentSocket = io.sockets.sockets.get(opponentId);
    opponentSocket.opponent = socket.id;

    // Start the game countdown for both players
    io.to(socket.id).emit('startCountdown');
    io.to(opponentId).emit('startCountdown');
  } else {
    console.log(`${socket.id} is waiting for an opponent.`);
    waitingPlayers.push(socket.id);
    socket.emit('waitingForOpponent');
  }
}


io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('readyToPlay', () => {
    matchmaking(socket);
  });

  // Rematch handling
  socket.on('requestRematch', () => {
    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        if (rematchRequests[socket.opponent]) {
          // Both players have requested a rematch
          io.to(socket.id).emit('rematchAgreed');
          io.to(socket.opponent).emit('rematchAgreed');
          rematchRequests[socket.opponent] = false;
          rematchRequests[socket.id] = false;

          // Start the countdown for both players
          io.to(socket.id).emit('startCountdown');
          io.to(socket.opponent).emit('startCountdown');
        } else {
          rematchRequests[socket.id] = true;
          socket.emit('waitingForRematch');
          opponentSocket.emit('opponentWantsRematch');
        }
      } else {
        // Opponent is disconnected or has left
        socket.emit('opponentLeft', 'Your opponent has left the game.');
        socket.opponent = null;
        delete rematchRequests[socket.id];
        matchmaking(socket); // Re-enter matchmaking
      }
    } else {
      // No opponent connected
      socket.emit('opponentLeft', 'Your opponent has left the game.');
      matchmaking(socket); // Re-enter matchmaking
    }
  });

  // New opponent handling
  socket.on('findNewOpponent', () => {
    console.log(`${socket.id} selected new opponent`);

    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        opponentSocket.emit('opponentLeft', 'Your opponent has decided to find a new opponent.');
        opponentSocket.opponent = null;
        delete rematchRequests[opponentSocket.id];
        matchmaking(opponentSocket); // Re-enter opponent into matchmaking
      }
      socket.opponent = null;
    }

    // Remove rematch request if any
    delete rematchRequests[socket.id];

    // Re-enter this player into matchmaking
    matchmaking(socket);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        opponentSocket.emit('opponentDisconnected', 'Your opponent has disconnected.');
        opponentSocket.opponent = null;
        delete rematchRequests[opponentSocket.id];
        matchmaking(opponentSocket); // Re-enter opponent into matchmaking
      }
    }

    // Remove from waitingPlayers if present
    waitingPlayers = waitingPlayers.filter(id => id !== socket.id);

    delete rematchRequests[socket.id];
  });

  // WebRTC signaling
  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
