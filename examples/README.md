# Pons Network SDK - Examples & Integration Guide

Complete guide for integrating **Pons Network** into your DApps. Build seamless cross-chain experiences with decentralized execution.

## Table of Contents

- [Installation & Setup](#installation--setup)
- [Understanding the Architecture](#understanding-the-architecture)
- [Understanding Pons Fees](#understanding-pons-fees)
- [Basic Examples](#basic-examples)
- [Advanced Examples](#advanced-examples)
- [Frontend Integration](#frontend-integration)
- [Node.js Integration](#nodejs-integration)
- [Running Your Own Operator](#running-your-own-operator)

---

## Installation & Setup

```bash
npm install @pons-network/sdk viem
```

### Initialize Client

```typescript
import { PonsClient, Chain } from '@pons-network/sdk';

// Initialize Pons client
const pons = await PonsClient.create({
  from: Chain.SEPOLIA,           // Source chain
  to: Chain.ARC_TESTNET,         // Destination chain
  sourceRpcUrl: process.env.SEPOLIA_RPC_URL,
  destinationRpcUrl: process.env.ARC_RPC_URL,
});

// Get user's Smart Account address (deterministic across all chains!)
const smartAccount = await pons.calculateSmartAccountAddress(userAddress, 0n);
console.log(`Smart Account: ${smartAccount}`);
```

---

## Understanding the Architecture

Pons Network is a **decentralized cross-chain execution layer**.

### How a Cross-Chain Transfer Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PONS NETWORK FLOW                                    │
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
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1-2: User signs action + sends message on source chain
STEP 3-4: Pons Network relays and verifies the message
STEP 5:   Indexer indexes the message on destination chain
STEP 6:   Relayer executes the user's signed action
```

### Decentralized Operators

| Component | Decentralization |
|-----------|-----------------|
| **Message Publishing** | Anyone can publish transfer messages |
| **Indexers** | Permissionless - anyone can run an indexer |
| **Relayers** | Permissionless - anyone can run a relayer |
| **Smart Accounts** | Non-custodial - only owner can authorize actions |

### Become an Operator

Anyone can join Pons Network as an operator and earn income:

- **Indexers** earn fees for indexing messages on destination chain
- **Relayers** earn fees for executing actions

See [Running Your Own Operator](#running-your-own-operator) below.

---

## Understanding Pons Fees

Fees are **dynamic** - just like Ethereum gas! Pay more for faster execution, or save money with lower fees.

### Dynamic Fee Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DYNAMIC FEE MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ⚡ FAST - Pay above market rate                                            │
│     → Operators prioritize your transaction                                │
│     → Fastest execution                                                    │
│                                                                             │
│  🔄 STANDARD - Pay market rate                                              │
│     → Normal execution speed                                               │
│     → Balanced cost/speed                                                  │
│                                                                             │
│  🐢 ECONOMY - Pay below market rate                                         │
│     → Slower execution                                                     │
│     → Cheapest option                                                      │
│                                                                             │
│  Just like Ethereum gas - you choose speed vs cost!                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fee Breakdown

```
User sends: 15.000000 USDC
       │
       ├── Network Fee (~0.01%):    Cross-chain relay
       │
       └── Expected Amount:         Arrives at Smart Account
               │
               ├── Protocol Fee:    Pons treasury
               ├── Indexer Fee:     Indexer operator (DYNAMIC)
               ├── Relayer Fee:     Relayer operator (DYNAMIC)
               │
               └── Amount for Action: Your action
```

### Fee Calculation Examples

```typescript
import { calculateFeesSync } from '@pons-network/sdk';
import { parseUnits, formatUnits } from 'viem';

// Standard fees (market rate)
const standardFees = calculateFeesSync(parseUnits('15', 6));
console.log(`Standard: ${formatUnits(standardFees.amountForAction, 6)} USDC for action`);

// Fast execution (2x fees)
const fastFees = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.2', 6),   // Higher indexer fee
  relayerFee: parseUnits('0.3', 6),   // Higher relayer fee
});
console.log(`Fast: ${formatUnits(fastFees.amountForAction, 6)} USDC for action`);

// Economy (0.5x fees - slower but cheaper)
const economyFees = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.05', 6),  // Lower indexer fee
  relayerFee: parseUnits('0.08', 6),  // Lower relayer fee
});
console.log(`Economy: ${formatUnits(economyFees.amountForAction, 6)} USDC for action`);
```

### Two Ways to Calculate Fees

#### Method 1: "I want to send X USDC" → `calculateFeesSync()`

```typescript
const fees = calculateFeesSync(parseUnits('15', 6));
// fees.amountForAction = how much available for your action
```

#### Method 2: "I need X USDC for my action" → `calculateBurnForAction()`

```typescript
const fees = calculateBurnForAction(parseUnits('10', 6));
// fees.burnAmount = how much user needs to send
```

---

## Basic Examples

### 1. Simple Bridge

Send USDC cross-chain to your Smart Account.

```typescript
import { PonsClient, Chain, calculateFeesSync } from '@pons-network/sdk';
import { parseUnits, formatUnits } from 'viem';

async function simpleBridge(walletClient: WalletClient, amount: string) {
  const pons = await PonsClient.create({
    from: Chain.SEPOLIA,
    to: Chain.ARC_TESTNET,
    sourceRpcUrl: process.env.SEPOLIA_RPC_URL!,
    destinationRpcUrl: process.env.ARC_RPC_URL!,
  });

  const fees = calculateFeesSync(parseUnits(amount, 6));

  console.log(`🌉 Cross-Chain Bridge`);
  console.log(`   Send: ${formatUnits(fees.burnAmount, 6)} USDC`);
  console.log(`   Receive: ${formatUnits(fees.amountForAction, 6)} USDC`);

  // Send message on source chain
  const result = await pons.executeCCTPTransfer({
    amount: fees.burnAmount,
    action: {
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
    },
  }, walletClient);

  console.log(`✅ Message sent!`);
  console.log(`   TX: ${result.txHash}`);
  console.log(`   Smart Account: ${result.smartAccountAddress}`);
  console.log(`   Waiting for indexer and relayer...`);

  // Track the decentralized execution
  const tracker = pons.trackTransfer(
    result.txHash,
    result.smartAccountAddress,
    result.nonce
  );

  tracker.on('statusChange', (status) => {
    console.log(`📡 Status: ${status}`);
  });

  return result;
}
```

### 2. Cross-Chain Swap

Swap USDC on source chain for tokens on destination chain.

```typescript
async function crossChainSwap(
  walletClient: WalletClient,
  usdcAmount: string,
  minOutputAmount: bigint,
  speedOption: 'fast' | 'standard' | 'economy' = 'standard'
) {
  const pons = await PonsClient.create({
    from: Chain.SEPOLIA,
    to: Chain.ARC_TESTNET,
    sourceRpcUrl: process.env.SEPOLIA_RPC_URL!,
    destinationRpcUrl: process.env.ARC_RPC_URL!,
  });

  const smartAccount = await pons.calculateSmartAccountAddress(
    walletClient.account.address,
    0n
  );

  // Dynamic fees based on speed preference
  const feeOptions = {
    fast: { indexerFee: parseUnits('0.2', 6), relayerFee: parseUnits('0.3', 6) },
    standard: { indexerFee: parseUnits('0.1', 6), relayerFee: parseUnits('0.15', 6) },
    economy: { indexerFee: parseUnits('0.05', 6), relayerFee: parseUnits('0.08', 6) },
  };

  const fees = calculateFeesSync(parseUnits(usdcAmount, 6), feeOptions[speedOption]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

  console.log(`🔄 Cross-Chain Swap (${speedOption} mode)`);
  console.log(`   Send: ${formatUnits(fees.burnAmount, 6)} USDC`);
  console.log(`   Swap: ${formatUnits(fees.amountForAction, 6)} USDC → WETH`);

  const swapCalldata = encodeFunctionData({
    abi: UNISWAP_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: USDC_ADDRESS,
      tokenOut: WETH_ADDRESS,
      fee: 3000,
      recipient: smartAccount,
      deadline,
      amountIn: fees.amountForAction,
      amountOutMinimum: minOutputAmount,
      sqrtPriceLimitX96: 0n,
    }],
  });

  const result = await pons.executeCCTPTransfer({
    amount: fees.burnAmount,
    action: {
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
    },
  }, walletClient);

  console.log(`✅ Message sent! Decentralized operators will complete the swap.`);
  
  return result;
}

// Usage with different speed options
await crossChainSwap(wallet, '15', minOutput, 'fast');     // Pay more, faster
await crossChainSwap(wallet, '15', minOutput, 'standard'); // Market rate
await crossChainSwap(wallet, '15', minOutput, 'economy');  // Pay less, slower
```

---

## Advanced Examples

### 3. NFT Purchase

Buy an NFT on destination chain using USDC from source chain.

```typescript
async function buyNFT(
  walletClient: WalletClient,
  nftContract: Address,
  tokenId: bigint,
  nftPriceEth: number,
  ethPriceUsdc: number
) {
  const pons = await PonsClient.create({
    from: Chain.SEPOLIA,
    to: Chain.ARC_TESTNET,
    sourceRpcUrl: process.env.SEPOLIA_RPC_URL!,
    destinationRpcUrl: process.env.ARC_RPC_URL!,
  });

  const nftPriceUsdc = nftPriceEth * ethPriceUsdc;
  const ethNeeded = parseEther(nftPriceEth.toString());
  const fees = calculateBurnForAction(parseUnits(nftPriceUsdc.toFixed(6), 6));
  
  console.log(`🎨 Cross-Chain NFT Purchase`);
  console.log(`   NFT: ${nftPriceEth} ETH (~${nftPriceUsdc} USDC)`);
  console.log(`   User sends: ${formatUnits(fees.burnAmount, 6)} USDC`);

  const mintCalldata = encodeFunctionData({
    abi: NFT_ABI,
    functionName: 'mint',
    args: [tokenId],
  });

  const result = await pons.executeCCTPTransfer({
    amount: fees.burnAmount,
    action: {
      target: nftContract,
      callData: mintCalldata,
      value: ethNeeded,
      feeConfig: {
        paymentToken: USDC_ADDRESS,
        indexerFee: fees.indexerFee,
        relayerFee: fees.relayerFee,
      },
      permit2Setup: [],
      funding: {
        ethNeeded: ethNeeded,
        tokensNeeded: [],
        tokenAmounts: [],
        maxReimbursement: fees.amountForAction,
      },
    },
  }, walletClient);

  return result;
}
```

### 4. Game Actions

Execute game actions cross-chain with fee optimization.

```typescript
const ITEM_PRICES = {
  sword: parseUnits('5', 6),
  shield: parseUnits('3', 6),
  potion: parseUnits('1', 6),
};

async function buyGameItem(
  walletClient: WalletClient,
  itemId: bigint,
  itemPrice: bigint,
  prioritize: boolean = false
) {
  const pons = await PonsClient.create({
    from: Chain.SEPOLIA,
    to: Chain.ARC_TESTNET,
    sourceRpcUrl: process.env.SEPOLIA_RPC_URL!,
    destinationRpcUrl: process.env.ARC_RPC_URL!,
  });

  // Dynamic fees - pay more if you want the item faster!
  const feeConfig = prioritize
    ? { indexerFee: parseUnits('0.2', 6), relayerFee: parseUnits('0.3', 6) }
    : { indexerFee: parseUnits('0.1', 6), relayerFee: parseUnits('0.15', 6) };

  const fees = calculateBurnForAction(itemPrice, feeConfig);

  console.log(`🎮 Cross-Chain Game Purchase ${prioritize ? '(PRIORITY)' : ''}`);
  console.log(`   Item: ${formatUnits(itemPrice, 6)} USDC`);
  console.log(`   User sends: ${formatUnits(fees.burnAmount, 6)} USDC`);

  const buyCalldata = encodeFunctionData({
    abi: GAME_ABI,
    functionName: 'buyItem',
    args: [itemId],
  });

  const result = await pons.executeCCTPTransfer({
    amount: fees.burnAmount,
    action: {
      target: GAME_CONTRACT,
      callData: buyCalldata,
      value: 0n,
      feeConfig: {
        paymentToken: USDC_ADDRESS,
        indexerFee: fees.indexerFee,
        relayerFee: fees.relayerFee,
      },
      permit2Setup: [],
      funding: {
        ethNeeded: 0n,
        tokensNeeded: [USDC_ADDRESS],
        tokenAmounts: [itemPrice],
        maxReimbursement: fees.amountForAction,
      },
    },
  }, walletClient);

  return result;
}
```

### 5. Batch Actions

Execute multiple actions in a single cross-chain transaction.

```typescript
async function batchSwapAndStake(walletClient: WalletClient, amount: string) {
  const pons = await PonsClient.create({
    from: Chain.SEPOLIA,
    to: Chain.ARC_TESTNET,
    sourceRpcUrl: process.env.SEPOLIA_RPC_URL!,
    destinationRpcUrl: process.env.ARC_RPC_URL!,
  });

  const fees = calculateFeesSync(parseUnits(amount, 6));

  console.log(`⚡ Cross-Chain Batch: Swap + Stake`);
  console.log(`   User sends: ${formatUnits(fees.burnAmount, 6)} USDC`);

  const action = new ActionBuilder()
    .addCall(USDC_ADDRESS, approveSwapCalldata)
    .addCall(UNISWAP_ROUTER, swapCalldata)
    .addCall(WETH_ADDRESS, approveStakeCalldata)
    .addCall(STAKING_CONTRACT, stakeCalldata)
    .withFees(USDC_ADDRESS, fees.indexerFee, fees.relayerFee)
    .build(BigInt(Date.now()), BigInt(Math.floor(Date.now() / 1000) + 3600), fees.expectedAmount);

  const result = await pons.executeCCTPTransfer({
    amount: fees.burnAmount,
    action: { /* ... */ },
  }, walletClient);

  return result;
}
```

---

## Frontend Integration

### React + wagmi

```typescript
import { useWalletClient, useAccount } from 'wagmi';
import { PonsClient, Chain, calculateFeesSync, TransferStatus } from '@pons-network/sdk';
import { useState } from 'react';

function usePons() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const [speedMode, setSpeedMode] = useState<'fast' | 'standard' | 'economy'>('standard');

  const bridge = async (amount: string) => {
    if (!walletClient) throw new Error('Not initialized');
    
    const pons = await PonsClient.create({
      from: Chain.SEPOLIA,
      to: Chain.ARC_TESTNET,
      sourceRpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC!,
      destinationRpcUrl: process.env.NEXT_PUBLIC_ARC_RPC!,
    });

    // Dynamic fees based on user preference
    const feeOptions = {
      fast: { indexerFee: parseUnits('0.2', 6), relayerFee: parseUnits('0.3', 6) },
      standard: { indexerFee: parseUnits('0.1', 6), relayerFee: parseUnits('0.15', 6) },
      economy: { indexerFee: parseUnits('0.05', 6), relayerFee: parseUnits('0.08', 6) },
    };
    
    const fees = calculateFeesSync(parseUnits(amount, 6), feeOptions[speedMode]);
    
    return await pons.executeCCTPTransfer({
      amount: fees.burnAmount,
      action: { /* ... */ },
    }, walletClient);
  };

  return { bridge, speedMode, setSpeedMode };
}

// UI Component
function SpeedSelector({ value, onChange }) {
  return (
    <div>
      <label>Execution Speed:</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="fast">⚡ Fast (higher fees)</option>
        <option value="standard">🔄 Standard</option>
        <option value="economy">🐢 Economy (lower fees)</option>
      </select>
    </div>
  );
}
```

---

## Node.js Integration

```typescript
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PonsClient, Chain, calculateFeesSync, TransferStatus } from '@pons-network/sdk';

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as Address);
  const walletClient = createWalletClient({
    account,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });

  const pons = await PonsClient.create({
    from: Chain.SEPOLIA,
    to: Chain.ARC_TESTNET,
    sourceRpcUrl: process.env.SEPOLIA_RPC_URL!,
    destinationRpcUrl: process.env.ARC_RPC_URL!,
  });

  const fees = calculateFeesSync(parseUnits('100', 6));
  
  console.log(`Sending message on source chain...`);

  const result = await pons.executeCCTPTransfer({
    amount: fees.burnAmount,
    action: { /* ... */ },
  }, walletClient);

  console.log(`TX: ${result.txHash}`);
  console.log(`Waiting for message to be indexed on destination...`);

  const tracker = pons.trackTransfer(
    result.txHash,
    result.smartAccountAddress,
    result.nonce
  );

  tracker.on('statusChange', (status) => {
    console.log(`Status: ${status}`);
    
    if (status === TransferStatus.EXECUTED) {
      console.log('✅ Action executed!');
      pons.stop();
      process.exit(0);
    }
  });
}

