const socket = io();
const playBtn = document.getElementById('playBtn');
const rematchBtn = document.getElementById('rematchBtn');
const newOpponentBtn = document.getElementById('newOpponentBtn');
const statusText = document.getElementById('status');
const player1Video = document.getElementById('player1Video');
const player2Video = document.getElementById('player2Video');
const countdownOverlay = document.getElementById('countdownOverlay');
let localStream;
let peerConnection;
let model;

// Disable play button until the model is loaded
playBtn.disabled = true;

// Load the HandPose model
async function loadModel() {
  try {
    model = await handpose.load();
    console.log("HandPose model loaded successfully!");
    playBtn.disabled = false;
    statusText.innerText = "Model loaded. Ready to play!";
  } catch (error) {
    console.error("Failed to load HandPose model:", error);
    statusText.innerText = "Model load failed.";
  }
}

loadModel();

playBtn.addEventListener('click', async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true });
    player1Video.srcObject = localStream;

    player1Video.addEventListener('loadeddata', () => {
      console.log("Video stream is ready for processing.");
      socket.emit('readyToPlay');
      playBtn.style.display = 'none';
    });
  } catch (error) {
    console.error('Error accessing camera:', error);
    statusText.innerText = "Error accessing camera.";
  }
});

// Handle WebRTC connection
socket.on('startPeerConnection', async (data) => {
  peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

  // Add local stream to peer connection
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // On receiving remote stream
  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      player2Video.srcObject = event.streams[0]; // Set opponent's video
    }
  };

  // Exchange ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: data.opponent, signal: { candidate: event.candidate } });
    }
  };

  socket.on('signal', async (data) => {
    if (data.signal.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    } else if (data.signal.sdp) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
      if (data.signal.sdp.type === 'offer') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { to: data.from, signal: { sdp: peerConnection.localDescription } });
      }
    }
  });

  // If initiator, create an offer
  if (data.isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: data.opponent, signal: { sdp: peerConnection.localDescription } });
  }
});

// Start countdown once both streams are ready
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

      setTimeout(async () => {
        const playerMove = await detectPlayerMove(player1Video); // Detect move from player1 video
        socket.emit('playerMove', { move: playerMove });
        countdownOverlay.innerText = "Move detected: " + playerMove;

        setTimeout(() => {
          rematchBtn.style.display = 'block';
          newOpponentBtn.style.display = 'block';
        }, 2000);
      }, 1000);
    }
  }, 1000);
});

// Rematch handling: Send a rematch request and wait for both players to agree
rematchBtn.addEventListener('click', () => {
  socket.emit('requestRematch');
  rematchBtn.style.display = 'none';
  newOpponentBtn.style.display = 'none';
  statusText.innerText = "Waiting for opponent to agree to rematch...";
});

// Play with new opponent handling: Find a new opponent
newOpponentBtn.addEventListener('click', () => {
  socket.emit('findNewOpponent');
  rematchBtn.style.display = 'none';  
  newOpponentBtn.style.display = 'none';
  statusText.innerText = 'Looking for a new opponent...';
});

// Handle rematch logic
socket.on('rematchAgreed', () => {
  statusText.innerText = "Rematch agreed! Starting the countdown...";
  rematchBtn.style.display = 'none';
  newOpponentBtn.style.display = 'none';
  socket.emit('startCountdown');  // Start the countdown when both players agree to rematch
});

// Handle waiting for the rematch
socket.on('waitingForRematch', () => {
  statusText.innerText = "Waiting for the opponent to agree to rematch...";
});

// Handle new opponent logic
socket.on('waitingForOpponent', () => {
  statusText.innerText = "Waiting for a new opponent...";
});


// Detect player's move
async function detectPlayerMove(videoElement) {
  if (!videoElement || videoElement.readyState < 2) {
    console.log("Video not ready or no video stream detected.");
    return 'no hand detected';
  }

  const predictions = await model.estimateHands(videoElement);
  if (predictions.length > 0) {
    const hand = predictions[0];
    const thumbTip = hand.annotations.thumb[3];
    const indexTip = hand.annotations.indexFinger[3];
    const middleTip = hand.annotations.middleFinger[3];

    if (indexTip[1] > thumbTip[1] && middleTip[1] > thumbTip[1]) {
      return 'rock';
    } else if (indexTip[1] < thumbTip[1] && middleTip[1] < thumbTip[1]) {
      return 'paper';
    } else if (indexTip[1] < thumbTip[1] && middleTip[1] < thumbTip[1] && hand.annotations.ringFinger[3][1] > thumbTip[1]) {
      return 'scissors';
    } else {
      return 'unknown';
    }
  } else {
    return 'no hand detected';
  }
}