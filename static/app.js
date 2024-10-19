const socket = io();

const playBtn = document.getElementById('playBtn');
const statusText = document.getElementById('status');
const player1Video = document.getElementById('player1Video');
const player2Video = document.getElementById('player2Video');
const countdownOverlay = document.getElementById('countdownOverlay');
const scoreText = document.getElementById('score');

let localStream;
let peerConnection;
let wins = 0;
let losses = 0;
let model;  // TensorFlow.js model

const peerConnectionConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Load the AI model for gesture detection
async function loadModel() {
  model = await tf.loadGraphModel('https://path-to-your-model/model.json');  // Replace with the actual model URL
  console.log("Model loaded!");
}

loadModel();  // Load the AI model on page load

playBtn.addEventListener('click', async () => {
  // Request camera access
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true });
    player1Video.srcObject = localStream;
    statusText.innerText = "Camera access granted. Looking for an opponent...";
    socket.emit('readyToPlay');
    playBtn.style.display = 'none';  // Hide the play button until the round is over
  } catch (error) {
    console.error('Error accessing camera:', error);
    statusText.innerText = "Error accessing camera. Please check permissions.";
  }
});

// Handle opponent disconnection
socket.on('opponentDisconnected', (message) => {
  statusText.innerText = message;
  countdownOverlay.innerText = "Opponent disconnected.";
  player2Video.srcObject = null;  // Clear opponent's video
  playBtn.style.display = 'block';  // Show the play button again
});

// Listen for events from the server
socket.on('waitingForOpponent', () => {
  statusText.innerText = "Waiting for an opponent...";
  countdownOverlay.innerText = "Waiting for opponent...";
});

socket.on('matchFound', (data) => {
  statusText.innerText = `Matched with player ${data.opponent}. Get ready...`;
  countdownOverlay.innerText = "Get ready...";
});

// Start countdown and handle move detection
socket.on('startCountdown', () => {
  let countdown = 5;
  statusText.innerText = "Game starting...";
  countdownOverlay.innerText = `Starting in ${countdown}`;

  const interval = setInterval(() => {
    countdown--;
    countdownOverlay.innerText = `Starting in ${countdown}`;

    if (countdown === 0) {
      clearInterval(interval);
      countdownOverlay.innerText = "Show your move!";

      // After 1 second, capture the player's move using the AI model
      setTimeout(async () => {
        const playerMove = await detectPlayerMove();
        socket.emit('playerMove', { move: playerMove });

        countdownOverlay.innerText = "Move detected: " + playerMove;
      }, 1000);
    }
  }, 1000);  // Countdown every second
});

// Detect the player's move using the AI model
async function detectPlayerMove() {
  const videoTensor = tf.browser.fromPixels(player1Video);  // Capture frame from video
  const resized = tf.image.resizeBilinear(videoTensor, [224, 224]);  // Resize to model input size
  const normalized = resized.div(255.0).expandDims(0);  // Normalize the image
  const prediction = await model.predict(normalized);
  const move = prediction.argMax(1).dataSync()[0];

  // Map the model's output to a move (e.g., 0: rock, 1: paper, 2: scissors)
  const moveMapping = ['rock', 'paper', 'scissors'];
  return moveMapping[move];
}

// Handle peer-to-peer connection
socket.on('startPeerConnection', async (data) => {
  peerConnection = new RTCPeerConnection(peerConnectionConfig);

  // Add local stream to peer connection
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    player2Video.srcObject = event.streams[0];  // Show opponent's video stream
  };

  // ICE candidate exchange
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        to: data.opponent,
        signal: { candidate: event.candidate }
      });
    }
  };

  socket.on('signal', async (data) => {
    if (data.signal.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    } else if (data.signal.sdp) {
      if (data.signal.sdp.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', {
          to: data.from,
          signal: { sdp: peerConnection.localDescription }
        });
      } else if (data.signal.sdp.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
      }
    }
  });

  if (data.isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', {
      to: data.opponent,
      signal: { sdp: peerConnection.localDescription }
    });
  }
});

// Update the score
function updateScore(won) {
  if (won) {
    wins++;
  } else {
    losses++;
  }
  scoreText.innerText = `Wins: ${wins} | Losses: ${losses}`;
}
