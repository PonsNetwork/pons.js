# Pons Network SDK - Integration Guide

Complete step-by-step guide for integrating Pons Network into your DApp. Build seamless cross-chain experiences with decentralized execution.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Overview](#architecture-overview)
3. [Integration Steps](#integration-steps)
4. [Building Actions](#building-actions)
5. [Transfer Flow](#transfer-flow)
6. [Dynamic Fees](#dynamic-fees)
7. [Error Handling](#error-handling)
8. [Production Deployment](#production-deployment)

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Basic understanding of:
  - Cross-chain concepts
  - Smart contracts
  - TypeScript/JavaScript
  - viem or ethers.js

### Installation

```bash
npm install @pons-network/sdk viem
```

### Quick Test

```typescript
import { calculateFeesSync, DEFAULT_FEES } from '@pons-network/sdk';
import { parseUnits, formatUnits } from 'viem';

// Test fee calculation
const fees = calculateFeesSync(parseUnits('15', 6));
console.log(`15 USDC → ${formatUnits(fees.amountForAction, 6)} USDC after fees`);
```

---

## Architecture Overview

### How Pons Network Works

Pons Network is a **decentralized cross-chain execution layer**.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              YOUR DAPP                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User enters amount, selects action, chooses fee level                   │
│  2. DApp calculates fees using SDK                                          │
│  3. DApp builds action (calldata for destination)                           │
│  4. User signs ONE signature (EIP-712)                                      │
│  5. Message sent on source chain                                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                              PONS NETWORK                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SOURCE CHAIN ──────────► PONS NETWORK ──────────► DESTINATION CHAIN        │
│                                                                              │
│  6. Message relayed across chains                                           │
│  7. Attestation verified                                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                      DECENTRALIZED OPERATORS                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INDEXERS (Permissionless)                                                   │
│  8. Monitor for attested messages                                           │
│  9. Index message on destination chain                                      │
│  10. Earn indexer fee                                                       │
│                                                                              │
│  RELAYERS (Permissionless)                                                   │
│  11. Monitor for indexed messages                                           │
│  12. Execute user's signed action                                           │
│  13. Earn relayer fee                                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Why Decentralization Matters

| Aspect | Traditional Bridges | Pons Network |
|--------|-------------------|--------------|
| **Operators** | Permissioned, centralized | Permissionless, decentralized |
| **Censorship** | Single points of failure | Anyone can operate |
| **Fees** | Fixed by operator | Dynamic, market-driven |
| **Liveness** | Depends on operator | Network-wide redundancy |

---

## Integration Steps

### Step 1: Initialize PonsClient

```typescript
import { PonsClient, Chain } from '@pons-network/sdk';

const pons = await PonsClient.create({
  from: Chain.SEPOLIA,
  to: Chain.ARC_TESTNET,
  sourceRpcUrl: process.env.SOURCE_RPC_URL,
  destinationRpcUrl: process.env.DEST_RPC_URL,
});

// Get user's Smart Account address (deterministic!)
const smartAccount = await pons.calculateSmartAccountAddress(userAddress, 0n);
```

### Step 2: Calculate Fees (Dynamic)

```typescript
import { calculateFeesSync, calculateBurnForAction } from '@pons-network/sdk';

// User chooses speed - fees are dynamic like ETH gas!
const feeOptions = {
  fast: { indexerFee: parseUnits('0.2', 6), relayerFee: parseUnits('0.3', 6) },
  standard: { indexerFee: parseUnits('0.1', 6), relayerFee: parseUnits('0.15', 6) },
  economy: { indexerFee: parseUnits('0.05', 6), relayerFee: parseUnits('0.08', 6) },
};

// Calculate with chosen fee level
const fees = calculateFeesSync(parseUnits('15', 6), feeOptions.standard);

// Show to user
displayFees({
  send: formatUnits(fees.burnAmount, 6),
  receive: formatUnits(fees.amountForAction, 6),
  speed: 'Standard (~15 min)',
});
```

### Step 3: Build Action

```typescript
import { encodeFunctionData } from 'viem';

// Example: Swap USDC → WETH
const swapCalldata = encodeFunctionData({
  abi: UNISWAP_ABI,
  functionName: 'exactInputSingle',
  args: [{
    tokenIn: USDC_ADDRESS,
    tokenOut: WETH_ADDRESS,
    fee: 3000,
    recipient: smartAccount,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
    amountIn: fees.amountForAction,
    amountOutMinimum: minOutputAmount,
    sqrtPriceLimitX96: 0n,
  }],
});

const action = {
  target: UNISWAP_ROUTER,
  callData: swapCalldata,
  value: 0n,
  feeConfig: {
    paymentToken: USDC_ADDRESS,
    indexerFee: fees.indexerFee,
    relayerFee: fees.relayerFee,
  },
  permit2Setup: [],
  funding: {
    ethNeeded: 0n,
    tokensNeeded: [],
    tokenAmounts: [],
    maxReimbursement: fees.amountForAction,
  },
};
```

### Step 4: Execute Transfer

```typescript
// Send message on source chain
const result = await pons.executeCCTPTransfer({
  amount: fees.burnAmount,
  action,
}, walletClient);

console.log('Message TX:', result.txHash);
console.log('Smart Account:', result.smartAccountAddress);
console.log('Waiting for indexer and relayer...');
```

### Step 5: Track Status

```typescript
import { TransferStatus } from '@pons-network/sdk';

const tracker = pons.trackTransfer(
  result.txHash,
  result.smartAccountAddress,
  result.nonce
);

tracker.on('statusChange', (status, data) => {
  updateUI(status);
  
  switch (status) {
    case TransferStatus.SENT:
      console.log('Message sent on source chain');
      break;
    case TransferStatus.INDEXED:
      console.log('Message indexed on destination');
      break;
    case TransferStatus.EXECUTED:
      console.log('Action executed!');
      break;
  }
});
```

---

## Building Actions

### Action Types

#### No Action (Simple Bridge)

```typescript
const action = {
  target: '0x0000000000000000000000000000000000000000',
  callData: '0x',
  value: 0n,
  feeConfig: {
    paymentToken: USDC_ADDRESS,
    indexerFee: fees.indexerFee,
    relayerFee: fees.relayerFee,
  },
  permit2Setup: [],
  funding: {
    ethNeeded: 0n,
    tokensNeeded: [],
    tokenAmounts: [],
    maxReimbursement: 0n,
  },
};
```

#### With ETH Value (Payable Functions)

```typescript
const action = {
  target: NFT_CONTRACT,
  callData: mintCalldata,
  value: parseEther('0.01'), // ETH to send
  feeConfig: { ... },
  funding: {
    ethNeeded: parseEther('0.01'), // Relayer provides this
    maxReimbursement: fees.amountForAction, // Relayer gets USDC back
  },
};
```

#### Batch Actions

```typescript
import { ActionBuilder } from '@pons-network/sdk';

const action = new ActionBuilder()
  .addCall(USDC_ADDRESS, approveCalldata)
  .addCall(UNISWAP_ROUTER, swapCalldata)
  .addCall(STAKING_CONTRACT, stakeCalldata)
  .withFees(USDC_ADDRESS, fees.indexerFee, fees.relayerFee)
  .build(nonce, deadline, fees.expectedAmount);
```

---

## Transfer Flow

### Status Timeline

```
User signs + sends message
         │
         ▼
      PENDING ─── Waiting for source chain confirmation
         │
         ▼
        SENT ──── Message sent on source chain
         │
         ▼
     ATTESTED ─── Attestation verified
         │
         ▼
     INDEXING ─── Indexer processing
         │
         ▼
      INDEXED ─── Message indexed on destination
         │
         ▼
    EXECUTING ─── Relayer executing action
         │
         ▼
     EXECUTED ✓   Action complete!
```

### Who Does What?

| Step | Who | Fee |
|------|-----|-----|
| Send message | User | Network fee |
| Index message | Indexer (decentralized) | Dynamic indexer fee |
| Execute action | Relayer (decentralized) | Dynamic relayer fee |

---

## Dynamic Fees

Pons Network uses **dynamic fees** - just like Ethereum gas!

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DYNAMIC FEE MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Higher Fees = Faster Execution                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚡ FAST                                                             │   │
│  │  Pay 2x market rate → Operators prioritize your transaction         │   │
│  │  Execution: ~5-10 minutes                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔄 STANDARD                                                         │   │
│  │  Pay market rate → Normal execution                                 │   │
│  │  Execution: ~15-20 minutes                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🐢 ECONOMY                                                          │   │
│  │  Pay 0.5x market rate → Slower but cheaper                          │   │
│  │  Execution: ~30+ minutes                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// Let user choose speed
const speedOptions = {
  fast: {
    indexerFee: parseUnits('0.2', 6),
    relayerFee: parseUnits('0.3', 6),
    estimatedTime: '5-10 min',
  },
  standard: {
    indexerFee: parseUnits('0.1', 6),
    relayerFee: parseUnits('0.15', 6),
    estimatedTime: '15-20 min',
  },
  economy: {
    indexerFee: parseUnits('0.05', 6),
    relayerFee: parseUnits('0.08', 6),
    estimatedTime: '30+ min',
  },
};

// User selects 'fast'
const selectedSpeed = 'fast';
const fees = calculateFeesSync(amount, speedOptions[selectedSpeed]);
```

### Market Dynamics

- **Operators compete** for transactions based on fees
- **Users choose** speed vs cost tradeoff
- **Market equilibrium** finds fair prices
- **No fixed fees** - adapts to network demand

---

## Error Handling

### Common Errors

#### Insufficient Balance

```typescript
try {
  await pons.executeCCTPTransfer(params, walletClient);
} catch (error) {
  if (error.message.includes('Insufficient USDC balance')) {
    showError('Not enough USDC in your wallet');
  }
}
```

#### Pre-validate Before Signing

```typescript
import { validateActionFeasibility } from '@pons-network/sdk';

const validation = validateActionFeasibility(sendAmount, actionCost);

if (!validation.feasible) {
  showError(`Need at least ${formatUnits(validation.minimumBurn, 6)} USDC`);
  return;
}
```

---

## Production Deployment

### Environment Variables

```env
# Required
SOURCE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEST_RPC_URL=https://rpc.arc.network

# Optional
PONS_GATEWAY_URL=https://gateway.pons.sh
```

### Security Checklist

- [ ] Never expose private keys in client code
- [ ] Validate all user inputs before building actions
- [ ] Use `validateActionFeasibility()` before signing
- [ ] Set appropriate deadlines (not too long)
- [ ] Handle all error cases gracefully

---

## FAQ

### Q: How long does a cross-chain transfer take?

A: Depends on the fees you pay!
- **Fast (higher fees)**: ~5-10 minutes
- **Standard**: ~15-20 minutes
- **Economy (lower fees)**: ~30+ minutes

### Q: Can I run my own indexer/relayer?

A: Yes! Pons Network is permissionless. Anyone can run an indexer or relayer and earn fees. See the [resolver documentation](https://github.com/pons-network/resolver).

### Q: Why are fees dynamic?

A: Like Ethereum gas, dynamic fees create a competitive market:
- Users who need speed pay more
- Users who can wait pay less
- Operators prioritize profitable transactions
- Market finds equilibrium

---

## Why Pons Network?

| Traditional Cross-Chain | Pons Network |
|------------------------|--------------|
| Centralized relayers | Decentralized operators |
| Fixed fees | Dynamic fees (like ETH gas) |
| Single points of failure | Permissionless & resilient |
| Switch networks | Stay on your chain |
| Multiple transactions | One signature |

**Pons Network** provides a decentralized execution layer, giving your users a seamless multi-chain experience.
