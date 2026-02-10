// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockReputationRegistry
 * @notice Mock implementation of ERC-8004 ReputationRegistry for testing
 */
contract MockReputationRegistry {
    struct Feedback {
        uint256 agentId;
        address clientAddress;
        uint64 feedbackIndex;
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string feedbackURI;
        bytes32 feedbackHash;
    }

    mapping(uint256 => mapping(uint64 => Feedback)) public feedback;
    mapping(uint256 => uint64) public feedbackCount;

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

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        uint64 index = feedbackCount[agentId]++;

        feedback[agentId][index] = Feedback({
            agentId: agentId,
            clientAddress: msg.sender,
            feedbackIndex: index,
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            feedbackURI: feedbackURI,
            feedbackHash: feedbackHash
        });

        emit NewFeedback(
            agentId,
            msg.sender,
            index,
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    function getFeedback(uint256 agentId, uint64 index) external view returns (Feedback memory) {
        return feedback[agentId][index];
    }

    function getFeedbackCount(uint256 agentId) external view returns (uint64) {
        return feedbackCount[agentId];
    }
}
