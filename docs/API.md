# Pons Network SDK - API Reference

Complete API documentation for `@pons-network/sdk`.

## Table of Contents

- [Overview](#overview)
- [Fee Functions](#fee-functions)
- [PonsClient](#ponsclient)
- [ActionBuilder](#actionbuilder)
- [TransferTracker](#transfertracker)
- [Chain Configuration](#chain-configuration)
- [Types](#types)
- [Constants](#constants)

---

## Overview

The Pons Network SDK enables cross-chain transfers and action execution with decentralized operators and dynamic fees.

```typescript
import { 
  PonsClient, 
  Chain, 
  calculateFeesSync,
  ActionBuilder,
  TransferStatus 
} from '@pons-network/sdk';
```

### Architecture

```
Source Chain ──────► Pons Network ──────► Destination Chain
     │                    │                     │
  Message              Relay &               Message
   Sent              Attestation             Indexed
                                                │
                                          Action Executed
```

---

## Fee Functions

### `calculateFeesSync(sendAmount, options?)`

Calculate fees with **dynamic** fee rates.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sendAmount` | `bigint` | Amount of USDC to send (6 decimals) |
| `options.indexerFee` | `bigint?` | Indexer fee - **DYNAMIC** (default: 100000n) |
| `options.relayerFee` | `bigint?` | Relayer fee - **DYNAMIC** (default: 150000n) |
| `options.protocolFeeBps` | `bigint?` | Protocol fee in basis points (default: 10n) |

**Returns:**
```typescript
{
  burnAmount: bigint;      // Input send amount
  cctpFee: bigint;         // Network fee
  expectedAmount: bigint;  // Amount arriving at Smart Account
  protocolFee: bigint;     // Protocol fee
  indexerFee: bigint;      // Indexer operator fee (dynamic)
  relayerFee: bigint;      // Relayer operator fee (dynamic)
  totalFees: bigint;       // Sum of all fees after network fee
  amountForAction: bigint; // Available for action
}
```

**Example:**
```typescript
import { calculateFeesSync } from '@pons-network/sdk';
import { parseUnits } from 'viem';

// Standard speed
const standard = calculateFeesSync(parseUnits('15', 6));

// Fast speed (higher fees = faster)
const fast = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.2', 6),
  relayerFee: parseUnits('0.3', 6),
});

// Economy (lower fees = slower but cheaper)
const economy = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.05', 6),
  relayerFee: parseUnits('0.08', 6),
});
```

---

### `calculateBurnForAction(actionAmount, options?)`

Reverse calculation: determine send amount needed for a specific action amount.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `actionAmount` | `bigint` | Amount needed for action |
| `options` | Same as `calculateFeesSync` | Fee configuration |

**Returns:** Same structure, but `amountForAction` equals input `actionAmount`

**Example:**
```typescript
// I need exactly 10 USDC for my action - how much to send?
const fees = calculateBurnForAction(parseUnits('10', 6));

// With fast execution
const fastFees = calculateBurnForAction(parseUnits('10', 6), {
  indexerFee: parseUnits('0.2', 6),
  relayerFee: parseUnits('0.3', 6),
});
```

---

### `validateActionFeasibility(sendAmount, actionCost, options?)`

Validate if send amount is sufficient for an action.

**Returns:**
```typescript
{
  feasible: boolean;       // Is it possible?
  burnAmount: bigint;      // Input send amount
  amountForAction: bigint; // Available after fees
  actionCost: bigint;      // Input action cost
  surplus: bigint;         // Extra amount if feasible
  shortfall: bigint;       // Missing amount if not feasible
  minimumBurn: bigint;     // Minimum send needed
  message: string;         // Human-readable message
}
```

---

### `DEFAULT_FEES`

Default fee constants (standard market rate).

```typescript
const DEFAULT_FEES = {
  CCTP_FEE_BPS: 1n,        // ~0.01% network fee
  PROTOCOL_FEE_BPS: 10n,   // ~0.1% protocol fee
  INDEXER_FEE: 100000n,    // 0.1 USDC (standard rate)
  RELAYER_FEE: 150000n,    // 0.15 USDC (standard rate)
};
```

---

## PonsClient

Main client for cross-chain operations.

### Constructor

```typescript
new PonsClient(config: PonsClientConfig)
```

**Config:**
```typescript
interface PonsClientConfig {
  from: string | Chain;            // Source chain
  to: string | Chain;              // Destination chain
  sourceRpcUrl: string;            // Source chain RPC
  destinationRpcUrl: string;       // Destination chain RPC
  gatewayUrl?: string;             // Pons gateway URL
  factoryAddress?: Address;        // SmartAccountFactory address
}
```

### Static Methods

#### `PonsClient.create(config)`

Create and initialize a PonsClient instance.

```typescript
const pons = await PonsClient.create({
  from: Chain.SEPOLIA,
  to: Chain.ARC_TESTNET,
  sourceRpcUrl: '...',
  destinationRpcUrl: '...',
});
```

### Instance Methods

#### `executeCCTPTransfer(params, signer)`

Execute a cross-chain transfer with action.

This method:
1. Has user sign EIP-712 action
2. Sends message on source chain
3. Publishes to Pons Network
4. Returns immediately (decentralized operators complete the rest)

**Parameters:**
```typescript
interface CCTPTransferParams {
  amount: bigint;          // Amount to send
  action: ActionOptions;   // Action to execute on destination
}
```

**Returns:**
```typescript
{
  txHash: Hex;                  // Source chain TX hash
  smartAccountAddress: Address; // User's Smart Account
  nonce: bigint;               // Transfer nonce
}
```

#### `trackTransfer(txHash, smartAccount, nonce)`

Create a transfer tracker to monitor execution.

```typescript
const tracker = pons.trackTransfer(
  result.txHash,
  result.smartAccountAddress,
  result.nonce
);
```

#### `calculateSmartAccountAddress(owner, salt)`

Calculate the deterministic Smart Account address.

```typescript
const address = await pons.calculateSmartAccountAddress(
  '0x1234...',
  0n
);
```

#### `stop()`

Cleanup and close connections.

```typescript
await pons.stop();
```

---

## ActionBuilder

Build complex cross-chain actions.

### Constructor

```typescript
new ActionBuilder()
```

### Methods

#### `addCall(target, calldata, value?)`

Add a contract call to the action.

```typescript
builder.addCall(
  '0xContract...',
  '0x...',      // Encoded calldata
  0n            // Optional ETH value
);
```

#### `withFees(paymentToken, indexerFee, relayerFee)`

Set fee configuration (dynamic fees).

```typescript
// Standard fees
builder.withFees(USDC_ADDRESS, parseUnits('0.1', 6), parseUnits('0.15', 6));

// Fast fees
builder.withFees(USDC_ADDRESS, parseUnits('0.2', 6), parseUnits('0.3', 6));
```

#### `needsEth(amount, reimbursement)`

Request ETH from relayer.

```typescript
builder.needsEth(
  parseEther('0.1'),    // ETH needed for action
  parseUnits('250', 6)  // USDC reimbursement to relayer
);
```

#### `needsTokens(tokens, amounts, reimbursement)`

Request tokens from relayer.

```typescript
builder.needsTokens(
  [TOKEN_ADDRESS],
  [parseUnits('100', 18)],
  parseUnits('50', 6)
);
```

#### `build(nonce, deadline, expectedAmount)`

Build the final action object.

```typescript
const action = builder.build(
  BigInt(Date.now()),
  BigInt(Math.floor(Date.now() / 1000) + 3600),
  expectedAmount
);
```

### Static Methods

#### `ActionBuilder.noAction(amount)`

Create a no-action (simple bridge) configuration.

```typescript
const action = ActionBuilder.noAction(parseUnits('100', 6));
```

---

## TransferTracker

Track cross-chain transfer status through decentralized execution.

### Events

| Event | Callback Type | Description |
|-------|---------------|-------------|
| `statusChange` | `(status: TransferStatus, data?: any) => void` | Any status change |
| `sent` | `(data: { txHash: Hex }) => void` | Message sent |
| `indexed` | `(data: { txHash: Hex }) => void` | Message indexed |
| `executed` | `(data: { txHash: Hex }) => void` | Action executed |
| `failed` | `(error: Error) => void` | Transfer failed |

### Methods

#### `on(event, callback)`

Subscribe to events.

```typescript
tracker.on('statusChange', (status) => {
  console.log(status);
});

tracker.on('indexed', (data) => {
  console.log('Message indexed:', data.txHash);
});

tracker.on('executed', (data) => {
  console.log('Action executed:', data.txHash);
});
```

#### `waitForStatus(status, options?)`

Wait for a specific status.

```typescript
await tracker.waitForStatus(TransferStatus.EXECUTED, {
  timeout: 30 * 60 * 1000, // 30 minutes
});
```

---

## Chain Configuration

### Built-in Chains

```typescript
import { arcTestnet, sepolia, Chain } from '@pons-network/sdk';

const pons = await PonsClient.create({
  from: Chain.SEPOLIA,
  to: Chain.ARC_TESTNET,
  // ...
});

// Chain properties
console.log(sepolia.id);     // 11155111
console.log(sepolia.domain); // 0
console.log(sepolia.usdc);   // '0x...'
```

### Custom Chains

```typescript
const customChain = createChainConfig({
  id: 42161,
  name: 'Arbitrum One',
  domain: 3,
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  tokenMessenger: '0x...',
  messageTransmitter: '0x...',
});
```

---

## Types

### Core Types

```typescript
// Action configuration
interface ActionOptions {
  target: Address;
  callData: Hex;
  value?: bigint;
  feeConfig: FeeConfig;
  permit2Setup?: Permit2Setup[];
  funding?: Funding;
}

// Fee configuration (DYNAMIC fees)
interface FeeConfig {
  paymentToken: Address;
  indexerFee: bigint;   // Dynamic - set by user
  relayerFee: bigint;   // Dynamic - set by user
}

// Funding requirements
interface Funding {
  ethNeeded: bigint;
  tokensNeeded: Address[];
  tokenAmounts: bigint[];
  maxReimbursement: bigint;
}

// Transfer result
interface TransferResult {
  txHash: Hex;
  smartAccountAddress: Address;
  nonce: bigint;
}
```

### Transfer Status

```typescript
enum TransferStatus {
  PENDING = 'pending',       // Waiting for source confirmation
  SENT = 'sent',             // Message sent on source
  ATTESTED = 'attested',     // Attestation verified
  INDEXING = 'indexing',     // Indexer processing
  INDEXED = 'indexed',       // Message indexed on destination
  EXECUTING = 'executing',   // Relayer processing
  EXECUTED = 'executed',     // Action complete
  FAILED = 'failed',         // Action failed
}
```

---

## Constants

### Chain Constants

```typescript
const Chain = {
  SEPOLIA: 'sepolia',
  ARC_TESTNET: 'arc-testnet',
  ETHEREUM: 'ethereum',
} as const;
```

### Default Fees (Standard Rate)

```typescript
const DEFAULT_FEES = {
  CCTP_FEE_BPS: 1n,        // Network fee
  PROTOCOL_FEE_BPS: 10n,   // Protocol fee
  INDEXER_FEE: 100000n,    // 0.1 USDC (standard)
  RELAYER_FEE: 150000n,    // 0.15 USDC (standard)
};
```

### Recommended Fee Levels

```typescript
const FEE_LEVELS = {
  fast: {
    indexerFee: parseUnits('0.2', 6),
    relayerFee: parseUnits('0.3', 6),
  },
  standard: {
    indexerFee: parseUnits('0.1', 6),
    relayerFee: parseUnits('0.15', 6),
  },
  economy: {
    indexerFee: parseUnits('0.05', 6),
    relayerFee: parseUnits('0.08', 6),
  },
};
```

---

## Decentralized Operators

Pons Network is **permissionless** - anyone can earn fees by running operators:

### Indexers
- Monitor for messages
- Index on destination chain
- Earn indexer fee (dynamic)

### Relayers
- Execute user actions
- Provide ETH/tokens if needed
- Earn relayer fee (dynamic)

### Why Dynamic Fees?

- **Users choose** speed vs cost
- **Operators compete** for profitable transactions
- **Market equilibrium** finds fair prices
- **No fixed fees** - adapts to network demand

```bash
# Run indexer
docker run pons/resolver:latest --mode indexer

# Run relayer
docker run pons/resolver:latest --mode executor

# Run both
docker run pons/resolver:latest --mode both
```

See [Resolver Documentation](https://github.com/pons-network/resolver) for setup details.
