# @pons-network/pons.js

**Pons Network SDK** - Decentralized cross-chain execution layer.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)
[![npm version](https://img.shields.io/npm/v/@pons-network/pons.js.svg)](https://www.npmjs.com/package/@pons-network/pons.js)

## Overview

**Pons Network** is a decentralized cross-chain execution layer that enables DApps to build seamless cross-chain experiences where users:

- **Sign once** on the source chain
- **Execute anywhere** on the destination chain
- **Pay fees in USDC** - dynamic fees like Ethereum gas

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PONS NETWORK ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SOURCE CHAIN                 PONS NETWORK              DESTINATION CHAIN  │
│  ┌───────────────┐           ┌───────────────┐         ┌───────────────┐   │
│  │               │           │               │         │               │   │
│  │ 1. User signs │           │ 3. Message    │         │ 5. Message    │   │
│  │    action     │  ──────►  │    relayed    │ ──────► │    indexed    │   │
│  │               │           │               │         │               │   │
│  │ 2. Message    │           │ 4. Attestation│         │ 6. Action     │   │
│  │    sent       │           │    verified   │         │    executed   │   │
│  │               │           │               │         │               │   │
│  └───────────────┘           └───────────────┘         └───────────────┘   │
│                                                                             │
│  User stays on source chain - no network switching required!               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Decentralized Operators

Pons Network is **permissionless** - anyone can participate and earn:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DECENTRALIZED OPERATORS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🔍 INDEXERS                          ⚡ RESOLVERS                       │
│  • Monitor cross-chain messages       • Execute user actions            │
│  • Index messages on destination      • Provide ETH/tokens if needed    │
│  • Earn indexer fees                  • Earn resolver fees              │
│                                                                         │
│  Anyone can run an indexer or resolver and earn income!                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Decentralization Matters

- **Permissionless** - Anyone can publish messages, run indexers, or become a resolver
- **Censorship Resistant** - No single entity controls message relay or execution
- **Competitive Fees** - Multiple operators compete to provide best service
- **Resilient** - System continues operating even if some operators go offline

## Installation

```bash
npm install @pons-network/pons.js viem
```

## Quick Start

```typescript
import { 
  PonsClient, 
  Chain, 
  calculateFeesSync 
} from '@pons-network/pons.js';
import { parseUnits } from 'viem';

// Initialize Pons client
const pons = await PonsClient.create({
  from: Chain.SEPOLIA,
  to: Chain.ARC_TESTNET,
  sourceRpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  destinationRpcUrl: 'https://rpc.testnet.arc.network',
});

// Calculate fees (dynamic like ETH gas)
const fees = calculateFeesSync(parseUnits('15', 6));

// Execute cross-chain action
const result = await pons.execute({
  amount: fees.burnAmount,
  action: {
    target: CONTRACT_ADDRESS,
    callData: encodedCalldata,
    feeConfig: {
      paymentToken: USDC_ADDRESS,
      indexerFee: fees.indexerFee,
      resolverFee: fees.resolverFee,
    },
    funding: {
      maxReimbursement: fees.amountForAction,
    },
  },
}, walletClient);

// Track transfer across chains
const tracker = pons.trackTransfer(result.txHash, result.smartAccountAddress, result.nonce);
tracker.on('statusChange', (update) => console.log(update.status));
```

---

## Table of Contents

- [Installation](#installation)
- [How Pons Works](#how-it-works)
- [Fee System](#fee-system)
- [Becoming an Operator](#becoming-an-operator)
- [API Reference](#api-reference)
- [Chain Support](#chain-support)

---

## Fee System

Pons uses **dynamic fees** similar to Ethereum gas. Pay more for faster execution, or pay less to save money.

### Dynamic Fee Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DYNAMIC FEE MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ⚡ FAST (Higher fees)                                                      │
│     Pay above market rate → Operators prioritize your transaction          │
│                                                                             │
│  🔄 STANDARD (Market rate)                                                  │
│     Pay market rate → Normal execution speed                               │
│                                                                             │
│  🐢 ECONOMY (Lower fees)                                                    │
│     Pay below market rate → Slower execution, but cheaper                  │
│                                                                             │
│  Just like Ethereum gas - you choose speed vs cost!                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fee Breakdown

```
User sends: 15.00 USDC
    │
    ├── Network Fee (~0.01%)      → Cross-chain relay
    │
    └── Expected Amount           → Arrives at Smart Account
            │
            ├── Protocol Fee (~0.1%)  → Pons treasury
            ├── Indexer Fee (dynamic) → Indexer operator
            ├── Resolver Fee (dynamic) → Resolver operator
            │
            └── Amount for Action     → Available for your action
```

### Fee Calculation

```typescript
import { calculateFeesSync, calculateBurnForAction } from '@pons-network/pons.js';

// Calculate with default fees
const fees = calculateFeesSync(parseUnits('15', 6));

// Custom fees for faster execution
const fastFees = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.2', 6),  // 2x default → faster indexing
  resolverFee: parseUnits('0.3', 6),  // 2x default → faster execution
});

// Economy fees for cost savings
const economyFees = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.05', 6), // 0.5x default → slower but cheaper
  resolverFee: parseUnits('0.08', 6), // 0.5x default → slower but cheaper
});
```

---

## Becoming an Operator

Pons Network is permissionless - anyone can become an indexer or resolver and earn income!

### Indexers

Indexers monitor cross-chain messages and index them on the destination chain.

**What indexers do:**
1. Watch for messages on source chains
2. Wait for attestation verification
3. Index the message on destination chain
4. Earn indexer fee for each message

**Requirements:**
- RPC access to source and destination chains
- ETH for gas on destination chain
- Run the Pons resolver in indexer mode

```bash
# Run as indexer
docker run -d pons/resolver:latest \
  --mode indexer \
  --chains sepolia,arc-testnet
```

### Resolvers

Resolvers execute user actions after messages are indexed.

**What resolvers do:**
1. Monitor for indexed messages
2. Validate action profitability
3. Execute user's signed action
4. Optionally provide ETH/tokens upfront (reimbursed in USDC)
5. Earn resolver fee for each execution

**Requirements:**
- RPC access to destination chain
- ETH for gas
- Optional: USDC/ETH/tokens for funding actions
- Run the Pons resolver in resolver mode

```bash
# Run as resolver
docker run -d pons/resolver:latest \
  --mode executor \
  --chains arc-testnet
```

### Operator Economics

Operators compete for transactions by offering competitive fees:
- Higher fees = operators prioritize your transaction
- Lower fees = slower execution but still processed
- Market finds equilibrium based on supply/demand

---

## API Reference

### PonsClient

Main client for cross-chain operations.

```typescript
import { PonsClient, Chain } from '@pons-network/pons.js';

// Initialize
const pons = await PonsClient.create({
  from: Chain.SEPOLIA,
  to: Chain.ARC_TESTNET,
  sourceRpcUrl: 'https://...',
  destinationRpcUrl: 'https://...',
});

// Execute cross-chain transfer
const result = await pons.execute(params, walletClient);

// Track transfer status
const tracker = pons.trackTransfer(txHash, smartAccount, nonce);

// Get Smart Account address
const address = await pons.calculateSmartAccountAddress(owner, salt);

// Cleanup
await pons.stop();
```

### ActionBuilder

Build complex cross-chain actions.

```typescript
import { ActionBuilder } from '@pons-network/pons.js';

// Simple contract call
const action = new ActionBuilder()
  .addCall(contractAddress, calldata)
  .withFees(USDC_ADDRESS, indexerFee, resolverFee)
  .build(nonce, deadline, expectedAmount);

// Batch actions (approve + swap + stake)
const batchAction = new ActionBuilder()
  .addCall(USDC_ADDRESS, approveCalldata)
  .addCall(UNISWAP_ROUTER, swapCalldata)
  .addCall(STAKING_CONTRACT, stakeCalldata)
  .withFees(USDC_ADDRESS, indexerFee, resolverFee)
  .needsEth(ethAmount, reimbursement)
  .build(nonce, deadline, expectedAmount);
```

### TransferTracker

Track cross-chain transfer status.

```typescript
import { TransferStatus } from '@pons-network/pons.js';

const tracker = pons.trackTransfer(txHash, smartAccount, nonce);

tracker.on('statusChange', (status) => {
  switch (status) {
    case TransferStatus.PENDING:
      console.log('Message sent, waiting for relay...');
      break;
    case TransferStatus.INDEXED:
      console.log('Message indexed on destination!');
      break;
    case TransferStatus.EXECUTED:
      console.log('Action executed by resolver!');
      break;
  }
});
```

### Fee Functions

| Function | Use Case |
|----------|----------|
| `calculateFeesSync(amount, options?)` | Calculate fees with custom rates |
| `calculateBurnForAction(amount, options?)` | Reverse: action cost → send amount |
| `validateActionFeasibility(send, need)` | Pre-validate before signing |
| `DEFAULT_FEES` | Default fee constants |

---

## Chain Support

### Built-in Chains

```typescript
import { Chain, arcTestnet, sepolia } from '@pons-network/pons.js';

// Use chain constants
const pons = await PonsClient.create({
  from: Chain.SEPOLIA,
  to: Chain.ARC_TESTNET,
  // ...
});

// Available chains
Chain.SEPOLIA      // Ethereum Sepolia testnet
Chain.ARC_TESTNET  // Arc Network testnet
Chain.ETHEREUM     // Ethereum mainnet (coming soon)
```

---

## Documentation

- [Examples & Integration Guide](./examples/README.md)
- [Fee Calculations Guide](./docs/FEE_CALCULATIONS.md)
- [Integration Guide](./docs/INTEGRATION_GUIDE.md)
- [API Reference](./docs/API.md)

---

## Why Pons Network?

| Traditional Bridging | Pons Network |
|---------------------|--------------|
| Centralized resolvers | Decentralized operators |
| Fixed fees | Dynamic fees (like ETH gas) |
| Switch networks manually | Stay on your chain |
| Multiple transactions | One signature |
| Need gas on destination | Fees in USDC only |

**Pons Network** provides a decentralized execution layer, giving your users a seamless and trustless multi-chain experience.

---

## License

MIT
