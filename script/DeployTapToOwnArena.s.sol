// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TapToOwnArena} from "../src/TapToOwnArena.sol";

contract DeployTapToOwnArenaScript is Script {
    function run() external returns (TapToOwnArena arena) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        arena = new TapToOwnArena(deployer);

        vm.stopBroadcast();

        console2.log("==================================================");
        console2.log("  TapToOwnArena Deployed Successfully on Monad!");
        console2.log("  Contract Address :", address(arena));
        console2.log("  Owner / Admin    :", deployer);
        console2.log("  Chain ID         : 10143 (Monad Testnet)");
        console2.log("==================================================");
    }
}
