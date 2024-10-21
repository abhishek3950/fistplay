// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); // Destructure Server from socket.io
const path = require('path');
const cors = require('cors');
const { ethers } = require('ethers'); // Destructure ethers
require('dotenv').config();

// Initialize Express app
const app = express();

const fs = require('fs');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io server with CORS configuration
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080'], // Allow both localhost and 127.0.0.1
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from 'public' if needed
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Ethers.js
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Define token contract ABI and address
const tokenABI = JSON.parse(fs.readFileSync(process.env.ABI_PATH)).abi;
const tokenAddress = process.env.TOKEN_ADDRESS;

// Initialize token contract instance
const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);

// Player matchmaking variables
let waitingPlayers = [];
const rematchRequests = {};

// Helper function to determine game outcome
function determineWinner(player1Move, player2Move) {
  if (player1Move === player2Move) return 'draw';
  if (
    (player1Move === 'rock' && player2Move === 'scissors') ||
    (player1Move === 'scissors' && player2Move === 'paper') ||
    (player1Move === 'paper' && player2Move === 'rock')
  ) {
    return 'win';
  }
  return 'lose';
}

// Matchmaking function to pair players
function matchmaking(socket) {
  console.log(`Attempting to match player ${socket.id}`);

  if (waitingPlayers.length > 0) {
    const opponentId = waitingPlayers.shift();
    const opponentSocket = io.sockets.sockets.get(opponentId);

    if (opponentSocket) {
      // Pair the two players
      socket.opponent = opponentId;
      opponentSocket.opponent = socket.id;

      // Notify both players
      io.to(socket.id).emit('matchFound', { opponentId });
      io.to(opponentId).emit('matchFound', { opponentId: socket.id });

      // Start countdown or game initialization
      io.to(socket.id).emit('startCountdown');
      io.to(opponentId).emit('startCountdown');
    } else {
      // Opponent socket not found, try matchmaking again
      matchmaking(socket);
    }
  } else {
    // No available players, add to waiting list
    waitingPlayers.push(socket.id);
    socket.emit('waitingForOpponent');
    console.log(`Player ${socket.id} is waiting for an opponent.`);
  }
}

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Set wallet address from client
  socket.on('setWalletAddress', (walletAddress) => {
    socket.walletAddress = walletAddress;
    console.log(`Player ${socket.id} set wallet address to ${walletAddress}`);
  });

  // Player ready to play (enters matchmaking)
  socket.on('readyToPlay', () => {
    console.log(`Player ${socket.id} is ready to play.`);
    matchmaking(socket);
  });


    // server.js (Add inside io.on('connection'))
  socket.on('signal', (data) => {
    const { to, from, signal } = data;
    io.to(to).emit('signal', { from, signal });
  });


  // Handle player move
  socket.on('playerMove', async (data) => {
    console.log(`Player ${socket.id} selected move: ${data.move}`);
    socket.move = data.move;

    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket && opponentSocket.move) {
        // Both players have made their moves
        const result = determineWinner(socket.move, opponentSocket.move);

        let winnerSocket = null;
        let loserSocket = null;

        if (result === 'win') {
          winnerSocket = socket;
          loserSocket = opponentSocket;
        } else if (result === 'lose') {
          winnerSocket = opponentSocket;
          loserSocket = socket;
        }

        // Emit game results
        if (result === 'draw') {
          io.to(socket.id).emit('gameResult', { result: 'Draw' });
          io.to(opponentSocket.id).emit('gameResult', { result: 'Draw' });
        } else {
          io.to(winnerSocket.id).emit('gameResult', { result: 'You won!' });
          io.to(loserSocket.id).emit('gameResult', { result: 'You lost!' });

          // Mint tokens to the winner
          try {
            console.log(`Attempting to mint tokens to ${winnerSocket.walletAddress}`);
            const tx = await tokenContract.mint(winnerSocket.walletAddress, ethers.parseUnits('5', 18));
            await tx.wait();
            console.log(`Minted 5 tokens to ${winnerSocket.walletAddress} - Transaction Hash: ${tx.hash}`);
            
            // Notify the winner about successful token minting
            io.to(winnerSocket.id).emit('tokensSent', {
              status: 'success',
              txHash: tx.hash,
            });
          } catch (error) {
            console.error(`Failed to mint tokens: ${error.message}`);
            io.to(winnerSocket.id).emit('tokensSent', {
              status: 'error',
              error: error.message,
            });
          }
        }

        // Reset moves
        socket.move = null;
        opponentSocket.move = null;
      }
    }
  });
  // Endpoint to test minting functionality
  app.post('/test-mint', async (req, res) => {
    const { winnerAddress, amount } = req.body;

    if (!winnerAddress || !amount) {
      return res.status(400).send("Invalid request, must provide winnerAddress and amount.");
    }

    try {
      console.log(`Attempting to mint ${amount} tokens to ${winnerAddress}`);
      const tx = await tokenContract.mint(winnerAddress, ethers.parseUnits(amount.toString(), 18));
      await tx.wait();
      console.log(`Minted ${amount} tokens to ${winnerAddress} - Transaction Hash: ${tx.hash}`);
      
      return res.status(200).send({
        status: 'success',
        txHash: tx.hash
      });
    } catch (error) {
      console.error(`Failed to mint tokens: ${error.message}`);
      return res.status(500).send({
        status: 'error',
        error: error.message
      });
    }
  });

  // Handle rematch requests
  socket.on('requestRematch', () => {
    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        if (rematchRequests[socket.opponent]) {
          // Opponent already requested a rematch
          io.to(socket.id).emit('rematchAgreed');
          io.to(opponentSocket.id).emit('rematchAgreed');
          rematchRequests[socket.opponent] = false;
          rematchRequests[socket.id] = false;

          // Restart matchmaking or reset game state as needed
          io.to(socket.id).emit('startCountdown');
          io.to(opponentSocket.id).emit('startCountdown');
        } else {
          // Player requests rematch, notify opponent
          rematchRequests[socket.id] = true;
          io.to(opponentSocket.id).emit('opponentWantsRematch');
          io.to(socket.id).emit('waitingForOpponentRematch');
        }
      } else {
        // Opponent not found
        socket.emit('opponentLeft', 'Your opponent has disconnected.');
        socket.opponent = null;
        matchmaking(socket);
      }
    }
  });

  // Handle finding a new opponent
  socket.on('findNewOpponent', () => {
    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        opponentSocket.emit('opponentLeft', 'Your opponent has decided to find a new opponent.');
        opponentSocket.opponent = null;
        delete rematchRequests[opponentSocket.id];
        matchmaking(opponentSocket);
      }
      socket.opponent = null;
    }

    delete rematchRequests[socket.id];
    matchmaking(socket);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (socket.opponent) {
      const opponentSocket = io.sockets.sockets.get(socket.opponent);
      if (opponentSocket) {
        opponentSocket.emit('opponentDisconnected', 'Your opponent has disconnected.');
        opponentSocket.opponent = null;
        delete rematchRequests[opponentSocket.id];
        matchmaking(opponentSocket);
      }
    }

    // Remove from waiting players if present
    waitingPlayers = waitingPlayers.filter(id => id !== socket.id);
    delete rematchRequests[socket.id];
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Node server listening on port ${PORT}`);
});
