// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================================
//  LOCAL DEPLOYMENT SCRIPT
//  Deploys MockERC8004 + AgoraGate + BeliefPool on a local chain (Anvil/Hardhat).
//  Registers 8 test agents using Anvil default accounts.
//
//  Account layout (Anvil default accounts):
//    Account 0  = Deployer / Contract Owner
//    Accounts 1-8 = 8 Test Agents (each owns their agent NFT + wallet)
//    Account 9  = Chronicler (submits debate verdicts)
//
//  Agents:
//    1. Camus      (Account 1)
//    2. Dread      (Account 2)
//    3. Epicteta   (Account 3)
//    4. Kael       (Account 4)
//    5. Nihilo     (Account 5)
//    6. Seneca     (Account 6)
//    7. Sera       (Account 7)
//    8. Voyd       (Account 8)
//
//  Usage:
//    anvil  (in a separate terminal)
//    forge script script/DeployLocal.s.sol:DeployLocal --broadcast --rpc-url http://localhost:8545
// ============================================================================

import "forge-std/Script.sol";
import "../src/mocks/MockERC8004.sol";
import "../src/BeliefPool.sol";
import "../src/AgoraGate.sol";

/**
 * @title DeployLocal
 * @notice Local deployment script that deploys MockERC8004 first, registers
 *         8 test agents using Anvil accounts 1-8, then deploys and links
 *         AgoraGate and BeliefPool. Account 9 is the Chronicler.
 * @dev Intended for Anvil / Hardhat local chains only.
 */
