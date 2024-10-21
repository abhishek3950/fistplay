require("@nomiclabs/hardhat-etherscan");
require("@nomicfoundation/hardhat-ethers"); // Correct for ethers@6.x
require("@openzeppelin/hardhat-upgrades");
require('dotenv').config(); // Add this line to load .env

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20", // For contracts using Solidity ^0.8.20 (OpenZeppelin contracts)
      },
    ],
  },
  networks: {
    sepoliaBase: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],   // Your private key for deployment
      chainId: 84532, 
    },
  },
  etherscan: {
    apiKey: "YOUR_ETHERSCAN_API_KEY" // Replace with Base Sepolia API key
  },customChains: [
    {
      network: "sepoliaBase",                // Custom name for the network
      chainId: 84532,                        // Base Sepolia chain ID
      urls: {
        apiURL: "https://api-sepolia.basescan.org/api",
        browserURL: "https://sepolia-explorer.base.org",     // Base Sepolia block explorer URL
      },
    },
  ],
};
