Project Overview
This project is an interactive, real-time online version of the classic game Rock-Paper-Scissors, where two players are matched randomly and play the game over a peer-to-peer connection using WebRTC technology. The game leverages AI for gesture recognition, allowing users to physically display their hand gestures (rock, paper, or scissors) in front of their webcam, and the system automatically detects and evaluates their move.

Key Features
Real-time Multiplayer Matching: Players are randomly matched with opponents using Socket.IO for real-time communication, ensuring an engaging competitive experience.

AI-Powered Gesture Recognition: We use TensorFlow.js and the HandPose model to detect a player’s hand gesture (rock, paper, or scissors) through their webcam. The game automatically recognizes and evaluates the gestures during gameplay.

WebRTC Video Streaming: Both players can see each other through live video streaming facilitated by WebRTC. This makes the game interactive and more engaging as players face off in real-time.

Rematch and New Opponent Options: After a match, players can choose to either rematch the same opponent or find a new opponent to play with, with the system re-entering them into the matchmaking queue accordingly.

Technologies Used
WebRTC: Facilitates the real-time peer-to-peer video stream between players.
Socket.IO: Enables real-time communication and signaling between the clients and the server for matchmaking and game logic.
TensorFlow.js (HandPose Model): Detects hand gestures from the player’s webcam to identify their chosen move.
Node.js: Powers the backend, handling connections, matchmaking, and signaling.
Express.js: Serves the frontend and static files, while managing the HTTP server.
Goals
The main objective of this project is to combine gesture recognition AI with WebRTC-based video streaming to create an immersive, multiplayer game experience. By integrating real-time hand gesture detection, we aim to make the classic Rock-Paper-Scissors game more engaging and interactive for players, enhancing their online gaming experience.

Known Issues
Occasional video stream issues for some players.
Synchronization problems during rematches or when switching to a new opponent.
Future Improvements
Improve Gesture Detection Accuracy: Enhancing the AI model’s accuracy and responsiveness.
User Interface Enhancements: Adding more intuitive UI/UX elements for a better player experience.
Enhanced Matchmaking: Further refining the matchmaking algorithm to handle edge cases more gracefully.