contract DeployLocal is Script {

    // ========== CONFIGURATION ==========

    uint256 constant STALEMATE_PENALTY_BPS = 1000;           // 10%
    uint256 constant DEBATE_DIVIDEND_BPS = 1000;              // 10%
    uint256 constant ENTRY_FEE = 0.01 ether;
    uint256 constant NUM_TEST_AGENTS = 8;

    // ========== ANVIL DEFAULT PRIVATE KEYS (accounts 0-9) ==========
    // These are Anvil's well-known default keys. NEVER use on a real network.

    uint256 constant DEPLOYER_KEY    = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // Account 0
    uint256 constant AGENT_KEY_1     = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d; // Account 1
    uint256 constant AGENT_KEY_2     = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a; // Account 2
    uint256 constant AGENT_KEY_3     = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6; // Account 3
    uint256 constant AGENT_KEY_4     = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a; // Account 4
    uint256 constant AGENT_KEY_5     = 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba; // Account 5
    uint256 constant AGENT_KEY_6     = 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e; // Account 6
    uint256 constant AGENT_KEY_7     = 0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356; // Account 7
    uint256 constant AGENT_KEY_8     = 0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97; // Account 8
    uint256 constant CHRONICLER_KEY  = 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6; // Account 9

    // ========== TEST AGENT NAMES & URIs ==========

    function _agentName(uint256 index) internal pure returns (string memory) {
        if (index == 0) return "Camus";
        if (index == 1) return "Dread";
        if (index == 2) return "Epicteta";
        if (index == 3) return "Kael";
        if (index == 4) return "Nihilo";
        if (index == 5) return "Seneca";
        if (index == 6) return "Sera";
        if (index == 7) return "Voyd";
        return "Unknown";
    }

    function _agentURI(uint256 index) internal pure returns (string memory) {
        if (index == 0) return "ipfs://agent-camus";
        if (index == 1) return "ipfs://agent-dread";
        if (index == 2) return "ipfs://agent-epicteta";
        if (index == 3) return "ipfs://agent-kael";
        if (index == 4) return "ipfs://agent-nihilo";
        if (index == 5) return "ipfs://agent-seneca";
        if (index == 6) return "ipfs://agent-sera";
        if (index == 7) return "ipfs://agent-voyd";
        return "";
    }

    // ========== MAIN DEPLOYMENT FUNCTION ==========

    function run() external {
        address deployer = vm.addr(DEPLOYER_KEY);
        address chroniclerAddress = vm.addr(CHRONICLER_KEY);

        // Collect agent private keys and addresses
        uint256[8] memory agentKeys = [
            AGENT_KEY_1, AGENT_KEY_2, AGENT_KEY_3, AGENT_KEY_4,
            AGENT_KEY_5, AGENT_KEY_6, AGENT_KEY_7, AGENT_KEY_8
        ];

        address[8] memory agentAddresses;
        for (uint256 i = 0; i < NUM_TEST_AGENTS; i++) {
            agentAddresses[i] = vm.addr(agentKeys[i]);
        }

        console.log("========================================");
        console.log("  THE AGORA - LOCAL DEPLOYMENT");
        console.log("========================================");
        console.log("");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer (Account 0):", deployer);
        console.log("Chronicler (Account 9):", chroniclerAddress);
        console.log("");

        // -------------------------------------------------------
        // Step 1: Deploy MockERC8004 (as deployer)
        // -------------------------------------------------------
        vm.startBroadcast(DEPLOYER_KEY);

        console.log("--- Step 1: Deploy MockERC8004 ---");
        MockERC8004 mockIdentity = new MockERC8004();
        console.log("MockERC8004 deployed at:", address(mockIdentity));
        console.log("");

        vm.stopBroadcast();

        // -------------------------------------------------------
        // Step 2: Register 8 agents (each agent registers themselves)
        //         Owner address = Wallet address for local testing
        // -------------------------------------------------------
        console.log("--- Step 2: Register 8 Test Agents ---");

        uint256[8] memory agentIds;

        for (uint256 i = 0; i < NUM_TEST_AGENTS; i++) {
            // Each agent broadcasts from their own Anvil account
            vm.startBroadcast(agentKeys[i]);

            uint256 agentId = mockIdentity.register(_agentURI(i));
            agentIds[i] = agentId;

            console.log("  Agent", i + 1);
            console.log("    Name:", _agentName(i));
            console.log("    ID:", agentId);
            console.log("    Owner/Wallet:", agentAddresses[i]);

            vm.stopBroadcast();
        }

        console.log("");
        console.log("  Total agents registered:", mockIdentity.totalRegistered());
        console.log("");

        // -------------------------------------------------------
        // Step 3: Deploy AgoraGate (as deployer)
        // -------------------------------------------------------
        vm.startBroadcast(DEPLOYER_KEY);

        console.log("--- Step 3: Deploy AgoraGate ---");
        AgoraGate agoraGate = new AgoraGate(
            address(mockIdentity),
            ENTRY_FEE
        );
        console.log("AgoraGate deployed at:", address(agoraGate));
        console.log("  Entry fee:", ENTRY_FEE);
        console.log("");

        // -------------------------------------------------------
        // Step 4: Deploy BeliefPool (as deployer)
        // -------------------------------------------------------
        console.log("--- Step 4: Deploy BeliefPool ---");
        BeliefPool beliefPool = new BeliefPool(
            address(mockIdentity),
            STALEMATE_PENALTY_BPS,
            DEBATE_DIVIDEND_BPS
        );
        console.log("BeliefPool deployed at:", address(beliefPool));
        console.log("  Stalemate penalty:", STALEMATE_PENALTY_BPS, "bps");
        console.log("  Debate dividend:", DEBATE_DIVIDEND_BPS, "bps");
        console.log("");

        // -------------------------------------------------------
        // Step 5: Link contracts (as deployer/owner)
        // -------------------------------------------------------
        console.log("--- Step 5: Link Contracts ---");
        beliefPool.setAgoraGateTreasury(address(agoraGate));
        beliefPool.setChroniclerAddress(chroniclerAddress);
        agoraGate.setBeliefPoolAddress(address(beliefPool));
        console.log("  BeliefPool -> AgoraGate treasury:", address(agoraGate));
        console.log("  BeliefPool -> Chronicler:", chroniclerAddress);
        console.log("  AgoraGate  -> BeliefPool:", address(beliefPool));
        console.log("");

        vm.stopBroadcast();

        // -------------------------------------------------------
        // Step 6: Save deployment JSON
        // -------------------------------------------------------
        string memory deploymentJson = _buildLocalDeploymentJson(
            address(mockIdentity),
            address(agoraGate),
            address(beliefPool),
            chroniclerAddress,
            deployer,
            agentIds,
            agentAddresses
        );

        string memory outputPath = string.concat(
            "deployments/deployment-local-",
            vm.toString(block.chainid),
            ".json"
        );

        vm.writeJson(deploymentJson, outputPath);

        // -------------------------------------------------------
        // Summary
        // -------------------------------------------------------
        console.log("========================================");
        console.log("  DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("");
        console.log("Contracts:");
        console.log("  MockERC8004:  ", address(mockIdentity));
        console.log("  AgoraGate:    ", address(agoraGate));
        console.log("  BeliefPool:   ", address(beliefPool));
        console.log("");
        console.log("Roles:");
        console.log("  Deployer/Owner (Acct 0):", deployer);
        console.log("  Chronicler (Acct 9):    ", chroniclerAddress);
        console.log("");
        console.log("Test Agents (8 registered, IDs 1-8):");
        for (uint256 i = 0; i < NUM_TEST_AGENTS; i++) {
            console.log("  ", _agentName(i));
            console.log("    ID:", agentIds[i]);
            console.log("    Address:", agentAddresses[i]);
        }
        console.log("");
        console.log("  Owner address = Wallet address (same Anvil account)");
        console.log("  Each Anvil account pre-funded with 10000 ETH");
        console.log("");
        console.log("Beliefs:");
        console.log("  1. Nihilism");
        console.log("  2. Existentialism");
        console.log("  3. Absurdism");
        console.log("  4. Stoicism");
        console.log("");
        console.log("Deployment JSON:", outputPath);
        console.log("");
        console.log("========================================");
        console.log("  .env VALUES");
        console.log("========================================");
        console.log("MOCK_ERC8004=", address(mockIdentity));
        console.log("AGORA_GATE=", address(agoraGate));
        console.log("BELIEF_POOL=", address(beliefPool));
        console.log("CHRONICLER_ADDRESS=", chroniclerAddress);
    }

    // ========== JSON BUILDER ==========

    function _buildLocalDeploymentJson(
        address mockIdentity,
        address agoraGate,
        address beliefPool,
        address chronicler,
        address deployer,
        uint256[8] memory agentIds,
        address[8] memory agentOwners
    ) internal view returns (string memory) {
        string memory json = "{";

        // Network
        json = string.concat(json, '"network":{');
        json = string.concat(json, '"chainId":', vm.toString(block.chainid), ',');
        json = string.concat(json, '"name":"Local (Anvil/Hardhat)",');
        json = string.concat(json, '"isLocal":true');
        json = string.concat(json, '},');

        // Deployment
        json = string.concat(json, '"deployment":{');
        json = string.concat(json, '"version":"3.0-local"');
        json = string.concat(json, '},');

        // Contracts
        json = string.concat(json, '"contracts":{');
        json = string.concat(json, '"MockERC8004":"', vm.toString(mockIdentity), '",');
        json = string.concat(json, '"AgoraGate":"', vm.toString(agoraGate), '",');
        json = string.concat(json, '"BeliefPool":"', vm.toString(beliefPool), '"');
        json = string.concat(json, '},');

        // Configuration
        json = string.concat(json, '"configuration":{');
        json = string.concat(json, '"deployer":"', vm.toString(deployer), '",');
        json = string.concat(json, '"chroniclerAddress":"', vm.toString(chronicler), '",');
        json = string.concat(json, '"identityRegistry":"', vm.toString(mockIdentity), '",');
        json = string.concat(json, '"stalematePenaltyBps":', vm.toString(STALEMATE_PENALTY_BPS), ',');
        json = string.concat(json, '"debateDividendBps":', vm.toString(DEBATE_DIVIDEND_BPS), ',');
        json = string.concat(json, '"entryFee":"', vm.toString(ENTRY_FEE), '"');
        json = string.concat(json, '},');

        // Agents
        json = string.concat(json, '"agents":[');
        for (uint256 i = 0; i < NUM_TEST_AGENTS; i++) {
            if (i > 0) json = string.concat(json, ',');
            json = string.concat(json, '{');
            json = string.concat(json, '"id":', vm.toString(agentIds[i]), ',');
            json = string.concat(json, '"name":"', _agentName(i), '",');
            json = string.concat(json, '"owner":"', vm.toString(agentOwners[i]), '",');
            json = string.concat(json, '"wallet":"', vm.toString(agentOwners[i]), '"');
            json = string.concat(json, '}');
        }
        json = string.concat(json, '],');

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
}
