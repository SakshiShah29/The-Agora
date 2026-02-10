// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgoraGate.sol";
import "./mocks/MockIdentityRegistry.sol";

contract AgoraGateTest is Test {
    AgoraGate public agoraGate;
    MockIdentityRegistry public identityRegistry;

    address public deployer;
    address public alice;
    address public bob;
    address public charlie;

    uint256 public aliceAgentId;
    uint256 public bobAgentId;
    uint256 public charlieAgentId;

    uint256 constant ENTRY_FEE = 0.01 ether;

    event AgentEntered(uint256 indexed agentId, address indexed wallet, uint256 timestamp);
    event PenaltyReceived(uint256 amount, address indexed from);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryWithdrawn(address indexed to, uint256 amount);

    function setUp() public {
        deployer = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");

        // Deploy mock registry
        identityRegistry = new MockIdentityRegistry();

        // Deploy AgoraGate
        agoraGate = new AgoraGate(
            address(identityRegistry),
            ENTRY_FEE
        );

        // Register agents
        vm.prank(alice);
        aliceAgentId = identityRegistry.register("ipfs://alice");

        vm.prank(bob);
        bobAgentId = identityRegistry.register("ipfs://bob");

        vm.prank(charlie);
        charlieAgentId = identityRegistry.register("ipfs://charlie");

        // Fund accounts
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);
    }

    // ========== ENTRY TESTS ==========

    function testEnterAgora() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit AgentEntered(aliceAgentId, alice, block.timestamp);

        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        // Check entry recorded
        assertTrue(agoraGate.hasEntered(aliceAgentId));
        assertEq(agoraGate.getEntryTime(aliceAgentId), block.timestamp);
        assertEq(agoraGate.totalEntered(), 1);

        // Check treasury received fee
        assertEq(address(agoraGate).balance, ENTRY_FEE);
    }

    function testMultipleAgentsCanEnter() public {
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        vm.prank(bob);
        agoraGate.enter{value: ENTRY_FEE}(bobAgentId);

        vm.prank(charlie);
        agoraGate.enter{value: ENTRY_FEE}(charlieAgentId);

        assertEq(agoraGate.totalEntered(), 3);
        assertEq(address(agoraGate).balance, ENTRY_FEE * 3);

        assertTrue(agoraGate.hasEntered(aliceAgentId));
        assertTrue(agoraGate.hasEntered(bobAgentId));
        assertTrue(agoraGate.hasEntered(charlieAgentId));
    }

    function testCannotEnterWithInsufficientFee() public {
        vm.prank(alice);
        vm.expectRevert("Insufficient entry fee");
        agoraGate.enter{value: 0.005 ether}(aliceAgentId);
    }

    function testCannotEnterTwice() public {
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        vm.prank(alice);
        vm.expectRevert("Already entered");
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);
    }

    function testCannotEnterWithUnownedAgent() public {
        vm.prank(bob); // Bob tries to enter with Alice's agent
        vm.expectRevert("Not agent owner");
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);
    }

    function testCannotEnterWithNonexistentAgent() public {
        vm.prank(alice);
        vm.expectRevert(); // ERC721: owner query for nonexistent token
        agoraGate.enter{value: ENTRY_FEE}(999);
    }

    function testEnterWithExcessFee() public {
        // Should accept excess payment
        vm.prank(alice);
        agoraGate.enter{value: 1 ether}(aliceAgentId);

        assertTrue(agoraGate.hasEntered(aliceAgentId));
        assertEq(address(agoraGate).balance, 1 ether);
    }

    // ========== PENALTY RECEPTION TESTS ==========

    function testReceivePenalty() public {
        uint256 penaltyAmount = 0.5 ether;

        vm.expectEmit(false, true, false, true);
        emit PenaltyReceived(penaltyAmount, address(this));

        agoraGate.receivePenalty{value: penaltyAmount}();

        assertEq(address(agoraGate).balance, penaltyAmount);
    }

    function testReceivePenaltyViaReceive() public {
        uint256 penaltyAmount = 1 ether;

        // Send directly to contract (triggers receive())
        vm.expectEmit(false, true, false, true);
        emit PenaltyReceived(penaltyAmount, address(this));

        (bool success, ) = address(agoraGate).call{value: penaltyAmount}("");
        assertTrue(success);

        assertEq(address(agoraGate).balance, penaltyAmount);
    }

    function testCannotReceiveZeroPenalty() public {
        vm.expectRevert("No value sent");
        agoraGate.receivePenalty{value: 0}();
    }

    function testTreasuryAccumulatesFromMultipleSources() public {
        // Entry fees
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        vm.prank(bob);
        agoraGate.enter{value: ENTRY_FEE}(bobAgentId);

        // Penalty
        agoraGate.receivePenalty{value: 2 ether}();

        assertEq(agoraGate.treasuryBalance(), (ENTRY_FEE * 2) + 2 ether);
    }

    // ========== TREASURY WITHDRAWAL TESTS ==========

    function testWithdrawTreasury() public {
        // Add funds
        agoraGate.receivePenalty{value: 10 ether}();

        address recipient = makeAddr("recipient");
        uint256 recipientBalanceBefore = recipient.balance;

        vm.expectEmit(true, false, false, true);
        emit TreasuryWithdrawn(recipient, 3 ether);

        agoraGate.withdrawTreasury(recipient, 3 ether);

        assertEq(recipient.balance, recipientBalanceBefore + 3 ether);
        assertEq(agoraGate.treasuryBalance(), 7 ether);
    }

    function testCannotWithdrawMoreThanBalance() public {
        agoraGate.receivePenalty{value: 1 ether}();

        vm.expectRevert("Insufficient balance");
        agoraGate.withdrawTreasury(makeAddr("recipient"), 2 ether);
    }

    function testCannotWithdrawToZeroAddress() public {
        agoraGate.receivePenalty{value: 1 ether}();

        vm.expectRevert("Invalid address");
        agoraGate.withdrawTreasury(address(0), 1 ether);
    }

    function testOnlyOwnerCanWithdraw() public {
        agoraGate.receivePenalty{value: 1 ether}();

        vm.prank(alice);
        vm.expectRevert(); // Ownable: caller is not the owner
        agoraGate.withdrawTreasury(alice, 1 ether);
    }

    // ========== CONFIGURATION TESTS ==========

    function testSetEntryFee() public {
        uint256 newFee = 0.05 ether;

        vm.expectEmit(false, false, false, true);
        emit EntryFeeUpdated(ENTRY_FEE, newFee);

        agoraGate.setEntryFee(newFee);

        assertEq(agoraGate.entryFee(), newFee);
    }

    function testSetEntryFeeToZero() public {
        agoraGate.setEntryFee(0);

        // Should allow free entry
        vm.prank(alice);
        agoraGate.enter{value: 0}(aliceAgentId);

        assertTrue(agoraGate.hasEntered(aliceAgentId));
    }

    function testOnlyOwnerCanSetEntryFee() public {
        vm.prank(alice);
        vm.expectRevert(); // Ownable: caller is not the owner
        agoraGate.setEntryFee(0.05 ether);
    }

    function testEntryFeeChangeAffectsNewEntries() public {
        // Alice enters with original fee
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        // Change fee
        uint256 newFee = 0.05 ether;
        agoraGate.setEntryFee(newFee);

        // Bob must pay new fee
        vm.prank(bob);
        vm.expectRevert("Insufficient entry fee");
        agoraGate.enter{value: ENTRY_FEE}(bobAgentId);

        vm.prank(bob);
        agoraGate.enter{value: newFee}(bobAgentId);

        assertTrue(agoraGate.hasEntered(bobAgentId));
    }

    // ========== VIEW FUNCTIONS TESTS ==========

    function testTreasuryBalance() public {
        assertEq(agoraGate.treasuryBalance(), 0);

        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);
        assertEq(agoraGate.treasuryBalance(), ENTRY_FEE);

        agoraGate.receivePenalty{value: 5 ether}();
        assertEq(agoraGate.treasuryBalance(), ENTRY_FEE + 5 ether);
    }

    function testHasEntered() public {
        assertFalse(agoraGate.hasEntered(aliceAgentId));

        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);
        assertTrue(agoraGate.hasEntered(aliceAgentId));
    }

    function testGetEntryTime() public {
        assertEq(agoraGate.getEntryTime(aliceAgentId), 0);

        uint256 enterTime = block.timestamp;
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        assertEq(agoraGate.getEntryTime(aliceAgentId), enterTime);
    }

    // ========== INTEGRATION TESTS ==========

    function testFullAgoraLifecycle() public {
        // Multiple agents enter
        vm.prank(alice);
        agoraGate.enter{value: ENTRY_FEE}(aliceAgentId);

        vm.prank(bob);
        agoraGate.enter{value: ENTRY_FEE}(bobAgentId);

        vm.prank(charlie);
        agoraGate.enter{value: ENTRY_FEE}(charlieAgentId);

        assertEq(agoraGate.totalEntered(), 3);

        // Simulate penalties from debates
        agoraGate.receivePenalty{value: 2 ether}();
        agoraGate.receivePenalty{value: 1.5 ether}();

        assertEq(agoraGate.treasuryBalance(), (ENTRY_FEE * 3) + 3.5 ether);

        // Owner withdraws some funds
        address treasury = makeAddr("treasury");
        agoraGate.withdrawTreasury(treasury, 1 ether);

        assertEq(treasury.balance, 1 ether);
        assertEq(agoraGate.treasuryBalance(), (ENTRY_FEE * 3) + 2.5 ether);

        // Verify final state
        assertTrue(agoraGate.hasEntered(aliceAgentId));
        assertTrue(agoraGate.hasEntered(bobAgentId));
        assertTrue(agoraGate.hasEntered(charlieAgentId));
    }
}
