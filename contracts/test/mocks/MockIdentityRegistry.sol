// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockIdentityRegistry
 * @notice Mock implementation of ERC-8004 IdentityRegistry for testing
 */
contract MockIdentityRegistry is ERC721 {
    uint256 private _nextTokenId = 1;

    mapping(uint256 => string) private _agentURIs;
    mapping(uint256 => address) private _agentWallets;
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);

    constructor() ERC721("MockAgoraAgent", "MAGORA") {}

    function register(string calldata agentURI) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _agentURIs[tokenId] = agentURI;
        emit Registered(tokenId, agentURI, msg.sender);
        return tokenId;
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        _agentURIs[agentId] = newURI;
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }

    function setAgentWallet(uint256 agentId, address wallet) external {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        _agentWallets[agentId] = wallet;
    }

    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external {
        // In the mock, allow any caller to set metadata (for testing purposes)
        // In production ERC-8004, this might have different permission logic
        require(_ownerOf(agentId) != address(0), "Token does not exist");
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    function tokenURI(uint256 agentId) public view override returns (string memory) {
        require(_ownerOf(agentId) != address(0), "Token does not exist");
        return _agentURIs[agentId];
    }
}
