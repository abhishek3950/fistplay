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
let waitingPlayer = null;
const rematchRequests = {}; 

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('readyToPlay', () => {
    console.log(`${socket.id} is ready to play`);

    if (waitingPlayer) {
      const opponent = waitingPlayer;
      waitingPlayer = null;

      console.log(`Matching ${socket.id} with ${opponent}`);

      // Notify both players of the match
      io.to(socket.id).emit('matchFound', { opponent });
      io.to(opponent).emit('matchFound', { opponent: socket.id });

      // WebRTC connection setup
      io.to(socket.id).emit('startPeerConnection', { isInitiator: true, opponent });
      io.to(opponent).emit('startPeerConnection', { isInitiator: false, opponent: socket.id });

      socket.opponent = opponent;
      io.sockets.sockets.get(opponent).opponent = socket.id;

      io.to(socket.id).emit('startCountdown');
      io.to(opponent).emit('startCountdown');
    } else {
      waitingPlayer = socket.id;
      socket.emit('waitingForOpponent');
    }
  });

  // Rematch handling
  socket.on('requestRematch', () => {
    if (socket.opponent) {
      if (rematchRequests[socket.opponent]) {
        io.to(socket.id).emit('startCountdown');
        io.to(socket.opponent).emit('startCountdown');
        rematchRequests[socket.opponent] = false;
      } else {
        rematchRequests[socket.id] = true;
        socket.emit('waitingForRematch');
      }
    }
  });

  // New opponent handling
  socket.on('findNewOpponent', () => {
    socket.opponent = null;
    socket.emit('readyToPlay');
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        opponentSocket.emit('opponentDisconnected', 'Your opponent has disconnected.');
        waitingPlayer = opponentSocket.id;
        opponentSocket.emit('waitingForOpponent');
      }
    }

    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }

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
