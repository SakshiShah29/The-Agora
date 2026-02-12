// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================================
//  WARNING: THIS CONTRACT IS FOR LOCAL TESTING ONLY.
//  DO NOT DEPLOY TO MAINNET OR ANY PRODUCTION ENVIRONMENT.
//  This mock has simplified access controls and no production-grade security.
// ============================================================================

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IIdentityRegistry.sol";

/**
 * @title MockERC8004
 * @notice Mock implementation of the ERC-8004 Identity Registry for local blockchain testing.
 * @dev Implements the IIdentityRegistry interface with simplified logic suitable for
 *      Hardhat/Anvil testing. Integrates with AgoraGate and BeliefPool contracts.
 *
 *      This contract provides:
 *      - ERC-721 based agent identity tokens
 *      - Simplified registration (no verification required)
 *      - Agent wallet management (no signature verification for testing)
 *      - Key-value metadata storage per agent
 *      - Admin batch-registration for setting up test scenarios
 *
 *      NOT FOR PRODUCTION USE. All access controls are intentionally relaxed.
 */
contract MockERC8004 is ERC721, Ownable {

    // ========== STATE VARIABLES ==========

    /// @dev Next token ID to mint. Starts at 1 so that ID 0 is never valid.
    uint256 private _nextTokenId;

    /// @dev Agent URI storage (agentId => URI string)
    mapping(uint256 => string) private _agentURIs;

    /// @dev Agent wallet overrides (agentId => wallet address)
    mapping(uint256 => address) private _agentWallets;

    /// @dev Key-value metadata storage (agentId => key => value)
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    /// @dev Total number of registered agents
    uint256 public totalRegistered;

    /// @dev Quick lookup: address has at least one agent registered
    mapping(address => bool) public hasIdentity;

    /// @dev Lookup: address => list of owned agent IDs (convenience for testing)
    mapping(address => uint256[]) private _ownedAgents;

    // ========== EVENTS ==========

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);
    event AgentWalletUnset(uint256 indexed agentId);
    event BatchRegistered(uint256 count, address indexed registeredBy);

    // ========== CONSTRUCTOR ==========

    /**
     * @notice Deploy the mock ERC-8004 identity registry.
     * @dev Token IDs start at 1. ID 0 is reserved as "no agent".
     */
    constructor() ERC721("MockERC8004Agent", "M8004") Ownable(msg.sender) {
        _nextTokenId = 1;
    }

    // ========== REGISTRATION FUNCTIONS ==========

    /**
     * @notice Register a new agent identity with a URI.
     * @param agentURI The metadata URI for the agent (e.g., IPFS hash).
     * @return agentId The newly minted token ID.
     */
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
    }

    /**
     * @notice Register a new agent identity with a URI and initial metadata.
     * @param agentURI The metadata URI for the agent.
     * @param metadata Array of key-value metadata entries to set on registration.
     * @return agentId The newly minted token ID.
     */
    function register(
        string calldata agentURI,
        MetadataEntry[] calldata metadata
    ) external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);

        for (uint256 i = 0; i < metadata.length; i++) {
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(
                agentId,
                metadata[i].metadataKey,
                metadata[i].metadataKey,
                metadata[i].metadataValue
            );
        }
    }

    /**
     * @notice Register a new agent identity with no URI.
     * @return agentId The newly minted token ID.
     */
    function register() external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, "");
    }

    // ========== ADMIN / TEST HELPER FUNCTIONS ==========

    /**
     * @notice Admin function to register an agent on behalf of another address.
     * @dev Only callable by the contract owner. Useful for setting up test scenarios.
     * @param owner The address that will own the agent NFT.
     * @param agentURI The metadata URI for the agent.
     * @return agentId The newly minted token ID.
     */
    function adminRegister(
        address owner,
        string calldata agentURI
    ) external onlyOwner returns (uint256 agentId) {
        require(owner != address(0), "MockERC8004: zero address owner");
        agentId = _mintAgent(owner, agentURI);
    }

    /**
     * @notice Admin batch registration of multiple agents.
     * @dev Only callable by the contract owner. Registers one agent per address.
     *      Useful for setting up the 9 test agents required by The Agora.
     * @param owners Array of addresses that will each receive an agent NFT.
     * @param agentURIs Array of metadata URIs, one per agent. Must match owners length.
     * @return agentIds Array of newly minted token IDs.
     */
    function adminBatchRegister(
        address[] calldata owners,
        string[] calldata agentURIs
    ) external onlyOwner returns (uint256[] memory agentIds) {
        require(owners.length == agentURIs.length, "MockERC8004: length mismatch");
        require(owners.length > 0, "MockERC8004: empty arrays");

        agentIds = new uint256[](owners.length);

        for (uint256 i = 0; i < owners.length; i++) {
            require(owners[i] != address(0), "MockERC8004: zero address owner");
            agentIds[i] = _mintAgent(owners[i], agentURIs[i]);
        }

        emit BatchRegistered(owners.length, msg.sender);
    }

    /**
     * @notice Admin function to set an agent's wallet without signature verification.
     * @dev In the real ERC-8004, setAgentWallet requires a deadline and signature.
     *      This mock skips that verification for testing convenience.
     * @param agentId The agent token ID.
     * @param wallet The wallet address to associate with the agent.
     */
    function adminSetAgentWallet(uint256 agentId, address wallet) external onlyOwner {
        require(_ownerOf(agentId) != address(0), "MockERC8004: nonexistent agent");
        _agentWallets[agentId] = wallet;
        emit AgentWalletSet(agentId, wallet);
    }

    // ========== URI MANAGEMENT ==========

    /**
     * @notice Update the URI for an agent.
     * @param agentId The agent token ID.
     * @param newURI The new metadata URI.
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(
            ownerOf(agentId) == msg.sender,
            "MockERC8004: caller is not agent owner"
        );
        _agentURIs[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /**
     * @notice Get the URI for an agent token.
     * @param agentId The agent token ID.
     * @return The agent's metadata URI.
     */
    function tokenURI(uint256 agentId) public view override returns (string memory) {
        require(_ownerOf(agentId) != address(0), "MockERC8004: nonexistent agent");
        return _agentURIs[agentId];
    }

    // ========== METADATA MANAGEMENT ==========

    /**
     * @notice Get a metadata value for an agent.
     * @param agentId The agent token ID.
     * @param key The metadata key to look up.
     * @return The metadata value as bytes.
     */
    function getMetadata(
        uint256 agentId,
        string calldata key
    ) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    /**
     * @notice Set a metadata value for an agent.
     * @dev In this mock, any caller can set metadata to simplify testing.
     *      The real ERC-8004 has more restrictive permissions. This allows
     *      BeliefPool to call setMetadata during stake migration without
     *      needing special authorization setup in tests.
     * @param agentId The agent token ID.
     * @param key The metadata key.
     * @param value The metadata value as bytes.
     */
    function setMetadata(
        uint256 agentId,
        string calldata key,
        bytes calldata value
    ) external {
        require(_ownerOf(agentId) != address(0), "MockERC8004: nonexistent agent");
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    // ========== WALLET MANAGEMENT ==========

    /**
     * @notice Set the agent wallet with signature verification (mock: skips verification).
     * @dev The real ERC-8004 interface requires deadline and signature params.
     *      This mock accepts them for interface compatibility but ignores them.
     * @param agentId The agent token ID.
     * @param newWallet The wallet address to set.
     * @param deadline Ignored in mock.
     * @param signature Ignored in mock.
     */
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        // Suppress unused variable warnings
        deadline;
        signature;

        require(
            ownerOf(agentId) == msg.sender,
            "MockERC8004: caller is not agent owner"
        );
        _agentWallets[agentId] = newWallet;
        emit AgentWalletSet(agentId, newWallet);
    }

    /**
     * @notice Get the wallet address associated with an agent.
     * @param agentId The agent token ID.
     * @return The wallet address, or address(0) if none is set.
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }

    /**
     * @notice Remove the wallet association for an agent.
     * @param agentId The agent token ID.
     */
    function unsetAgentWallet(uint256 agentId) external {
        require(
            ownerOf(agentId) == msg.sender,
            "MockERC8004: caller is not agent owner"
        );
        delete _agentWallets[agentId];
        emit AgentWalletUnset(agentId);
    }

    // ========== VIEW / QUERY FUNCTIONS ==========

    /**
     * @notice Check whether a given agent ID exists (has been minted).
     * @param agentId The agent token ID.
     * @return True if the agent exists.
     */
    function agentExists(uint256 agentId) external view returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    /**
     * @notice Check whether an address is a verified identity holder.
     * @dev For this mock, any address that has registered at least one agent
     *      is considered verified. The real ERC-8004 may have stricter checks.
     * @param account The address to check.
     * @return True if the address owns at least one agent.
     */
    function isVerified(address account) external view returns (bool) {
        return hasIdentity[account];
    }

    /**
     * @notice Get the list of agent IDs owned by an address.
     * @dev Convenience function for testing. Not part of the ERC-8004 standard.
     * @param owner The address to query.
     * @return Array of agent token IDs.
     */
    function getOwnedAgents(address owner) external view returns (uint256[] memory) {
        return _ownedAgents[owner];
    }

    /**
     * @notice Get the next token ID that will be minted.
     * @return The next token ID.
     */
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    // ========== INTERNAL FUNCTIONS ==========

    /**
     * @dev Internal minting logic shared by all registration functions.
     * @param to The address to mint the agent NFT to.
     * @param agentURI The metadata URI for the agent.
     * @return agentId The newly minted token ID.
     */
    function _mintAgent(address to, string memory agentURI) internal returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(to, agentId);
        _agentURIs[agentId] = agentURI;
        _ownedAgents[to].push(agentId);

        if (!hasIdentity[to]) {
            hasIdentity[to] = true;
        }
        totalRegistered++;

        emit Registered(agentId, agentURI, to);
    }
}
