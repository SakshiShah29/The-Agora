// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BeliefPool.sol";
import "../src/AgoraGate.sol";

/**
 * @title Deploy
 * @notice Deployment script for The Agora v3.0 contracts
 * @dev Integrates with existing ERC-8004 registries on Monad testnet
 */
contract Deploy is Script {
    // ERC-8004 Registry addresses on Monad testnet
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    // Configuration
    uint256 constant STALEMATE_PENALTY_BPS = 1000;  // 10%
    uint256 constant CONVICTION_MULTIPLIER_PERIOD = 30 days;
    uint256 constant ENTRY_FEE = 0.01 ether;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address chroniclerAddress = vm.envAddress("CHRONICLER_ADDRESS");

        console.log("=== DEPLOYING THE AGORA v3.0 ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Chronicler:", chroniclerAddress);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy BeliefPool
        console.log("=== Deploying BeliefPool ===");
        BeliefPool beliefPool = new BeliefPool(
            IDENTITY_REGISTRY,
            REPUTATION_REGISTRY,
            STALEMATE_PENALTY_BPS,
            CONVICTION_MULTIPLIER_PERIOD
        );
        console.log("BeliefPool deployed:", address(beliefPool));

        // Deploy AgoraGate
        console.log("\n=== Deploying AgoraGate ===");
        AgoraGate agoraGate = new AgoraGate(
            IDENTITY_REGISTRY,
            ENTRY_FEE
        );
        console.log("AgoraGate deployed:", address(agoraGate));

        // Link contracts
        console.log("\n=== Linking Contracts ===");
        beliefPool.setAgoraGateTreasury(address(agoraGate));
        beliefPool.setChroniclerAddress(chroniclerAddress);
        console.log("BeliefPool treasury set to:", address(agoraGate));
        console.log("Chronicler set to:", chroniclerAddress);

        vm.stopBroadcast();

        console.log("");
        console.log("=== CONFIGURATION ===");
        console.log("Chronicler can settle debates via: submitDebateVerdict()");
        console.log("Stalemate penalties sent to:", address(agoraGate));

        console.log("");
        console.log("=== FIXED BELIEFS INITIALIZED ===");
        console.log("1. Solar Vitalism");
        console.log("2. Rational Empiricism");
        console.log("3. Consciousness Fundamentalism");
        console.log("4. Collective Harmonism");
        console.log("5. Constructive Nihilism");

        console.log("");
        console.log("=== UPDATE .ENV ===");
        console.log("BELIEF_POOL=", address(beliefPool));
        console.log("AGORA_GATE=", address(agoraGate));
    }
}
