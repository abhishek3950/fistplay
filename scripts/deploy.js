const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Get the contract factory
    const Token = await ethers.getContractFactory("Token");

    // Deploy the proxy contract using OpenZeppelin's upgrades library
    const token = await upgrades.deployProxy(Token, { initializer: "initialize" });

    // Check if deployTransaction exists, otherwise log an error
    if (token.deployTransaction) {
        console.log("Waiting for deployment transaction to be mined...");
        await token.deployTransaction.wait();
        console.log("Token deployed to:", token.address);
    } else {
        console.error("Deployment transaction missing or not returned as expected.");
    }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
