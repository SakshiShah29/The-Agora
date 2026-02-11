// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BeliefPool.sol";
import "../src/AgoraGate.sol";
import "./mocks/MockIdentityRegistry.sol";
import "./mocks/MockReputationRegistry.sol";

contract BeliefPoolTest is Test {
    BeliefPool public beliefPool;
    AgoraGate public agoraGate;
    MockIdentityRegistry public identityRegistry;
    MockReputationRegistry public reputationRegistry;

    address public deployer;
    address public alice;
    address public bob;
    address public chronicler;

    uint256 public aliceAgentId;
    uint256 public bobAgentId;

    uint256 constant STALEMATE_PENALTY_BPS = 1000; // 10%
    uint256 constant CONVICTION_PERIOD = 30 days;
    uint256 constant ENTRY_FEE = 0.01 ether;

    event Staked(uint256 indexed agentId, uint256 indexed beliefId, uint256 amount, uint256 timestamp);
    event Unstaked(uint256 indexed agentId, uint256 indexed beliefId, uint256 amount);
    event StakeMigrated(uint256 indexed agentId, uint256 fromBeliefId, uint256 toBeliefId, uint256 amount);
    event DebateEscrowCreated(uint256 indexed debateId, uint256 agentAId, uint256 agentBId, uint256 stakeAmount);
    event DebateEscrowMatched(uint256 indexed debateId, uint256 agentBId);
    event DebateSettled(uint256 indexed debateId, uint256 winnerId, uint256 amount, string outcome);
    event StalematePenaltyPaid(uint256 indexed debateId, uint256 penaltyAmount);
    event ReputationUpdated(uint256 indexed agentId, int128 newScore, int128 delta);
    event AgentExited(uint256 indexed agentId);

    function setUp() public {
        deployer = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        chronicler = makeAddr("chronicler");

        // Deploy mocks
        identityRegistry = new MockIdentityRegistry();
        reputationRegistry = new MockReputationRegistry();

        // Deploy contracts (v3.0 - no ValidationRegistry, no ReputationRegistry)
        beliefPool = new BeliefPool(
            address(identityRegistry),
            STALEMATE_PENALTY_BPS,
            CONVICTION_PERIOD
        );

        agoraGate = new AgoraGate(
            address(identityRegistry),
            ENTRY_FEE
        );

        // Link contracts
        beliefPool.setAgoraGateTreasury(address(agoraGate));
        beliefPool.setChroniclerAddress(chronicler);
        agoraGate.setBeliefPoolAddress(address(beliefPool));

        // Register agents
        vm.prank(alice);
        aliceAgentId = identityRegistry.register("ipfs://alice");

        vm.prank(bob);
        bobAgentId = identityRegistry.register("ipfs://bob");

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(chronicler, 1 ether);
    }

    // ========== FIXED BELIEFS TESTS ==========

    function testBeliefsAreInitialized() public {
        BeliefPool.BeliefPosition memory belief1 = beliefPool.getBelief(1);
        assertEq(belief1.name, "Nihilism");

        BeliefPool.BeliefPosition memory belief2 = beliefPool.getBelief(2);
        assertEq(belief2.name, "Existentialism");

        BeliefPool.BeliefPosition memory belief3 = beliefPool.getBelief(3);
        assertEq(belief3.name, "Absurdism");

        BeliefPool.BeliefPosition memory belief4 = beliefPool.getBelief(4);
        assertEq(belief4.name, "Stoicism");

        BeliefPool.BeliefPosition memory belief5 = beliefPool.getBelief(5);
        assertEq(belief5.name, "Hedonism");
    }

    function testGetAllBeliefs() public {
        BeliefPool.BeliefPosition[5] memory allBeliefs = beliefPool.getAllBeliefs();

        assertEq(allBeliefs.length, 5);
        assertEq(allBeliefs[0].id, 1);
        assertEq(allBeliefs[4].id, 5);
    }

    function testCannotGetBeliefZeroOrSix() public {
        vm.expectRevert("Invalid belief");
        beliefPool.getBelief(0);

        vm.expectRevert("Invalid belief");
        beliefPool.getBelief(6);
    }

    // ========== STAKING TESTS ==========

    function testStakeOnBelief() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Staked(aliceAgentId, 1, 1 ether, block.timestamp);

        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        BeliefPool.StakeInfo memory stakeInfo = beliefPool.getStakeInfo(aliceAgentId, 1);
        assertEq(stakeInfo.amount, 1 ether);
        assertEq(stakeInfo.beliefId, 1);

        BeliefPool.BeliefPosition memory belief = beliefPool.getBelief(1);
        assertEq(belief.totalStaked, 1 ether);
        assertEq(belief.adherentCount, 1);
    }

    function testStakeMultipleTimes() public {
        vm.startPrank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.stopPrank();

        BeliefPool.StakeInfo memory stakeInfo = beliefPool.getStakeInfo(aliceAgentId, 1);
        assertEq(stakeInfo.amount, 1.5 ether);

        BeliefPool.BeliefPosition memory belief = beliefPool.getBelief(1);
        assertEq(belief.totalStaked, 1.5 ether);
        assertEq(belief.adherentCount, 1); // Still 1 adherent
    }

    function testCannotStakeOnInvalidBelief() public {
        vm.prank(alice);
        vm.expectRevert("Invalid belief");
        beliefPool.stake{value: 1 ether}(6, aliceAgentId);
    }

    function testCannotStakeBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert("Stake too low");
        beliefPool.stake{value: 0.0001 ether}(1, aliceAgentId);
    }

    function testCannotStakeWithoutOwnership() public {
        vm.prank(bob); // Bob tries to stake using Alice's agent
        vm.expectRevert("Not authorized");
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
    }

    function testCannotStakeOnDifferentBeliefWhileHoldingStake() public {
        // Alice stakes on belief 1
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Alice tries to stake on belief 2 without unstaking from belief 1
        vm.prank(alice);
        vm.expectRevert("Already staked on different belief");
        beliefPool.stake{value: 1 ether}(2, aliceAgentId);

        // Alice can add more stake to belief 1 (same belief)
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);

        BeliefPool.StakeInfo memory stakeInfo = beliefPool.getStakeInfo(aliceAgentId, 1);
        assertEq(stakeInfo.amount, 1.5 ether);
    }

    function testAgentCurrentBeliefTracking() public {
        // Initially, agent has no current belief
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 0);

        // Alice stakes on belief 1
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 1);

        // Alice unstakes partially - current belief should still be 1
        vm.prank(alice);
        beliefPool.unstake(1, 0.5 ether, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 1);

        // Alice fully unstakes - current belief should reset to 0
        vm.prank(alice);
        beliefPool.unstake(1, 0.5 ether, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 0);

        // Alice stakes on belief 2
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(2, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 2);

        // Alice migrates to belief 3
        vm.prank(alice);
        beliefPool.migrateStake(2, 3, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 3);
    }

    // ========== REPUTATION TESTS ==========

    function testInitialReputationSetOnFirstStake() public {
        // Reputation should be 0 before first stake
        assertEq(beliefPool.agentReputation(aliceAgentId), 0);

        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Reputation should be initialized to 60
        assertEq(beliefPool.agentReputation(aliceAgentId), 60);
    }

    function testReputationNotResetOnSecondStake() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Simulate reputation loss
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);

        // Reputation should still be 60 (not reset)
        assertEq(beliefPool.agentReputation(aliceAgentId), 60);
    }

    function testReputationClampedAtMin() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Create a debate and lose multiple times to drop reputation
        for (uint i = 0; i < 20; i++) {
            vm.prank(alice);
            uint256 debateId = beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);

            vm.prank(bob);
            beliefPool.matchDebateEscrow{value: 0.1 ether}(debateId);

            vm.prank(chronicler);
            beliefPool.submitDebateVerdict(debateId, "winner_agent_b");
        }

        // Reputation should be clamped at MIN (1)
        assertEq(beliefPool.agentReputation(aliceAgentId), 1);
    }

    function testReputationClampedAtMax() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Win multiple debates to increase reputation
        for (uint i = 0; i < 20; i++) {
            vm.prank(alice);
            uint256 debateId = beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);

            vm.prank(bob);
            beliefPool.matchDebateEscrow{value: 0.1 ether}(debateId);

            vm.prank(chronicler);
            beliefPool.submitDebateVerdict(debateId, "winner_agent_a");
        }

        // Reputation should be clamped at MAX (100)
        assertEq(beliefPool.agentReputation(aliceAgentId), 100);
    }

    // ========== UNSTAKING TESTS ==========

    function testUnstake() public {
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Unstaked(aliceAgentId, 1, 1 ether);

        beliefPool.unstake(1, 1 ether, aliceAgentId);

        assertEq(alice.balance, aliceBalanceBefore + 1 ether);

        BeliefPool.StakeInfo memory stakeInfo = beliefPool.getStakeInfo(aliceAgentId, 1);
        assertEq(stakeInfo.amount, 1 ether);
    }

    function testUnstakeAll() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(alice);
        beliefPool.unstake(1, 1 ether, aliceAgentId);

        // Stake should be deleted
        BeliefPool.StakeInfo memory stakeInfo = beliefPool.getStakeInfo(aliceAgentId, 1);
        assertEq(stakeInfo.amount, 0);

        // Adherent count should decrease
        BeliefPool.BeliefPosition memory belief = beliefPool.getBelief(1);
        assertEq(belief.adherentCount, 0);
    }

    function testFullUnstakeExitsAgora() public {
        // Alice enters Agora
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);
        assertTrue(agoraGate.hasEntered(aliceAgentId));

        // Alice stakes
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Alice fully unstakes - should trigger exit
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit AgentExited(aliceAgentId);
        beliefPool.unstake(1, 1 ether, aliceAgentId);

        // Alice should have exited Agora
        assertFalse(agoraGate.hasEntered(aliceAgentId));
    }

    function testPartialUnstakeDoesNotExit() public {
        // Alice enters Agora
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        // Alice stakes
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        // Alice partially unstakes - should NOT trigger exit
        vm.prank(alice);
        beliefPool.unstake(1, 1 ether, aliceAgentId);

        // Alice should still be in Agora
        assertTrue(agoraGate.hasEntered(aliceAgentId));
    }

    function testReputationPersistsAfterUnstakeAndRestake() public {
        // Alice stakes and loses debates to drop reputation
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Lose a debate
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.1 ether}(debateId);

        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_b");

        int128 reputationAfterLoss = beliefPool.agentReputation(aliceAgentId);
        assertEq(reputationAfterLoss, 55); // 60 - 5

        // Fully unstake
        vm.prank(alice);
        beliefPool.unstake(1, 0.9 ether, aliceAgentId);

        // Re-enter Agora
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        // Stake again
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Reputation should still be 55 (not reset to 60)
        assertEq(beliefPool.agentReputation(aliceAgentId), 55);
    }

    function testCannotUnstakeMoreThanStaked() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Insufficient stake");
        beliefPool.unstake(1, 2 ether, aliceAgentId);
    }

    // ========== MIGRATION (CONVERSION) TESTS ==========

    function testMigrateStake() public {
        // Alice stakes on belief 1
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit StakeMigrated(aliceAgentId, 1, 2, 2 ether);

        beliefPool.migrateStake(1, 2, aliceAgentId);

        // Old stake should be gone
        BeliefPool.StakeInfo memory oldStake = beliefPool.getStakeInfo(aliceAgentId, 1);
        assertEq(oldStake.amount, 0);

        // New stake should exist
        BeliefPool.StakeInfo memory newStake = beliefPool.getStakeInfo(aliceAgentId, 2);
        assertEq(newStake.amount, 2 ether);

        // Belief totals should update
        BeliefPool.BeliefPosition memory oldBelief = beliefPool.getBelief(1);
        assertEq(oldBelief.totalStaked, 0);
        assertEq(oldBelief.adherentCount, 0);

        BeliefPool.BeliefPosition memory newBelief = beliefPool.getBelief(2);
        assertEq(newBelief.totalStaked, 2 ether);
        assertEq(newBelief.adherentCount, 1);
    }

    function testCannotMigrateToSameBelief() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Same belief");
        beliefPool.migrateStake(1, 1, aliceAgentId);
    }

    function testCannotMigrateWithNoStake() public {
        vm.prank(alice);
        vm.expectRevert("No stake to migrate");
        beliefPool.migrateStake(1, 2, aliceAgentId);
    }

    // ========== DEBATE ESCROW TESTS ==========

    function testCreateDebateEscrow() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit DebateEscrowCreated(1, aliceAgentId, bobAgentId, 1 ether);

        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        assertEq(debateId, 1);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(debate.agentAId, aliceAgentId);
        assertEq(debate.agentBId, bobAgentId);
        assertEq(debate.stakeAmount, 1 ether);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.Pending));
    }

    function testMatchDebateEscrow() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit DebateEscrowMatched(debateId, bobAgentId);

        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.Active));
    }

    function testCannotMatchWithWrongAmount() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        vm.expectRevert("Stake mismatch");
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
    }

    function testCannotDebateSelf() public {
        vm.prank(alice);
        vm.expectRevert("Cannot debate self");
        beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, aliceAgentId);
    }

    // ========== CHRONICLER VERDICT TESTS (ATOMIC SETTLEMENT) ==========

    function testChroniclerVerdictWinnerAgentA() public {
        // Agents must stake first to initialize reputation
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);

        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

        // Create and match debate
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        uint256 aliceBalanceBefore = alice.balance;

        // Chronicler submits verdict (atomic settlement)
        vm.prank(chronicler);
        vm.expectEmit(true, false, false, false);
        emit DebateSettled(debateId, aliceAgentId, 2 ether, "winner");

        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // Alice should receive full pot immediately
        assertEq(alice.balance, aliceBalanceBefore + 2 ether);

        // Debate should be settled
        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledWinner));
        assertEq(debate.winnerId, aliceAgentId);
        assertEq(debate.verdict, "winner_agent_a");

        // Check reputation updates
        assertEq(beliefPool.agentReputation(aliceAgentId), 65); // 60 + 5
        assertEq(beliefPool.agentReputation(bobAgentId), 55);   // 60 - 5
    }

    function testChroniclerVerdictWinnerAgentB() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        uint256 bobBalanceBefore = bob.balance;

        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_b");

        // Bob should receive full pot
        assertEq(bob.balance, bobBalanceBefore + 2 ether);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(debate.winnerId, bobAgentId);
    }

    function testChroniclerVerdictStalemate() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;
        uint256 treasuryBalanceBefore = address(agoraGate).balance;

        // 10% penalty = 0.1 ether per agent
        uint256 expectedReturn = 0.9 ether;
        uint256 expectedPenalty = 0.2 ether;

        vm.prank(chronicler);
        vm.expectEmit(true, false, false, true);
        emit StalematePenaltyPaid(debateId, expectedPenalty);

        beliefPool.submitDebateVerdict(debateId, "stalemate");

        // Both agents get stakes back minus penalty
        assertEq(alice.balance, aliceBalanceBefore + expectedReturn);
        assertEq(bob.balance, bobBalanceBefore + expectedReturn);

        // Treasury receives penalties
        assertEq(address(agoraGate).balance, treasuryBalanceBefore + expectedPenalty);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledStalemate));
        assertEq(debate.winnerId, 0);
    }

    function testUnknownVerdictDefaultsToStalemate() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "unknown_verdict");

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledStalemate));
    }

    function testOnlyChroniclerCanSubmitVerdict() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        vm.prank(alice);
        vm.expectRevert("Not authorized chronicler");
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");
    }

    function testCannotSettleDebateNotActive() public {
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(chronicler);
        vm.expectRevert("Not active");
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");
    }

    // ========== VIEW FUNCTIONS TESTS ==========

    function testGetAgentBelief() public {
        assertEq(beliefPool.getAgentBelief(aliceAgentId), 0); // No belief

        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(2, aliceAgentId);

        assertEq(beliefPool.getAgentBelief(aliceAgentId), 2);
    }

    function testGetEffectiveStake() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Initially, effective stake = actual stake
        assertEq(beliefPool.getEffectiveStake(aliceAgentId, 1), 1 ether);

        // Fast forward 30 days (conviction period)
        vm.warp(block.timestamp + CONVICTION_PERIOD);

        // Effective stake should be 2x (10000 + 10000 = 20000 basis points)
        assertEq(beliefPool.getEffectiveStake(aliceAgentId, 1), 2 ether);
    }

    // ========== INTEGRATION TESTS ==========

    function testFullDebateLifecycle() public {
        // 1. Agents stake on different beliefs
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        vm.prank(bob);
        beliefPool.stake{value: 2 ether}(2, bobAgentId);

        // 2. Create debate
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceAgentId, bobAgentId);

        // 3. Match debate
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);

        // 4. Chronicler submits verdict (Alice wins)
        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // 5. Verify Alice received full pot
        assertEq(alice.balance, aliceBalanceBefore + 1 ether);

        // 6. Verify debate settled
        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledWinner));
        assertEq(debate.winnerId, aliceAgentId);
    }
}
