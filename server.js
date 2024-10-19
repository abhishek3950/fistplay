const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Root route for testing if the server is running
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Player matching logic
let waitingPlayer = null;
const playerMoves = {};
const rematchRequests = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Player is ready to play
  socket.on('readyToPlay', () => {
    console.log(`${socket.id} is ready to play`);

    // Ensure the player does not match with themselves
    if (waitingPlayer && waitingPlayer !== socket.id) {
      const opponent = waitingPlayer;
      waitingPlayer = null;

      console.log(`Matching ${socket.id} with ${opponent}`);

      io.to(socket.id).emit('matchFound', { opponent });
      io.to(opponent).emit('matchFound', { opponent: socket.id });

      // Start the WebRTC connection
      io.to(socket.id).emit('startPeerConnection', { isInitiator: true, opponent });
      io.to(opponent).emit('startPeerConnection', { isInitiator: false, opponent: socket.id });

      // Save opponents for each player
      socket.opponent = opponent;
      io.sockets.sockets.get(opponent).opponent = socket.id;

      // Start countdown for both players
      io.to(socket.id).emit('startCountdown');
      io.to(opponent).emit('startCountdown');
    } else {
      console.log(`${socket.id} is waiting for an opponent.`);
      waitingPlayer = socket.id;
      socket.emit('waitingForOpponent');
    }
  });

  // Handle new opponent request
 // Handle new opponent request
socket.on('findNewOpponent', () => {
  console.log(`${socket.id} requested a new opponent`);

  if (socket.opponent) {
    io.to(socket.opponent).emit('opponentDisconnected', 'Your opponent found a new opponent. Returning to matchmaking.');

    // Clear the opponent reference for both players
    const opponentSocket = io.sockets.sockets.get(socket.opponent);
    if (opponentSocket) {
      opponentSocket.opponent = null;
      opponentSocket.emit('readyToPlay');  // Re-add opponent to matchmaking
    }

    socket.opponent = null;  // Clear the current player's opponent
  }

  // Re-add this player to the matchmaking queue
  if (waitingPlayer) {
    const newOpponent = waitingPlayer;
    waitingPlayer = null;

    console.log(`Matching ${socket.id} with ${newOpponent}`);

    io.to(socket.id).emit('matchFound', { opponent: newOpponent });
    io.to(newOpponent).emit('matchFound', { opponent: socket.id });

    io.to(socket.id).emit('startPeerConnection', { isInitiator: true, opponent: newOpponent });
    io.to(newOpponent).emit('startPeerConnection', { isInitiator: false, opponent: socket.id });

    socket.opponent = newOpponent;
    io.sockets.sockets.get(newOpponent).opponent = socket.id;

    io.to(socket.id).emit('startCountdown');
    io.to(newOpponent).emit('startCountdown');
  } else {
    console.log(`${socket.id} is waiting for a new opponent.`);
    waitingPlayer = socket.id;
    socket.emit('waitingForOpponent');
  }
});
  // Handle rematch request
  socket.on('requestRematch', () => {
    console.log(`${socket.id} requested a rematch with ${socket.opponent}`);

    if (socket.opponent) {
      if (rematchRequests[socket.opponent]) {
        io.to(socket.id).emit('startCountdown');
        io.to(socket.opponent).emit('startCountdown');
        rematchRequests[socket.opponent] = false;
      } else {
        rematchRequests[socket.id] = true;

        if (!io.sockets.sockets.get(socket.opponent)) {
          rematchRequests[socket.id] = false;
          socket.emit('readyToPlay');
        } else {
          socket.emit('waitingForRematch');
        }
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player ${socket.id} disconnected`);

    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        io.to(opponentSocket.id).emit('opponentDisconnected', 'Your opponent disconnected. Returning to matchmaking.');
        waitingPlayer = opponentSocket.id;
        opponentSocket.emit('waitingForOpponent');
      }
    }

    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }

    delete rematchRequests[socket.id];
  });

  // WebRTC signaling messages
  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is starting on port ${PORT}`);
});
