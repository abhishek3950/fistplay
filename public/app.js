const socket = io();
const playBtn = document.getElementById('playBtn');
const rematchBtn = document.getElementById('rematchBtn');
const newOpponentBtn = document.getElementById('newOpponentBtn');
const statusText = document.getElementById('status');
const player1Video = document.getElementById('player1Video');
const player2Video = document.getElementById('player2Video');
const countdownOverlay = document.getElementById('countdownOverlay');
const gestureResultText = document.getElementById('gestureResult');

let localStream;
let peerConnection;
let opponentSocketId = null;

const peerConnectionConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Disable buttons initially
playBtn.disabled = true;

// Load the AI model for gesture detection
async function loadModel() {
  try {
    model = await handpose.load();  // Load HandPose model
    console.log("HandPose model loaded successfully!");
    playBtn.disabled = false;
    statusText.innerText = "Model loaded, ready to play!";
  } catch (error) {
    console.error("Failed to load the HandPose model:", error);
    statusText.innerText = "Failed to load the model, please reload the page.";
  }
}

loadModel(); 

// Function to detect player's move
async function detectPlayerMove(videoElement) {
  if (!videoElement || videoElement.readyState < 2) {
    console.log("Video not ready or no video stream detected.");
    return 'no hand detected';
  }

  console.log("Running HandPose model...");
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
    statusText.innerText = "Error accessing camera. Please check permissions.";
  }
});

// Requesting a rematch
rematchBtn.addEventListener('click', () => {
  socket.emit('requestRematch');
  rematchBtn.style.display = 'none';
  newOpponentBtn.style.display = 'none';
});

// Requesting a new opponent
newOpponentBtn.addEventListener('click', () => {
  if (peerConnection) {
    peerConnection.close();  // Close the existing connection
    peerConnection = null;   // Reset the peer connection object
  }
  
  socket.emit('findNewOpponent');
  rematchBtn.style.display = 'none';
  newOpponentBtn.style.display = 'none';
  statusText.innerText = 'Looking for a new opponent...';
});

// Handle WebRTC connection establishment
socket.on('startPeerConnection', async (data) => {
  opponentSocketId = data.opponent;

  peerConnection = new RTCPeerConnection(peerConnectionConfig);

  // Add local media stream to the peer connection
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      console.log("Received remote stream, setting it to opponent's video");
      player2Video.srcObject = event.streams[0];  // Opponent's video stream
    } else {
      console.log("No remote stream received");
    }
};
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', peerConnection.iceConnectionState);
    };
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");
      socket.emit('signal', {
        to: data.opponent,
        signal: { candidate: event.candidate }
      });
    } else {
      console.log("No more ICE candidates");
    }
  };

  // Listen for incoming signals (SDP or ICE candidates)
  socket.on('signal', async (data) => {
    try {
      if (data.signal.sdp) {
        const remoteDesc = new RTCSessionDescription(data.signal.sdp);
        console.log("PeerConnection signaling state: ", peerConnection.signalingState);
        if (peerConnection.signalingState === 'have-local-offer' && remoteDesc.type === 'answer') {
          await peerConnection.setRemoteDescription(remoteDesc);
        } else if (peerConnection.signalingState === 'stable' && remoteDesc.type === 'offer') {
          await peerConnection.setRemoteDescription(remoteDesc);
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit('signal', { to: data.from, signal: { sdp: peerConnection.localDescription } });
        } else {
          console.warn(`Unexpected SDP type ${remoteDesc.type} in signaling state ${peerConnection.signalingState}`);
        }
      } else if (data.signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
      }
    } catch (error) {
      console.error("Error in handling signal", error);
    }
  });
});


// Handle match found
socket.on('matchFound', (data) => {
  opponentSocketId = data.opponent;
  statusText.innerText = "Opponent found, establishing connection...";
});

// Handle opponent disconnected
socket.on('opponentDisconnected', (message) => {
  console.log(message);
  statusText.innerText = message;
  opponentSocketId = null;  // Clear the opponent socket ID
  rematchBtn.style.display = 'none';
  newOpponentBtn.style.display = 'none';
  setTimeout(() => {
    statusText.innerText = 'Looking for a new opponent...';
    socket.emit('readyToPlay');  // Automatically start looking for a new opponent
  }, 3000);
});

// Handle the countdown and start of the game
// Ensure the gestureResultText is updated after both moves are detected
socket.on('startCountdown', () => {
  let countdown = 5;
  statusText.innerText = "Game starting...";
  countdownOverlay.innerText = `Starting in ${countdown}`;

  const interval = setInterval(async () => {
    countdown--;
    countdownOverlay.innerText = `Starting in ${countdown}`;

    if (countdown === 0) {
      clearInterval(interval);
      countdownOverlay.innerText = "Show your move!";

      // Detect the player's move
      const playerMove = await detectPlayerMove(player1Video);
      socket.emit('playerMove', { move: playerMove });

      // Display your move and wait for the opponent's move
      gestureResultText.innerText = "Your move: " + playerMove;

      // Wait for the opponent's move
      socket.on('opponentMove', (data) => {
        gestureResultText.innerText += " | Opponent's move: " + data.move;
      });

      // Show rematch/new opponent buttons after 2 seconds
      setTimeout(() => {
        rematchBtn.style.display = 'block';
        newOpponentBtn.style.display = 'block';
      }, 2000);
    }
  }, 1000);
});