main().catch(console.error);
```

---

## Running Your Own Operator

Pons Network is **permissionless** - anyone can run an indexer or relayer and earn fees!

### Why Become an Operator?

- **Earn fees** - Dynamic fees based on market demand
- **Support decentralization** - More operators = more resilient network
- **No permission needed** - Just run the software and start earning

### Running an Indexer

Indexers monitor messages and index them on the destination chain.

```bash
# Clone the resolver
git clone https://github.com/pons-network/resolver
cd resolver

# Configure environment
cp env.example .env
# Edit .env with your RPC URLs and private key

# Run as indexer
docker-compose --profile indexer up -d
```

### Running a Relayer

Relayers execute user actions after messages are indexed.

```bash
# Run as relayer (executor)
docker-compose --profile executor up -d
```

### Running Both

```bash
# Run as full resolver (indexer + relayer)
docker-compose --profile both up -d
```

### Operator Economics

Operators compete in a **free market**:
- Users who pay higher fees get prioritized
- Operators choose which transactions to process based on profitability
- Market equilibrium finds fair prices based on supply/demand

---

## Transfer Status

Track your cross-chain transfers through these stages:

| Status | Description |
|--------|-------------|
| `PENDING` | Waiting for source chain confirmation |
| `SENT` | Message sent on source chain |
| `ATTESTED` | Attestation verified |
| `INDEXING` | Indexer processing |
| `INDEXED` | Message indexed on destination |
| `EXECUTING` | Relayer executing action |
| `EXECUTED` | ✅ Complete! |
| `FAILED` | ❌ Action failed |

---

## Why Pons Network?

| Traditional Approach | Pons Network |
|---------------------|--------------|
| Centralized bridges | Decentralized operators |
| Fixed fees | Dynamic fees (like ETH gas) |
| Single points of failure | Permissionless & resilient |
| Switch networks | Stay on your chain |
| Multiple transactions | One signature |
| Need gas on each chain | Fees in USDC only |

**Pons Network** provides a decentralized execution layer, giving your users a seamless multi-chain experience.
