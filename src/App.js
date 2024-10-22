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
    setGameResult(null);
    
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
    socket.emit('requestRematch');
    setError('Waiting for opponent to accept rematch...');
  };

  const findNewOpponent = () => {
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
    if (!account) {
      setError("Please connect your wallet to start the game.");
      await connectWallet();  // Trigger wallet connection if not connected
      return;  // Return early, so the game doesn't start if the wallet isn't connected yet
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        setIsPlaying(true);
        socket.emit('readyToPlay');
        setError("You are in queue to be matched.");
      } else {
        console.error('Video element is not yet rendered');
      }
    } catch (err) {
      console.error('Error accessing media devices.', err);
      setError('Unable to access camera.');
    }
  };

  useEffect(() => {
    socket.on('matchFound', async (data) => {
      const { opponentId } = data;
      setQueueMessage(null); // Clear the "in queue" message once matched
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
          console.error('remoteVideoRef is not ready yet.Retrying');
          
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

    socket.on('signal', async (data) => {
      const { from, signal } = data;

      try {
        if (signal.sdp) {
          if (peerConnection.current.signalingState === 'stable') {
            console.warn('Cannot set remote description in stable state.');
            return;
          }

          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          if (signal.sdp.type === 'offer') {
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            socket.emit('signal', { to: from, from: socket.id, signal: { sdp: peerConnection.current.localDescription } });
          }
        }

        if (signal.ice) {
          await peerConnection.current.addIceCandidate(signal.ice);
        }
      } catch (error) {
        console.error('Error handling SDP signal:', error);
      }
    });

    return () => {
      socket.off('matchFound');
      socket.off('signal');
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    };
  }, []);

  const startCountdown = (seconds) => {
    setCountdown(seconds);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 5) {
          // Start showing move selection at 5 seconds
          setShowMoveSelection(true);
          console.log("Showing move selection.");
        }
        if (prev === 0) {
          clearInterval(interval);
          setCountdown(null);
          setShowMoveSelection(false); // Display move buttons after countdown
          console.log("Countdown finished. Stopping move selection.");
          setTimeout(() => {
            if (!gameResult) { // No moves made by either player
              setError("No move made. Game is void.");
              setShowRematchOptions(true); // Show rematch options
              setShowMoveSelection(false); // Hide move buttons
            }
          }, 1000);  // // 1 second after countdown finishes
        }
      return prev > 1 ? prev - 1 : 1;  
      });
    }, 1000);
  };

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
  

  useEffect(() => {
    socket.on('gameResult', (data) => {
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
    });

    socket.on('rematchAgreed', () => {
      setError('Rematch agreed! Starting new match...');
      startGame();
    });

    socket.on('opponentLeft', (message) => {
      setError(message);
      setIsPlaying(false);
    });

    return () => {
      socket.off('gameResult');
      socket.off('rematchAgreed');
      socket.off('opponentLeft');
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

        {countdown && (
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
            {gameResult === 'You won!' && <p>Congratulations! Tokens have been sent to your wallet!</p>}
            {gameResult}
          </div>
        )}

        {gameResult && (
          <div className={`game-result ${gameResult === 'You won!' ? 'win' : 'lose'}`}>
            {gameResult}
          </div>
        )}
        
        {showRematchOptions && (
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
