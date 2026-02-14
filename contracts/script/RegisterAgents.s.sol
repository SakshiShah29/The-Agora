// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/interfaces/IIdentityRegistry.sol";

/**
 * @title RegisterAgents
 * @notice Registers 4 agents on the ERC-8004 IdentityRegistry (Monad testnet)
 * @dev Each agent registers itself — msg.sender == agent wallet
 *
 * Required env vars:
 *   AGENT_CAMUS_PRIVATE_KEY   - Private key for Camus
 *   AGENT_SERA_PRIVATE_KEY    - Private key for Sera
 *   AGENT_NIHILO_PRIVATE_KEY  - Private key for Nihilo
 *   AGENT_SENECA_PRIVATE_KEY  - Private key for Seneca
 *
 * Usage:
 *   forge script script/RegisterAgents.s.sol:RegisterAgents \
 *     --rpc-url https://testnet.monad.xyz \
 *     --broadcast
 */
contract RegisterAgents is Script {
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    string[4] agentNames = ["camus", "sera", "nihilo", "seneca"];

    function run() external {
        IIdentityRegistry registry = IIdentityRegistry(IDENTITY_REGISTRY);

        uint256[4] memory keys = [
            vm.envUint("AGENT_CAMUS_PRIVATE_KEY"),
            vm.envUint("AGENT_SERA_PRIVATE_KEY"),
            vm.envUint("AGENT_NIHILO_PRIVATE_KEY"),
            vm.envUint("AGENT_SENECA_PRIVATE_KEY")
        ];

        console.log("=== REGISTERING AGENTS ON ERC-8004 ===");
        console.log("Chain ID:", block.chainid);
        console.log("Registry:", IDENTITY_REGISTRY);
        console.log("");

        string memory json = "";

        for (uint256 i = 0; i < 4; i++) {
            address agentAddr = vm.addr(keys[i]);
            console.log("--- Agent:", agentNames[i], "---");
            console.log("Address:", agentAddr);

            vm.startBroadcast(keys[i]);
            uint256 agentId = registry.register();
            vm.stopBroadcast();

            console.log("Registered with agentId:", agentId);
            console.log("");

            // Build JSON entry for this agent
            string memory entry = string.concat(
                '"', agentNames[i], '":{"address":"',
                vm.toString(agentAddr),
                '","agentId":',
                vm.toString(agentId),
                "}"
            );
            if (i == 0) {
                json = entry;
            } else {
                json = string.concat(json, ",", entry);
            }
        }

        // Write registration output
        string memory output = string.concat(
            '{"chainId":', vm.toString(block.chainid),
            ',"registry":"', vm.toString(IDENTITY_REGISTRY),
            '","agents":{', json, "}}"
        );

        string memory outputPath = string.concat(
            "deployments/registered-agents-",
            vm.toString(block.chainid),
            ".json"
        );

        vm.writeJson(output, outputPath);

        console.log("=== ALL 4 AGENTS REGISTERED ===");
        console.log("Saved to:", outputPath);
    }
}
