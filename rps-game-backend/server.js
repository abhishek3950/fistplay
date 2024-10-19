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
  res.send("Rock Paper Scissors Game Backend is Running");
});

// Log that the server is starting
server.listen(PORT, () => {
  console.log(`Server is starting on port ${PORT}`);
});

// Player matching logic
let waitingPlayer = null;
const playerMoves = {};  // Store the moves of both players

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('readyToPlay', () => {
    console.log(`${socket.id} is ready to play`);

    if (waitingPlayer) {
      const opponent = waitingPlayer;
      waitingPlayer = null;

      // Notify both players of the match
      io.to(socket.id).emit('matchFound', { opponent });
      io.to(opponent).emit('matchFound', { opponent: socket.id });

      // Notify both players to start the WebRTC connection
      console.log(`Matching ${socket.id} with ${opponent}. Initiating WebRTC connection.`);
      io.to(socket.id).emit('startPeerConnection', { isInitiator: true, opponent });
      io.to(opponent).emit('startPeerConnection', { isInitiator: false, opponent: socket.id });

      // Save opponents for each player
      socket.opponent = opponent;
      io.sockets.sockets.get(opponent).opponent = socket.id;

      // Start countdown for both players
      io.to(socket.id).emit('startCountdown');
      io.to(opponent).emit('startCountdown');

    } else {
      waitingPlayer = socket.id;
      console.log(`${socket.id} is waiting for an opponent.`);
      socket.emit('waitingForOpponent');
    }
  });

  // Handle player move
  socket.on('playerMove', (data) => {
    console.log(`Player ${socket.id} made move: ${data.move}`);
    playerMoves[socket.id] = data.move;

    const opponentId = socket.opponent;
    if (playerMoves[socket.id] && playerMoves[opponentId]) {
      // Both players have made their move, determine the result
      const result = determineWinner(playerMoves[socket.id], playerMoves[opponentId]);

      if (result === 'draw') {
        io.to(socket.id).emit('roundResult', { result: 'draw' });
        io.to(opponentId).emit('roundResult', { result: 'draw' });
        console.log(`Draw between ${socket.id} and ${opponentId}. Restarting round.`);
        io.to(socket.id).emit('startCountdown');  // Restart the game
        io.to(opponentId).emit('startCountdown');
      } else {
        const winnerId = result === 'player1' ? socket.id : opponentId;
        const loserId = result === 'player1' ? opponentId : socket.id;

        io.to(winnerId).emit('roundResult', { result: 'win' });
        io.to(loserId).emit('roundResult', { result: 'lose' });

        // Reset both players for the next match
        setTimeout(() => {
          io.to(socket.id).emit('resetForNewRound');
          io.to(opponentId).emit('resetForNewRound');
        }, 3000);  // Show result for 3 seconds
      }

      // Clear moves after the round
      delete playerMoves[socket.id];
      delete playerMoves[opponentId];
    }
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`Player ${socket.id} disconnected.`);

    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      
      if (opponentSocket) {
        // Notify the remaining player that their opponent disconnected
        opponentSocket.emit('opponentDisconnected', 'Your opponent has disconnected. Returning to matchmaking.');
        // Put the remaining player back into the waiting queue
        waitingPlayer = opponentSocket.id;
        opponentSocket.emit('waitingForOpponent');
      }
    }

    // Reset the waiting player if they disconnect
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }

    // Clear any stored move if the player disconnects
    delete playerMoves[socket.id];
  });

  // WebRTC signaling messages
  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });
});

// Function to determine the winner
function determineWinner(player1Move, player2Move) {
  if (player1Move === player2Move) {
    return 'draw';  // It's a draw
  }

  if (
    (player1Move === 'rock' && player2Move === 'scissors') ||
    (player1Move === 'scissors' && player2Move === 'paper') ||
    (player1Move === 'paper' && player2Move === 'rock')
  ) {
    return 'player1';  // Player 1 wins
  } else {
    return 'player2';  // Player 2 wins
  }
}
