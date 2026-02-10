// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IIdentityRegistry
 * @notice Interface for ERC-8004 Identity Registry deployed on Monad testnet
 * @dev Address: 0x8004A818BFB912233c491871b3d84c89A494BD9e
 */

struct MetadataEntry {
    string metadataKey;
    bytes metadataValue;
}

interface IIdentityRegistry is IERC721 {
    // Registration functions
    function register(string calldata agentURI) external returns (uint256 agentId);
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId);
    function register() external returns (uint256 agentId);

    // URI management
    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function tokenURI(uint256 agentId) external view returns (string memory);

    // Metadata management (for belief + conviction tracking)
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory);
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;

    // Wallet management
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external;
    function getAgentWallet(uint256 agentId) external view returns (address);
    function unsetAgentWallet(uint256 agentId) external;

    // Events
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
}
