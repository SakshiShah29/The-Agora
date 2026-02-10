// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockValidationRegistry
 * @notice Mock implementation of ERC-8004 ValidationRegistry for testing
 */
contract MockValidationRegistry {
    struct Validation {
        address validatorAddress;
        uint256 agentId;
        uint8 response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
    }

    mapping(bytes32 => Validation) public validations;

    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        validations[requestHash] = Validation({
            validatorAddress: msg.sender,
            agentId: 0, // Not used in mock
            response: response,
            responseHash: responseHash,
            tag: tag,
            lastUpdate: block.timestamp
        });

        emit ValidationResponse(
            msg.sender,
            0,
            requestHash,
            response,
            responseURI,
            responseHash,
            tag
        );
    }

    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    ) {
        Validation memory v = validations[requestHash];
        return (
            v.validatorAddress,
            v.agentId,
            v.response,
            v.responseHash,
            v.tag,
            v.lastUpdate
        );
    }
}
