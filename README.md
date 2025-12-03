# @pons/sdk

TypeScript SDK for building cross-chain applications with Pons.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)
[![npm version](https://img.shields.io/npm/v/@pons/sdk.svg)](https://www.npmjs.com/package/@pons/sdk)

## Overview

Build cross-chain dApps that let users sign once and execute anywhere. The SDK handles CCTP encoding, Waku messaging, and transfer tracking.

## Installation

```bash
npm install @pons/sdk viem
```

## Quick Start

```typescript
import { PonsClient, ActionBuilder, arcTestnet, sepolia } from '@pons/sdk';
import { parseUnits } from 'viem';

// Initialize
const pons = new PonsClient({
  sourceChain: arcTestnet,
  destinationChain: sepolia,
  factoryAddress: '0x...',
});

await pons.initialize();

// Build action
const action = ActionBuilder.transfer(recipient, parseUnits('100', 6));

// Execute cross-chain transfer
const result = await pons.executeCCTPTransfer({
  action,
  amount: parseUnits('100', 6),
  relayerFeeBps: 100n,
}, wallet);

// Track status
const tracker = pons.trackTransfer(result.txHash, result.smartAccountAddress, result.nonce);
tracker.on('statusChange', (update) => console.log(update.status));
```

## Features

- Cross-chain CCTP transfers via Circle
- Smart Account integration (ERC-4337)
- Waku network messaging
- Batch actions support
- Wallet-agnostic (Privy, wagmi, viem)
- Full TypeScript support

## API Reference

### PonsClient

```typescript
const pons = new PonsClient({
  sourceChain: ChainConfig,
  destinationChain: ChainConfig,
  factoryAddress: Address,
});

await pons.initialize();

// Execute transfer
const result = await pons.executeCCTPTransfer(params, signer);

// Track transfer
const tracker = pons.trackTransfer(txHash, smartAccount, nonce);

// Calculate address
const address = await pons.calculateSmartAccountAddress(owner, salt);

// Cleanup
await pons.stop();
```

### ActionBuilder

```typescript
// Simple transfer
const action = ActionBuilder.transfer(recipient, amount);

// Custom call
const action = ActionBuilder.fromCalldata(target, calldata, options);

// Batch actions
const action = new ActionBuilder()
  .addCall(target1, calldata1)
  .addCall(target2, calldata2)
  .withFees(USDC, indexerFee, relayerFee)
  .build(nonce, deadline, amount);
```

### TransferTracker

```typescript
const tracker = pons.trackTransfer(txHash, smartAccount, nonce);

// Listen to events
tracker.on('statusChange', callback);
tracker.on('executed', callback);

// Wait for status
await tracker.waitForStatus(TransferStatus.EXECUTED);

// Stop tracking
tracker.stop();
```

## Transfer Status Flow

```
INITIATED -> ATTESTED -> ANNOUNCED -> MINTED -> EXECUTED
```

| Status | Description |
|--------|-------------|
| INITIATED | USDC burned on source chain |
| ATTESTED | Circle attestation ready |
| ANNOUNCED | Published to Pons Network |
| MINTED | USDC minted on destination |
| EXECUTED | Action completed |

## Wallet Integration

Works with any wallet that supports `signTypedData`:

```typescript
// Privy
const { wallets } = useWallets();
await pons.executeCCTPTransfer(params, wallets[0]);

// wagmi
const { data: walletClient } = useWalletClient();
await pons.executeCCTPTransfer(params, walletClient);

// viem
const walletClient = createWalletClient({ ... });
await pons.executeCCTPTransfer(params, walletClient);
```

## Chain Configuration

```typescript
import { createChainConfig } from '@pons/sdk';

const customChain = createChainConfig({
  id: 1234,
  name: 'Custom Chain',
  rpcUrl: 'https://rpc.custom.com',
  domain: 5,
  tokenMessenger: '0x...',
  messageTransmitter: '0x...',
  usdc: '0x...',
});
```

## Protocol Integration

See [INTEGRATIONS.md](./docs/INTEGRATIONS.md) for building protocol-specific action builders.

## Types

```typescript
import type {
  IAction,
  CCTPTransferParams,
  TransferResult,
  TransferStatus,
  WalletSigner,
  ChainConfig,
} from '@pons/sdk';
```

## License

MIT
