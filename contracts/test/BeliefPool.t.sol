// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BeliefPool.sol";
import "../src/BeliefToken.sol";
import "../src/AgoraGate.sol";
import "./mocks/MockIdentityRegistry.sol";

contract BeliefPoolTest is Test {
    BeliefPool public beliefPool;
    AgoraGate public agoraGate;
    MockIdentityRegistry public identityRegistry;

    address public deployer;
    address public alice;
    address public bob;
    address public carol;
    address public chronicler;

    uint256 public aliceAgentId;
    uint256 public bobAgentId;
    uint256 public carolAgentId;

    uint256 constant STALEMATE_PENALTY_BPS = 1000; // 10%
    uint256 constant DEBATE_DIVIDEND_BPS = 1000;   // 10%
    uint256 constant ENTRY_FEE = 0.01 ether;

    event Staked(uint256 indexed agentId, uint256 indexed beliefId, uint256 amount, uint256 timestamp);
    event Unstaked(uint256 indexed agentId, uint256 indexed beliefId, uint256 amount);
    event StakeMigrated(uint256 indexed agentId, uint256 fromBeliefId, uint256 toBeliefId, uint256 amount);
    event DebateEscrowCreated(uint256 indexed debateId, uint256 agentAId, uint256 agentBId, uint256 stakeAmount);
    event DebateEscrowMatched(uint256 indexed debateId, uint256 agentBId);
    event DebateSettled(uint256 indexed debateId, uint256 winnerId, uint256 amount, string outcome);
    event StalematePenaltyPaid(uint256 indexed debateId, uint256 penaltyAmount);
    event DividendDistributed(uint256 indexed debateId, uint256 indexed beliefId, uint256 amount);
    event AgentExited(uint256 indexed agentId);

    function setUp() public {
        deployer = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        chronicler = makeAddr("chronicler");

        // Deploy mocks
        identityRegistry = new MockIdentityRegistry();

        // Deploy contracts
        beliefPool = new BeliefPool(
            address(identityRegistry),
            STALEMATE_PENALTY_BPS,
            DEBATE_DIVIDEND_BPS
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

        vm.prank(carol);
        carolAgentId = identityRegistry.register("ipfs://carol");

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
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
    }

    function testGetAllBeliefs() public {
        BeliefPool.BeliefPosition[4] memory allBeliefs = beliefPool.getAllBeliefs();

        assertEq(allBeliefs.length, 4);
        assertEq(allBeliefs[0].id, 1);
        assertEq(allBeliefs[3].id, 4);
    }

    function testCannotGetBeliefZeroOrFive() public {
        vm.expectRevert("Invalid belief");
        beliefPool.getBelief(0);

        vm.expectRevert("Invalid belief");
        beliefPool.getBelief(5);
    }

    // ========== LP TOKEN TESTS ==========

    function testBeliefTokensDeployed() public {
        for (uint256 i = 1; i <= 4; i++) {
            address tokenAddr = beliefPool.getBeliefToken(i);
            assertTrue(tokenAddr != address(0));
            BeliefToken token = BeliefToken(tokenAddr);
            assertEq(token.pool(), address(beliefPool));
        }
    }

    function testBeliefTokenNonTransferable() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));

        vm.prank(alice);
        vm.expectRevert(BeliefToken.TransfersDisabled.selector);
        token.transfer(bob, 0.5 ether);
    }

    function testOnlyPoolCanMintBurn() public {
        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));

        vm.prank(alice);
        vm.expectRevert(BeliefToken.OnlyPool.selector);
        token.mint(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(BeliefToken.OnlyPool.selector);
        token.burn(alice, 1 ether);
    }

    // ========== STAKING TESTS ==========

    function testStakeOnBelief() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Staked(aliceAgentId, 1, 1 ether, block.timestamp);

        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Check LP token balance (first staker: 1:1)
        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        assertEq(token.balanceOf(alice), 1 ether);

        BeliefPool.BeliefPosition memory belief = beliefPool.getBelief(1);
        assertEq(belief.totalAssets, 1 ether);
        assertEq(belief.adherentCount, 1);
    }

    function testStakeMultipleTimes() public {
        vm.startPrank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.stopPrank();

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        assertEq(token.balanceOf(alice), 1.5 ether); // 1:1 since no dividends yet

        BeliefPool.BeliefPosition memory belief = beliefPool.getBelief(1);
        assertEq(belief.totalAssets, 1.5 ether);
        assertEq(belief.adherentCount, 1); // Still 1 adherent
    }

    function testCannotStakeOnInvalidBelief() public {
        vm.prank(alice);
        vm.expectRevert("Invalid belief");
        beliefPool.stake{value: 1 ether}(5, aliceAgentId);
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
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Already staked on different belief");
        beliefPool.stake{value: 1 ether}(2, aliceAgentId);

        // Can add more to same belief
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        assertEq(token.balanceOf(alice), 1.5 ether);
    }

    function testAgentCurrentBeliefTracking() public {
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 0);

        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 1);

        // Partial unstake — still on belief 1
        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        vm.prank(alice);
        beliefPool.unstake(1, 0.5 ether, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 1);

        // Full unstake — reset to 0
        uint256 remainingShares = token.balanceOf(alice);
        vm.prank(alice);
        beliefPool.unstake(1, remainingShares, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 0);

        // Stake on belief 2
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(2, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 2);

        // Migrate to belief 3
        vm.prank(alice);
        beliefPool.migrateStake(2, 3, aliceAgentId);
        assertEq(beliefPool.agentCurrentBelief(aliceAgentId), 3);
    }

    function testFirstStakerGetsOneToOneShares() public {
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        assertEq(token.balanceOf(alice), 2 ether);
        assertEq(token.totalSupply(), 2 ether);
    }

    // ========== UNSTAKING TESTS ==========

    function testUnstake() public {
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Unstaked(aliceAgentId, 1, 1 ether);

        beliefPool.unstake(1, 1 ether, aliceAgentId); // burn 1 ether shares

        assertEq(alice.balance, aliceBalanceBefore + 1 ether);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        assertEq(token.balanceOf(alice), 1 ether);
    }

    function testUnstakeAll() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        uint256 shares = token.balanceOf(alice);
        vm.prank(alice);
        beliefPool.unstake(1, shares, aliceAgentId);

        assertEq(token.balanceOf(alice), 0);

        BeliefPool.BeliefPosition memory belief = beliefPool.getBelief(1);
        assertEq(belief.adherentCount, 0);
    }

    function testFullUnstakeExitsAgora() public {
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);
        assertTrue(agoraGate.hasEntered(aliceAgentId));

        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        uint256 shares = token.balanceOf(alice);
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit AgentExited(aliceAgentId);
        beliefPool.unstake(1, shares, aliceAgentId);

        assertFalse(agoraGate.hasEntered(aliceAgentId));
    }

    function testPartialUnstakeDoesNotExit() public {
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        vm.prank(alice);
        beliefPool.unstake(1, 1 ether, aliceAgentId);

        assertTrue(agoraGate.hasEntered(aliceAgentId));
    }

    function testCannotUnstakeMoreThanHeld() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Insufficient shares");
        beliefPool.unstake(1, 2 ether, aliceAgentId);
    }

    function testUnstakeLastShareDrainsPool() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        uint256 balBefore = alice.balance;
        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        uint256 shares = token.balanceOf(alice);

        vm.prank(alice);
        beliefPool.unstake(1, shares, aliceAgentId);

        assertEq(alice.balance, balBefore + 1 ether);
        assertEq(beliefPool.getBelief(1).totalAssets, 0);
        assertEq(token.totalSupply(), 0);
    }

    // ========== ACTIVE DEBATE LOCK TESTS ==========

    function testCannotUnstakeDuringActiveDebate() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        vm.prank(alice);
        beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);

        vm.prank(alice);
        vm.expectRevert("Agent has active debate");
        beliefPool.unstake(1, 0.5 ether, aliceAgentId);

        // Agent B is also locked
        vm.prank(bob);
        vm.expectRevert("Agent has active debate");
        beliefPool.unstake(2, 0.5 ether, bobAgentId);
    }

    function testCannotMigrateDuringActiveDebate() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        vm.prank(alice);
        beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);

        vm.prank(alice);
        vm.expectRevert("Agent has active debate");
        beliefPool.migrateStake(1, 2, aliceAgentId);
    }

    function testUnlockAfterDebateSettled() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.1 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // Both agents unlocked after settlement
        vm.prank(alice);
        beliefPool.unstake(1, 0.5 ether, aliceAgentId); // should succeed
        vm.prank(bob);
        beliefPool.unstake(2, 0.5 ether, bobAgentId); // should succeed
    }

    function testUnlockAfterDebateDeclined() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        beliefPool.declineDebateEscrow(debateId);

        // Both agents unlocked after decline
        vm.prank(alice);
        beliefPool.unstake(1, 0.5 ether, aliceAgentId);
        vm.prank(bob);
        beliefPool.unstake(2, 0.5 ether, bobAgentId);
    }

    // ========== MIGRATION (CONVERSION) TESTS ==========

    function testMigrateStake() public {
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit StakeMigrated(aliceAgentId, 1, 2, 2 ether);

        beliefPool.migrateStake(1, 2, aliceAgentId);

        BeliefToken token1 = BeliefToken(beliefPool.getBeliefToken(1));
        BeliefToken token2 = BeliefToken(beliefPool.getBeliefToken(2));

        assertEq(token1.balanceOf(alice), 0);
        assertEq(token2.balanceOf(alice), 2 ether);

        assertEq(beliefPool.getBelief(1).totalAssets, 0);
        assertEq(beliefPool.getBelief(1).adherentCount, 0);
        assertEq(beliefPool.getBelief(2).totalAssets, 2 ether);
        assertEq(beliefPool.getBelief(2).adherentCount, 1);
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

    // ========== DEBATE GATING TESTS ==========

    function testCannotCreateDebateWithoutStake() public {
        // Neither agent staked
        vm.prank(alice);
        vm.expectRevert("Agent A has no belief stake");
        beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        // Agent A staked, Agent B not
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Agent B has no belief stake");
        beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);
    }

    // ========== DEBATE ESCROW TESTS ==========

    function testCreateDebateEscrow() public {
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

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
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

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
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(bob);
        vm.expectRevert("Stake mismatch");
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
    }

    function testCannotDebateSelf() public {
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Cannot debate self");
        beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, aliceAgentId);
    }

    // ========== CHRONICLER VERDICT TESTS ==========

    function testChroniclerVerdictWinnerAgentA() public {
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // 10% dividend = 0.2 ether to belief 1 pool
        // Winner gets 1.8 ether
        assertEq(alice.balance, aliceBalanceBefore + 1.8 ether);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledWinner));
        assertEq(debate.winnerId, aliceAgentId);
        assertEq(debate.verdict, "winner_agent_a");
    }

    function testChroniclerVerdictWinnerAgentB() public {
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        uint256 bobBalanceBefore = bob.balance;

        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_b");

        // 10% dividend = 0.2 ether to belief 2 pool
        assertEq(bob.balance, bobBalanceBefore + 1.8 ether);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(debate.winnerId, bobAgentId);
    }

    function testChroniclerVerdictStalemate() public {
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);

        uint256 aliceBalanceBefore = alice.balance;
        uint256 bobBalanceBefore = bob.balance;
        uint256 treasuryBalanceBefore = address(agoraGate).balance;

        uint256 expectedReturn = 0.9 ether;
        uint256 expectedPenalty = 0.2 ether;

        vm.prank(chronicler);
        vm.expectEmit(true, false, false, true);
        emit StalematePenaltyPaid(debateId, expectedPenalty);

        beliefPool.submitDebateVerdict(debateId, "stalemate");

        assertEq(alice.balance, aliceBalanceBefore + expectedReturn);
        assertEq(bob.balance, bobBalanceBefore + expectedReturn);
        assertEq(address(agoraGate).balance, treasuryBalanceBefore + expectedPenalty);

        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledStalemate));
        assertEq(debate.winnerId, 0);
    }

    function testUnknownVerdictDefaultsToStalemate() public {
        vm.prank(alice);
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

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
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

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
        beliefPool.stake{value: 0.5 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 0.5 ether}(2, bobAgentId);

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);

        vm.prank(chronicler);
        vm.expectRevert("Not active");
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");
    }

    // ========== DIVIDEND / VAULT MATH TESTS ==========

    function testSharePriceIncreasesWithDividend() public {
        // Alice stakes 1 ETH on belief 1
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        // Share price starts at 1:1
        assertEq(beliefPool.getSharePrice(1), 1e18);

        // Bob stakes on belief 2 for the debate
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Create debate, Alice wins
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // Dividend = 10% of 1 ETH pot = 0.1 ETH goes to belief 1 pool
        // totalAssets = 1 + 0.1 = 1.1 ETH, totalShares = 1 ETH
        // Share price = 1.1e18
        assertEq(beliefPool.getSharePrice(1), 1.1 ether);
    }

    function testDividendAccrualSingleStaker() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Alice wins debate — 0.1 ETH dividend
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // Alice unstakes all — should get original 1 ETH + 0.1 ETH dividend
        uint256 balBefore = alice.balance;
        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        uint256 shares = token.balanceOf(alice);
        vm.prank(alice);
        beliefPool.unstake(1, shares, aliceAgentId);

        assertEq(alice.balance, balBefore + 1.1 ether);
    }

    function testDividendAccrualMultipleStakers() public {
        // Alice stakes 3 ETH, Carol stakes 1 ETH on same belief
        vm.prank(alice);
        beliefPool.stake{value: 3 ether}(1, aliceAgentId);
        vm.prank(carol);
        beliefPool.stake{value: 1 ether}(1, carolAgentId);

        // Bob on a different belief for the debate
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Alice wins debate — 0.2 ETH dividend to belief 1 pool (10% of 2 ETH pot)
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 1 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 1 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // totalAssets = 4 + 0.2 = 4.2 ETH, totalShares = 4 ETH
        // Alice has 3 shares → 3 * 4.2 / 4 = 3.15 ETH
        // Carol has 1 share → 1 * 4.2 / 4 = 1.05 ETH
        (uint256 aliceValue, ) = beliefPool.getAgentStakeValue(aliceAgentId, 1);
        (uint256 carolValue, ) = beliefPool.getAgentStakeValue(carolAgentId, 1);

        assertEq(aliceValue, 3.15 ether);
        assertEq(carolValue, 1.05 ether);
    }

    function testNoDividendOnStalemate() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        uint256 belief1AssetsBefore = beliefPool.getBelief(1).totalAssets;
        uint256 belief2AssetsBefore = beliefPool.getBelief(2).totalAssets;

        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "stalemate");

        // No belief pool should have gained assets from dividend
        assertEq(beliefPool.getBelief(1).totalAssets, belief1AssetsBefore);
        assertEq(beliefPool.getBelief(2).totalAssets, belief2AssetsBefore);
    }

    function testSecondStakerGetsProportionalShares() public {
        // Alice stakes 1 ETH (first staker, 1:1)
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);

        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Alice wins a debate — 0.1 ETH dividend
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // totalAssets = 1.1 ETH, totalShares = 1 ETH, price = 1.1
        // Carol stakes 1.1 ETH → gets 1.1 * 1 / 1.1 = 1 share
        vm.prank(carol);
        beliefPool.stake{value: 1.1 ether}(1, carolAgentId);

        BeliefToken token = BeliefToken(beliefPool.getBeliefToken(1));
        assertEq(token.balanceOf(carol), 1 ether); // 1 share for 1.1 ETH
        assertEq(token.balanceOf(alice), 1 ether);  // Alice still has 1 share

        // Both shares worth the same now: 2.2 ETH / 2 shares = 1.1 each
        (uint256 aliceValue, ) = beliefPool.getAgentStakeValue(aliceAgentId, 1);
        (uint256 carolValue, ) = beliefPool.getAgentStakeValue(carolAgentId, 1);
        assertEq(aliceValue, 1.1 ether);
        assertEq(carolValue, 1.1 ether);
    }

    function testMigrateRealizesDividendGains() public {
        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(1, aliceAgentId);
        vm.prank(bob);
        beliefPool.stake{value: 1 ether}(2, bobAgentId);

        // Alice wins — dividend makes belief 1 pool worth 1.1 ETH
        vm.prank(alice);
        uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceAgentId, bobAgentId);
        vm.prank(bob);
        beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);
        vm.prank(chronicler);
        beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

        // Alice migrates to belief 2 — should carry 1.1 ETH value
        vm.prank(alice);
        beliefPool.migrateStake(1, 2, aliceAgentId);

        // Belief 1 should be empty, belief 2 should have 1 + 1.1 = 2.1 ETH
        assertEq(beliefPool.getBelief(1).totalAssets, 0);
        assertEq(beliefPool.getBelief(2).totalAssets, 2.1 ether);
    }

    // ========== VIEW FUNCTIONS TESTS ==========

    function testGetAgentBelief() public {
        assertEq(beliefPool.getAgentBelief(aliceAgentId), 0);

        vm.prank(alice);
        beliefPool.stake{value: 1 ether}(2, aliceAgentId);

        assertEq(beliefPool.getAgentBelief(aliceAgentId), 2);
    }

    function testPreviewRedeem() public {
        vm.prank(alice);
        beliefPool.stake{value: 2 ether}(1, aliceAgentId);

        uint256 ethOut = beliefPool.previewRedeem(1, 1 ether);
        assertEq(ethOut, 1 ether);
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

        // 5. Winner gets 90% of pot (0.9 ETH), 10% (0.1 ETH) to belief 1 pool
        assertEq(alice.balance, aliceBalanceBefore + 0.9 ether);

        // 6. Verify debate settled
        BeliefPool.DebateEscrow memory debate = beliefPool.getDebate(debateId);
        assertEq(uint(debate.status), uint(BeliefPool.DebateStatus.SettledWinner));
        assertEq(debate.winnerId, aliceAgentId);

        // 7. Belief 1 pool gained dividend
        assertEq(beliefPool.getBelief(1).totalAssets, 2.1 ether); // 2 + 0.1
    }
}
