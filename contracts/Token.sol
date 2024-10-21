// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Token is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    // Initializes the contract with the name, symbol, and owner
    function initialize() initializer public {
        __ERC20_init("RockPaperScissors", "RPS");
        __Ownable_init();
    }

    // Mint new tokens to the winner's address
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
