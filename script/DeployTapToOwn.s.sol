// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TapToOwn} from "../src/TapToOwn.sol";

contract DeployTapToOwnScript is Script {
    function run() external returns (TapToOwn arena) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        arena = new TapToOwn();

        vm.stopBroadcast();

        console2.log("==================================================");
        console2.log("  TapToOwn Contract Deployed Successfully!");
        console2.log("  Address:", address(arena));
        console2.log("  Target: Monad Testnet (Chain ID 10143)");
        console2.log("==================================================");
    }
}
