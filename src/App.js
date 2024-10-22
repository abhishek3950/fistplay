// src/App.js

import React, { useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import io from 'socket.io-client';

const socket = io(
  process.env.NODE_ENV === 'production'
    ? 'https://www.basedrockpaperscissors.xyz/'  // Use production URL
    : 'http://localhost:3000'  // Use local development URL
);

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(null);
  const [network, setNetwork] = useState(null);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [showMoveSelection, setShowMoveSelection] = useState(false); // Added state for move selection
  const moves = ['rock', 'paper', 'scissors'];
  const [gameResult, setGameResult] = useState(null);
  const [queueMessage, setQueueMessage] = useState(null);  // State for queue message
  const [showRematchOptions, setShowRematchOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState(null); // New state for token status
  const [infoMessage, setInfoMessage] = useState(null); // New state for informational messages
  const countdownInterval = useRef(null);

  const handleMoveSelection = (move) => {
    socket.emit('playerMove', { move });
    setError(`You chose ${move}. Waiting for opponent...`);
    setShowMoveSelection(false); // Hide move buttons once a move is chosen
  };

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);

  // Disconnect wallet and abandon game
  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setBalance(null);
    setNetwork(null);
    setError('Please connect your wallet to start the game.');
    setIsPlaying(false);
    setCountdown(null);
    setRemoteStream(null);
    setShowMoveSelection(false);
    setGameResult(null);
    setTokenStatus(null); // Reset token status
    setInfoMessage(null); // Reset informational messages

    localStorage.removeItem('connectedAccount');

    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
  };

  const requestRematch = () => {
    console.log('Player is requesting a rematch.');
    socket.emit('requestRematch');
    setError('Waiting for opponent to accept rematch...');
    setShowRematchOptions(false); // Optionally hide rematch options after requesting
  };

  const findNewOpponent = () => {
    console.log('Player is searching for a new opponent.');
    socket.emit('findNewOpponent');
    setError('Searching for a new opponent...');
  };

  const connectWallet = async () => {
    setIsLoading(true); // Start loading animation
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const tempProvider = new ethers.BrowserProvider(window.ethereum);
        const tempSigner = await tempProvider.getSigner();
        const tempAccount = await tempSigner.getAddress();
        const tempBalance = await tempProvider.getBalance(tempAccount);
        const tempNetwork = await tempProvider.getNetwork();

        setProvider(tempProvider);
        setSigner(tempSigner);
        setAccount(tempAccount);
        setBalance(ethers.formatEther(tempBalance));
        setNetwork(tempNetwork);

        // Emit wallet address to the server
        socket.emit('setWalletAddress', tempAccount);  // Add this line

        // Store wallet address in localStorage
        localStorage.setItem('connectedAccount', tempAccount);

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        setError(null);
      } catch (err) {
        console.error(err);
        setError('Failed to connect wallet.');
      }
    } else {
      alert('MetaMask is not installed.');
    }
    setIsLoading(false); // Stop loading animation
  };

  const handleRematchReady = (data) => {
    const { opponentId } = data;
    console.log('Rematch ready with opponent:', opponentId);
    
    // Re-establish opponent reference
    socket.opponent = opponentId;
    
    // Reset game-related states
    setGameResult(null);
    setTokenStatus(null);
    setError(null);
    setInfoMessage(null);
    
    // Re-establish peer connection
    peerConnection.current = new RTCPeerConnection();
    console.log('Re-establishing peer connection for rematch.');

    // Add local video tracks to the peer connection
    if (localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, localVideoRef.current.srcObject);
      });
    }
  
    // Handle remote tracks
    peerConnection.current.ontrack = (event) => {
      const [stream] = event.streams;
      console.log("Receiving remote stream:", stream);
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      } else {
        console.error('remoteVideoRef is not ready yet. Retrying in 1 second.');
        setTimeout(() => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          } else {
            console.error('remoteVideoRef is still not ready.');
          }
        }, 1000);
      }
    };
  
    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { to: opponentId, from: socket.id, signal: { ice: event.candidate } });
        console.log(`Emitted ICE candidate to ${opponentId} during rematch.`);
      }
    };
  
    // Create and send an offer to the opponent
    (async () => {
      try {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit('signal', { to: opponentId, from: socket.id, signal: { sdp: peerConnection.current.localDescription } });
        console.log(`Sent SDP offer to ${opponentId} during rematch.`);
      } catch (error) {
        console.error('Error creating or sending offer during rematch:', error);
      }
    })();
  
    // Start the game countdown
    startCountdown(5);
  };
  
  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      const tempAccount = accounts[0];
      setAccount(tempAccount);
      if (provider) {
        const tempBalance = await provider.getBalance(tempAccount);
        setBalance(ethers.formatEther(tempBalance));
      }
    }
  };

  const handleChainChanged = () => {
    window.location.reload();
  };

  const startGame = async () => {
    setGameResult(null);
    setTokenStatus(null);
    setError(null);
    setInfoMessage(null); // Clear any informational messages
    
    console.log('starting a game')
    
    // Close existing peer connection if any
    if (peerConnection.current) {
      console.log('peer connection open. Will close now')
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (!account) {
      // Log for debugging purposes
      console.log('No wallet account found. Attempting to reconnect.');
  
      try {
        // Attempt to reconnect with MetaMask, but only if no account is detected
        const storedAccount = localStorage.getItem('connectedAccount');
        if (storedAccount) {
          setAccount(storedAccount);
          console.log('Wallet account reconnected from local storage.');
        } else {
          setError("Please connect your wallet to start the game.");
          await connectWallet();
          return;
        }
      } catch (err) {
        console.error("Error reconnecting wallet:", err);
        setError("Wallet connection failed. Please reconnect.");
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      console.log(stream)
      if (localVideoRef.current) {
        console.log(localVideoRef.current)
        localVideoRef.current.srcObject = stream;
        setIsPlaying(true);
        socket.emit('readyToPlay');
      } else {
        console.error('Video element is not yet rendered');
      }
    } catch (err) {
      console.error('Error accessing media devices.', err);
      setError('Unable to access camera.');
    }
  };

  const startCountdown = (seconds) => {
    if (countdownInterval.current) {
      console.log('Countdown already running, skipping startCountdown');
      return;
    }
    
    if (!remoteStream) {
      console.log("Remote video not available yet. Delaying countdown.");
      const delayCheck = setInterval(() => {
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          clearInterval(delayCheck);
          // Start countdown after remote video is available
          console.log("Remote video available. Starting countdown.");
          initiateCountdown(seconds);
        }
      }, 1000); // Retry every 1 second
    } else {
      initiateCountdown(seconds);  // If already available, start countdown
    }

    console.log(`Starting countdown with ${seconds} seconds`);
    const initiateCountdown = (seconds) => {
      setCountdown(seconds);
      console.log(`Starting countdown with ${seconds} seconds`);
      setCountdown(seconds);
      setShowMoveSelection(true); // Show move selection at the start of countdown
      countdownInterval.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            console.log('Countdown reached 0, clearing interval');
            clearInterval(countdownInterval.current);
            countdownInterval.current = null; // Reset the ref
            setCountdown(null);
            setShowMoveSelection(false); // Hide move selection when countdown ends
            console.log("Countdown finished. Stopping move selection.");

            setTimeout(() => {
              if (!gameResult) { // No moves made by either player
                console.log('No game result detected, declaring game void');
                setIsPlaying(false);
                setError("No move made. Game is void.");
                setShowRematchOptions(true); // Show rematch options
                setShowMoveSelection(false); // Ensure move buttons are hidden
              }
            }, 1000);  // 1 second after countdown finishes
          }
          return prev > 1 ? prev - 1 : 0;  
        });
      }, 1000);
    }
  };

  // Update balance every 10 seconds
  useEffect(() => {
    let balanceInterval;
    if (provider && account) {
      balanceInterval = setInterval(async () => {
        const tempBalance = await provider.getBalance(account);
        setBalance(ethers.formatEther(tempBalance));
      }, 10000);
    }
    return () => {
      if (balanceInterval) clearInterval(balanceInterval);
    };
  }, [provider, account]);

  // Handle global socket events
  useEffect(() => {
    socket.on('connect', () => console.log('Connected to Socket.io server.'));
    socket.on('disconnect', () => console.log('Disconnected from Socket.io server.'));
    socket.on('gameUpdate', (data) => console.log('Game Update:', data));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('gameUpdate');
    };
  }, []);

  // Reconnect wallet if previously connected
  useEffect(() => {
    const storedAccount = localStorage.getItem('connectedAccount');
    if (storedAccount) {
      const reconnectWallet = async () => {
        if (window.ethereum) {
          try {
            const tempProvider = new ethers.BrowserProvider(window.ethereum);
            const tempSigner = await tempProvider.getSigner();
            const tempAccount = await tempSigner.getAddress();
            const tempBalance = await tempProvider.getBalance(tempAccount);
            const tempNetwork = await tempProvider.getNetwork();

            setProvider(tempProvider);
            setSigner(tempSigner);
            setAccount(tempAccount);
            setBalance(ethers.formatEther(tempBalance));
            setNetwork(tempNetwork);

            socket.emit('setWalletAddress', tempAccount);

            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
          } catch (err) {
            console.error('Failed to reconnect wallet:', err);
          }
        }
      };
      reconnectWallet();
    }
  }, []);

  // Handle game-related socket events
  useEffect(() => {
    // Handle 'matchFound' event
    socket.on('matchFound', async (data) => {
      const { opponentId } = data;
      setQueueMessage(null); // Clear the "in queue" message once matched
      setInfoMessage(null);       // Clear the "Waiting for an opponent to join..." message
      peerConnection.current = new RTCPeerConnection();

      if (localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach(track => {
          peerConnection.current.addTrack(track, localVideoRef.current.srcObject);
        });
      }

      peerConnection.current.ontrack = (event) => {
        const [stream] = event.streams;
        console.log("Receiving remote stream:", stream);  // Debugging
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        } else {
          console.error('remoteVideoRef is not ready yet. Retrying in 1 second.');
          setTimeout(() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            } else {
              console.error('remoteVideoRef is still not ready.');
            }
          }, 1000);
        }
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', { to: opponentId, from: socket.id, signal: { ice: event.candidate } });
        }
      };

      try {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit('signal', { to: opponentId, from: socket.id, signal: { sdp: peerConnection.current.localDescription } });
      } catch (error) {
        console.error('Error creating or sending offer:', error);
      }

      startCountdown(5);
    });

    // Handle 'signal' event
    socket.on('signal', async (data) => {
      const { from, signal } = data;
      console.log(`Received signal from ${from}:`, signal);
      
      if (!peerConnection.current) {
        console.error('Peer connection is not initialized.');
        return;
      }

      try {
        if (signal.sdp) {
          if (peerConnection.current.signalingState === 'stable') {
            console.warn('Cannot set remote description in stable state.');
            return;
          }

          await peerConnection.current.setRemoteDescription(signal.sdp);
          console.log('Remote description set.');

          if (signal.sdp.type === 'offer') {
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            console.log('Created and set local description (answer).');
            socket.emit('signal', { to: from, from: socket.id, signal: { sdp: peerConnection.current.localDescription } });
            console.log(`Sent SDP answer to ${from}`);
          }
        }

        if (signal.ice) {
          await peerConnection.current.addIceCandidate(signal.ice);
          console.log(`Added ICE candidate from ${from}`);
        }
      } catch (error) {
        console.error('Error handling SDP signal:', error);
      }
    });

    // Handle 'opponentDisconnected' event
    socket.on('opponentDisconnected', (message) => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
      setError(message);
      setIsPlaying(false);
      setShowMoveSelection(false);
      setRemoteStream(null);
      setShowRematchOptions(false);
      // Close peer connection if still open
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    });

    // Handle 'gameResult' event
    socket.on('gameResult', (data) => {
      console.log('Received gameResult:', data);
      
      setIsPlaying(false); // Stop the game
      console.log('Received gameResult:', data);
        
      // Clear any existing countdown interval
      if (countdownInterval.current) {
        console.log('Clearing countdown interval due to gameResult');
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
      
      const { result } = data;
      setShowRematchOptions(true); // Show rematch options
      setRemoteStream(null); // Stop showing opponent's video

      switch (result) {
        case 'You won!':
          setError('Congratulations! You won the game.');
          break;
        case 'You lost!':
          setError('Sorry, you lost. Better luck next time!');
          break;
        case 'Draw':
          setError('It\'s a draw! Try again.');
          break;
        case 'No result':
          setError('No result since one player didn\'t make a move.');
          break;
        default:
          setError('Unexpected result. Please try again.');
      }

      // Close peer connection after game result
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
        console.log('Closed peer connection after game result.');
      }
    });

    // Handle 'rematchReady' event
    socket.on('rematchReady', handleRematchReady);

    // Handle 'tokensSent' event
    socket.on('tokensSent', (data) => {
      const { status, txHash, error } = data;
      if (status === 'success') {
        setTokenStatus(`Tokens successfully sent! Transaction Hash: ${txHash}`);
      } else {
        setTokenStatus(`Failed to send tokens: ${error}`);
      }
    });

    // Handle 'opponentLeft' event
    socket.on('opponentLeft', (message) => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
      
      setError(message);
      setIsPlaying(false);
      // Close peer connection if still open
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    });

    // Handle 'opponentWantsRematch' event
    socket.on('opponentWantsRematch', () => {
      console.log('Opponent has requested a rematch.');
      setInfoMessage('Your opponent has requested a rematch.');
    });

    // Handle 'waitingForOpponentRematch' event
    socket.on('waitingForOpponentRematch', () => {
      console.log('Waiting for opponent to accept rematch.');
      setInfoMessage('Waiting for your opponent to agree to a rematch...');
    });

    // Handle 'waitingForOpponent' event
    socket.on('waitingForOpponent', () => {
      setInfoMessage('Waiting for an opponent to join...');
    });

    return () => {
      socket.off('matchFound');
      socket.off('signal');
      socket.off('opponentDisconnected');
      socket.off('gameResult');
      socket.off('rematchAgreed');
      socket.off('tokensSent');
      socket.off('opponentLeft');
      socket.off('opponentWantsRematch');
      socket.off('waitingForOpponentRematch');
      socket.off('waitingForOpponent');
      socket.on('rematchReady', handleRematchReady);

      // Clear the countdown interval if it's still running
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
      
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    };
  }, []);

  return (
    <div className="App">
      <header>
        <img src="logo.png" alt="Based Rock Paper Scissors Logo" className="small-logo" />
        {!account ? (
          <button onClick={connectWallet} className={`connect-btn ${isLoading ? 'loading' : ''}`}>
            {isLoading ? 'Connecting...' : 'Connect MetaMask'}
          </button>
        ) : (
          <button onClick={disconnectWallet} className="connect-btn">
            Disconnect
          </button>
        )}
      </header>

      <main>
        {!isPlaying && (
          <button onClick={startGame} className="btn-primary" disabled={!account}>
            Play
          </button>
        )}

        {error && <p className="error-message">{error}</p>}
        {infoMessage && <p className="info-message">{infoMessage}</p>} {/* Display informational messages */}
        {tokenStatus && (
          <p className={`token-status ${tokenStatus.startsWith('Failed') ? 'error' : ''}`}>
            {tokenStatus}
          </p>
        )} {/* Display token status */}

        {countdown && isPlaying && (
          <div id="countdownOverlay" className="visible">
            Game starts in {countdown}...
          </div>
        )}

        <div className="video-container">
          <video ref={localVideoRef} id="player1Video" autoPlay playsInline muted></video>
          {remoteStream && <video ref={remoteVideoRef} id="player2Video" autoPlay playsInline></video>}
        </div>

        {showMoveSelection && (
          <div className="controls">
            <button onClick={() => handleMoveSelection('rock')} className="btn-secondary">
              Rock
            </button>
            <button onClick={() => handleMoveSelection('paper')} className="btn-secondary">
              Paper
            </button>
            <button onClick={() => handleMoveSelection('scissors')} className="btn-secondary">
              Scissors
            </button>
          </div>
        )}

        {gameResult && (
          <div className={`game-result ${gameResult === 'You won!' ? 'win' : 'lose'}`}>
            {gameResult === 'You won!' && (
              <p>Congratulations! Tokens have been sent to your wallet!</p>
            )}
            <p>{gameResult}</p>
          </div>
        )}

        {showRematchOptions && isPlaying === false &&(
          <div className="rematch-controls">
            <button onClick={requestRematch} className="btn-secondary">
              Request Rematch
            </button>
            <button onClick={findNewOpponent} className="btn-secondary">
              Find New Opponent
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
