// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title BeliefToken
 * @notice Non-transferable ERC-20 LP token representing a share in a belief pool.
 * @dev Only the BeliefPool contract (set as `pool`) can mint and burn tokens.
 *      All transfers between non-zero addresses are disabled.
 */
contract BeliefToken is ERC20 {
    address public immutable pool;

    error OnlyPool();
    error TransfersDisabled();

    modifier onlyPool() {
        if (msg.sender != pool) revert OnlyPool();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address pool_
    ) ERC20(name_, symbol_) {
        pool = pool_;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }

    /// @dev Block all transfers except mint (from=0) and burn (to=0).
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        super._update(from, to, value);
    }
}
