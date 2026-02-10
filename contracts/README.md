# The Agora - Smart Contracts

Smart contracts for The Agora integrating with ERC-8004 registries on Monad testnet.

## Contracts

- **BeliefPool** - Belief staking and debate escrow
- **AgoraGate** - Entry fees and treasury

## ERC-8004 Integration

- IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

## Deployment

```bash
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
forge script script/CreateBeliefs.s.sol --rpc-url $RPC_URL --broadcast
```

See ../IMPLEMENTATION_PLAN.md for full architecture and integration details.
