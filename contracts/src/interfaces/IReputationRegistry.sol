// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IReputationRegistry
 * @notice Interface for ERC-8004 Reputation Registry deployed on Monad testnet
 * @dev Address: 0x8004B663056A597Dffe9eCcC1965A193B7388713
 */
interface IReputationRegistry {
    // Feedback submission
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,           // Event type: debate_win, debate_loss, stalemate, conversion
        string calldata tag2,           // Strategy: logical, emotional, social_proof, demonstration
        string calldata endpoint,
        string calldata feedbackURI,    // IPFS link to debate transcript or evidence
        bytes32 feedbackHash
    ) external;

    // Feedback revocation
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

    // Response to feedback
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    // Query functions
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        int128 value,
        uint8 valueDecimals,
        string memory tag1,
        string memory tag2,
        bool isRevoked
    );

    function getClients(uint256 agentId) external view returns (address[] memory);
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);

    // Events
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );
}
