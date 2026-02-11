// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IIdentityRegistry.sol";

/**
 * @title AgoraGate
 * @notice Simple entry gate and treasury for The Agora
 * @dev Integrates with ERC-8004 IdentityRegistry to verify agent registration
 */
contract AgoraGate is Ownable, ReentrancyGuard {

    // ========== STATE VARIABLES ==========

    IIdentityRegistry public immutable identityRegistry;

    mapping(uint256 => uint256) public entryTimestamp;
    uint256 public entryFee;
    uint256 public totalEntered;
    address public beliefPoolAddress;

    // ========== EVENTS ==========

    event AgentEntered(uint256 indexed agentId, address indexed wallet, uint256 timestamp);
    event AgentExited(uint256 indexed agentId);
    event PenaltyReceived(uint256 amount, address indexed from);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event BeliefPoolAddressUpdated(address indexed beliefPool);

    // ========== CONSTRUCTOR ==========

    constructor(address _identityRegistry, uint256 _entryFee) Ownable(msg.sender) {
        require(_identityRegistry != address(0), "Invalid registry");
        identityRegistry = IIdentityRegistry(_identityRegistry);
        entryFee = _entryFee;
    }

    // ========== ENTRY FUNCTION ==========

    /**
     * @notice Enter The Agora
     * @param agentId Agent's ERC-721 token ID from IdentityRegistry
     */
    function enter(uint256 agentId) external payable {
        require(msg.value >= entryFee, "Insufficient entry fee");
        require(entryTimestamp[agentId] == 0, "Already entered");

        address owner = identityRegistry.ownerOf(agentId);
        require(owner == msg.sender, "Not agent owner");

        entryTimestamp[agentId] = block.timestamp;
        totalEntered++;

        emit AgentEntered(agentId, msg.sender, block.timestamp);
    }

    /**
     * @notice Exit The Agora (called by BeliefPool when agent fully unstakes)
     * @param agentId Agent's ID
     */
    function exitAgent(uint256 agentId) external {
        require(msg.sender == beliefPoolAddress, "Only BeliefPool");
        require(entryTimestamp[agentId] > 0, "Not entered");

        entryTimestamp[agentId] = 0;
        emit AgentExited(agentId);
    }

    // ========== TREASURY FUNCTIONS ==========

    /**
     * @notice Receive stalemate penalties from BeliefPool
     */
    function receivePenalty() external payable {
        require(msg.value > 0, "No value sent");
        emit PenaltyReceived(msg.value, msg.sender);
    }

    /**
     * @notice Emergency treasury withdrawal
     */
    function withdrawTreasury(address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");

        emit TreasuryWithdrawn(to, amount);
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @notice Check if agent has entered
     */
    function hasEntered(uint256 agentId) external view returns (bool) {
        return entryTimestamp[agentId] > 0;
    }

    /**
     * @notice Get entry timestamp
     */
    function getEntryTime(uint256 agentId) external view returns (uint256) {
        return entryTimestamp[agentId];
    }

    /**
     * @notice Get treasury balance
     */
    function treasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ========== ADMIN FUNCTIONS ==========

    /**
     * @notice Update entry fee
     */
    function setEntryFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = entryFee;
        entryFee = newFee;
        emit EntryFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Set BeliefPool address (only owner, one-time setup)
     */
    function setBeliefPoolAddress(address _beliefPool) external onlyOwner {
        require(_beliefPool != address(0), "Invalid address");
        require(beliefPoolAddress == address(0), "Already set");
        beliefPoolAddress = _beliefPool;
        emit BeliefPoolAddressUpdated(_beliefPool);
    }

    // ========== RECEIVE FUNCTION ==========

    /**
     * @notice Receive function for direct transfers
     */
    receive() external payable {
        emit PenaltyReceived(msg.value, msg.sender);
    }
}
