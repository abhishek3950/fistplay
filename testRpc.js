// testRpc.js

const { ethers } = require('ethers');
require('dotenv').config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

async function checkNetwork() {
  try {
    const network = await provider.getNetwork();
    console.log('Connected to network:', network.name);
  } catch (error) {
    console.error('Failed to connect to RPC:', error);
  }
}

checkNetwork();
