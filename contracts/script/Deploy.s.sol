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

        // Save deployment addresses to JSON
        string memory deploymentJson = _buildDeploymentJson(
            address(beliefPool),
            address(agoraGate),
            chroniclerAddress,
            block.chainid,
            block.timestamp
        );

        string memory outputPath = string.concat(
            "deployments/deployment-",
            vm.toString(block.chainid),
            ".json"
        );

        vm.writeJson(deploymentJson, outputPath);

        console.log("");
        console.log("=== CONFIGURATION ===");
        console.log("Chronicler can settle debates via: submitDebateVerdict()");
        console.log("Stalemate penalties sent to:", address(agoraGate));

        console.log("");
        console.log("=== FIXED BELIEFS INITIALIZED ===");
        console.log("1. Nihilism");
        console.log("2. Existentialism");
        console.log("3. Absurdism");
        console.log("4. Stoicism");

        console.log("");
        console.log("=== DEPLOYMENT SAVED ===");
        console.log("JSON file:", outputPath);

        console.log("");
        console.log("=== UPDATE .ENV ===");
        console.log("BELIEF_POOL=", address(beliefPool));
        console.log("AGORA_GATE=", address(agoraGate));
    }

    function _buildDeploymentJson(
        address beliefPool,
        address agoraGate,
        address chronicler,
        uint256 chainId,
        uint256 timestamp
    ) internal pure returns (string memory) {
        string memory json = "{";

        // Network info
        json = string.concat(json, '"network":{');
        json = string.concat(json, '"chainId":', vm.toString(chainId), ',');
        json = string.concat(json, '"name":"', _getNetworkName(chainId), '"');
        json = string.concat(json, '},');

        // Deployment info
        json = string.concat(json, '"deployment":{');
        json = string.concat(json, '"timestamp":', vm.toString(timestamp), ',');
        json = string.concat(json, '"version":"3.0"');
        json = string.concat(json, '},');

        // Contract addresses
        json = string.concat(json, '"contracts":{');
        json = string.concat(json, '"BeliefPool":"', vm.toString(beliefPool), '",');
        json = string.concat(json, '"AgoraGate":"', vm.toString(agoraGate), '"');
        json = string.concat(json, '},');

        // Configuration
        json = string.concat(json, '"configuration":{');
        json = string.concat(json, '"chroniclerAddress":"', vm.toString(chronicler), '",');
        json = string.concat(json, '"identityRegistry":"', vm.toString(IDENTITY_REGISTRY), '",');
        json = string.concat(json, '"reputationRegistry":"', vm.toString(REPUTATION_REGISTRY), '",');
        json = string.concat(json, '"stalematePenaltyBps":', vm.toString(STALEMATE_PENALTY_BPS), ',');
        json = string.concat(json, '"convictionPeriod":', vm.toString(CONVICTION_MULTIPLIER_PERIOD), ',');
        json = string.concat(json, '"entryFee":"', vm.toString(ENTRY_FEE), '"');
        json = string.concat(json, '},');

        // Beliefs
        json = string.concat(json, '"beliefs":[');
        json = string.concat(json, '{"id":1,"name":"Nihilism"},');
        json = string.concat(json, '{"id":2,"name":"Existentialism"},');
        json = string.concat(json, '{"id":3,"name":"Absurdism"},');
        json = string.concat(json, '{"id":4,"name":"Stoicism"}');
        json = string.concat(json, ']');

        json = string.concat(json, "}");

        return json;
    }

    function _getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum Mainnet";
        if (chainId == 5) return "Goerli";
        if (chainId == 11155111) return "Sepolia";
        if (chainId == 41454) return "Monad Testnet";
        return "Unknown";
    }
}
