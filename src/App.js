// src/App.js

import React, { useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

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

  const handleMoveSelection = (move) => {
    socket.emit('playerMove', { move });
    setError(`You chose ${move}. Waiting for opponent...`);
    setShowMoveSelection(false); // Hide move buttons once a move is chosen
  };

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setBalance(null);
    setNetwork(null);
    setError(null);
    setIsPlaying(false);
    setCountdown(null);
    setRemoteStream(null);
    setShowMoveSelection(false); // Reset move selection

    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
  };

  const connectWallet = async () => {
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
      peerConnection.current = new RTCPeerConnection();

      if (localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach(track => {
          peerConnection.current.addTrack(track, localVideoRef.current.srcObject);
        });
      }

      peerConnection.current.ontrack = (event) => {
        const [stream] = event.streams;
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        } else {
          console.error('remoteVideoRef is not ready yet.Retrying');
          setTimeout(() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
          }, 500);  // Retry after 500ms
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
        if (prev === 1) {
          clearInterval(interval);
          setCountdown(null);
          setShowMoveSelection(true); // Display move buttons after countdown
          console.log('Game Started!');
        }
        return prev - 1;
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
    socket.on('gameResult', (data) => {
      const { result } = data;
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
      <h1>Rock Paper Scissors</h1>

      {!account ? (
        <button onClick={connectWallet} className="btn-primary">
          Connect MetaMask
        </button>
      ) : (
        <div className="account-info">
          <p><strong>Account:</strong> {account}</p>
          <p><strong>Balance:</strong> {balance} ETH</p>
          <p><strong>Network:</strong> {network ? network.name : 'Unknown'}</p>
          <button onClick={disconnectWallet} className="btn-secondary">
            Disconnect
          </button>
          {!isPlaying && (
            <button onClick={startGame} className="btn-primary">
              Play
            </button>
          )}
        </div>
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
          <button onClick={() => handleMoveSelection('rock')} className="btn-primary">Rock</button>
          <button onClick={() => handleMoveSelection('paper')} className="btn-primary">Paper</button>
          <button onClick={() => handleMoveSelection('scissors')} className="btn-primary">Scissors</button>
        </div>
      )}
    </div>
  );
}

export default App;
