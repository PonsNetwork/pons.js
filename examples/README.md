# @pons-network/sdk Examples

This guide shows how to integrate `@pons-network/sdk` into your DApps and Node.js applications for cross-chain USDC transfers with programmable execution.

## Installation

```bash
npm install @pons-network/sdk viem
```

---

## Quick Start

### 1. Basic Setup

```typescript
import { PonsClient, ActionBuilder, arcTestnet, sepolia } from '@pons-network/sdk';

// Initialize client (uses gateway.pons.sh by default)
const pons = new PonsClient({
  sourceChain: arcTestnet,           // Source chain config
  destinationChain: sepolia,         // Destination chain config
  factoryAddress: '0x...',           // SmartAccountFactory address
});

await pons.initialize();
```

### Custom Gateway URL

```typescript
// Use a custom gateway (self-hosted or regional)
const pons = new PonsClient({
  sourceChain: arcTestnet,
  destinationChain: sepolia,
  factoryAddress: '0x...',
  gatewayUrl: 'https://gateway-eu.pons.sh', // Custom gateway
});

// Or use direct Pons Relay (advanced)
const ponsDirect = new PonsClient({
  sourceChain: arcTestnet,
  destinationChain: sepolia,
  factoryAddress: '0x...',
  ponsRelayUrl: 'http://localhost:8645', // Direct relay connection
});
```

---

## DApp Integration (Browser)

### With wagmi + viem (React/Vue)

```typescript
import { useWalletClient, useAccount } from 'wagmi';
import { PonsClient, ActionBuilder, arcTestnet, sepolia, parseUSDC } from '@pons-network/sdk';

function SwapComponent() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  async function executeCrossChainSwap() {
    const pons = new PonsClient({
      sourceChain: arcTestnet,
      destinationChain: sepolia,
      factoryAddress: '0x...',
    });
    
    await pons.initialize();

    // Build the action to execute on destination chain
    const action = {
      target: UNISWAP_ROUTER,           // Contract to call
      callData: swapCalldata,            // Encoded swap call
      value: 0n,
      feeConfig: {
        paymentToken: USDC_ADDRESS,
        indexerFee: parseUSDC('0.10'),   // 0.10 USDC
        relayerFee: parseUSDC('0.20'),   // 0.20 USDC
      },
    };

    // Execute cross-chain transfer
    const result = await pons.executeCCTPTransfer(
      {
        amount: parseUSDC('100'),        // 100 USDC to bridge
        action,
      },
      walletClient
    );

    console.log('Transfer initiated:', result.txHash);
    console.log('Smart Account:', result.smartAccountAddress);

    // Track the transfer
    const tracker = pons.trackTransfer(
      result.txHash,
      result.smartAccountAddress,
      result.nonce
    );

    tracker.on('statusChange', (status) => {
      console.log('Status:', status);
    });

    tracker.on('completed', (data) => {
      console.log('Transfer completed!', data);
    });
  }

  return <button onClick={executeCrossChainSwap}>Swap Cross-Chain</button>;
}
```

### With Privy

```typescript
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { PonsClient, parseUSDC } from '@pons-network/sdk';

function PrivySwap() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  async function swap() {
    const wallet = wallets[0];
    const provider = await wallet.getEthereumProvider();
    
    // Create viem wallet client from Privy
    const walletClient = createWalletClient({
      account: wallet.address as `0x${string}`,
      transport: custom(provider),
    });

    const pons = new PonsClient({
      sourceChain: arcTestnet,
      destinationChain: sepolia,
      factoryAddress: '0x...',
    });

    await pons.initialize();

    const result = await pons.executeCCTPTransfer(
      {
        amount: parseUSDC('50'),
        action: {
          target: '0x0000000000000000000000000000000000000000', // No action = simple bridge
          callData: '0x',
          feeConfig: {
            paymentToken: USDC_ADDRESS,
            indexerFee: parseUSDC('0.05'),
            relayerFee: parseUSDC('0.10'),
          },
        },
      },
      walletClient
    );

    console.log('Bridged!', result);
  }
}
```

---

## Node.js Integration

### Basic Transfer

```typescript
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PonsClient, ActionBuilder, arcTestnet, sepolia, parseUSDC } from '@pons-network/sdk';

async function main() {
  // Create wallet from private key
  const account = privateKeyToAccount('0x...');
  const walletClient = createWalletClient({
    account,
    transport: http(arcTestnet.rpcUrl),
  });

  // Initialize Pons client (uses gateway.pons.sh by default)
  const pons = new PonsClient({
    sourceChain: arcTestnet,
    destinationChain: sepolia,
    factoryAddress: '0x...',
    // gatewayUrl: 'https://my-gateway.example.com', // Optional: custom gateway
  });

  await pons.initialize();

  // Simple bridge (no action on destination)
  const result = await pons.executeCCTPTransfer(
    {
      amount: parseUSDC('100'),
      action: {
        target: '0x0000000000000000000000000000000000000000',
        callData: '0x',
        feeConfig: {
          paymentToken: sepolia.usdc,
          indexerFee: parseUSDC('0.10'),
          relayerFee: parseUSDC('0.20'),
        },
      },
    },
    walletClient
  );

  console.log('Transfer initiated:', result);
  
  // Track completion
  const tracker = pons.trackTransfer(
    result.txHash,
    result.smartAccountAddress,
    result.nonce
  );

  tracker.on('completed', () => {
    console.log('Transfer completed!');
    process.exit(0);
  });

  tracker.on('failed', (error) => {
    console.error('Transfer failed:', error);
    process.exit(1);
  });
}

main();
```

---

## ActionBuilder Examples

### Simple Contract Call

```typescript
import { ActionBuilder, parseUSDC } from '@pons-network/sdk';
import { encodeFunctionData } from 'viem';

// Encode your contract call
const calldata = encodeFunctionData({
  abi: PROTOCOL_ABI,
  functionName: 'deposit',
  args: [amount, recipient],
});

// Build action with fluent API
const action = new ActionBuilder()
  .addCall(PROTOCOL_ADDRESS, calldata)
  .withFees(USDC_ADDRESS, parseUSDC('0.10'), parseUSDC('0.20'))
  .build(nonce, deadline, bridgeAmount);
```

### Multi-Step Batch Action

```typescript
// Approve + Swap + Stake in one transaction
const approveCalldata = encodeFunctionData({
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [UNISWAP_ROUTER, amount],
});

const swapCalldata = encodeFunctionData({
  abi: UNISWAP_ABI,
  functionName: 'exactInputSingle',
  args: [swapParams],
});

const stakeCalldata = encodeFunctionData({
  abi: STAKING_ABI,
  functionName: 'stake',
  args: [outputAmount],
});

const action = new ActionBuilder()
  .addCall(USDC_ADDRESS, approveCalldata)
  .addCall(UNISWAP_ROUTER, swapCalldata)
  .addCall(STAKING_CONTRACT, stakeCalldata)
  .withFees(USDC_ADDRESS, parseUSDC('0.10'), parseUSDC('0.50'))
  .build(nonce, deadline, bridgeAmount);
```

### Action with ETH Value

```typescript
// Wrap ETH on destination chain
const wrapCalldata = encodeFunctionData({
  abi: WETH_ABI,
  functionName: 'deposit',
  args: [],
});

const action = new ActionBuilder()
  .addCall(WETH_ADDRESS, wrapCalldata, parseEther('0.1')) // Send 0.1 ETH
  .withFees(USDC_ADDRESS, parseUSDC('0.10'), parseUSDC('0.20'))
  .needsEth(parseEther('0.1'), parseUSDC('50')) // Request ETH from relayer
  .build(nonce, deadline, bridgeAmount);
```

### With Permit2 (Gasless Token Approvals)

```typescript
const action = new ActionBuilder()
  .addCall(AAVE_POOL, depositCalldata)
  .withPermit2(USDC_ADDRESS, AAVE_POOL, depositAmount)
  .withFees(USDC_ADDRESS, parseUSDC('0.05'), parseUSDC('0.15'))
  .build(nonce, deadline, bridgeAmount);
```

---

## Transfer Tracking

```typescript
import { TransferStatus } from '@pons-network/sdk';

const tracker = pons.trackTransfer(txHash, smartAccount, nonce);

// Listen to all status changes
tracker.on('statusChange', (status: TransferStatus, data?: any) => {
  switch (status) {
    case TransferStatus.PENDING:
      console.log('Waiting for source confirmation...');
      break;
    case TransferStatus.BURNED:
      console.log('USDC burned on source chain');
      break;
    case TransferStatus.ATTESTED:
      console.log('Circle attestation received');
      break;
    case TransferStatus.MINTING:
      console.log('Minting on destination...');
      break;
    case TransferStatus.EXECUTING:
      console.log('Executing action...');
      break;
    case TransferStatus.COMPLETED:
      console.log('Transfer complete!');
      break;
    case TransferStatus.FAILED:
      console.log('Transfer failed:', data);
      break;
  }
});

// Or use specific events
tracker.on('completed', (result) => {
  console.log('Success! Destination TX:', result.txHash);
});

tracker.on('failed', (error) => {
  console.error('Failed:', error);
});

// Stop tracking when done
tracker.stop();
```

---

## Utility Functions

```typescript
import {
  parseUSDC,           // "100" -> 100000000n (6 decimals)
  formatUSDC,          // 100000000n -> "100.00"
  calculateDeadline,   // Get deadline timestamp
  truncateAddress,     // "0x1234...5678"
  isValidAddress,      // Validate address format
} from '@pons-network/sdk';

// Parse human-readable amounts
const amount = parseUSDC('100.50');  // 100500000n

// Format for display
const display = formatUSDC(100500000n);  // "100.50"

// Calculate deadline (30 minutes from now)
const deadline = calculateDeadline(30 * 60);

// Truncate address for UI
const short = truncateAddress('0x1234567890abcdef1234567890abcdef12345678');
// -> "0x1234...5678"
```

---

## Chain Configuration

### Using Built-in Configs

```typescript
import { arcTestnet, sepolia, ethereum } from '@pons-network/sdk';

// Arc Testnet -> Sepolia
const pons = new PonsClient({
  sourceChain: arcTestnet,
  destinationChain: sepolia,
  factoryAddress: '0x...',
});
```

### Custom Chain Config

```typescript
import { createChainConfig } from '@pons-network/sdk';

const customChain = createChainConfig({
  id: 42161,
  name: 'Arbitrum One',
  domain: 3,  // CCTP domain
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  tokenMessenger: '0x...',
  messageTransmitter: '0x...',
});
```

---

## Error Handling

```typescript
try {
  const result = await pons.executeCCTPTransfer(params, walletClient);
} catch (error) {
  if (error.message.includes('Insufficient USDC balance')) {
    // Handle insufficient funds
  } else if (error.message.includes('User rejected')) {
    // Handle user rejection
  } else if (error.message.includes('Deadline has passed')) {
    // Handle expired deadline
  } else {
    // Handle other errors
    console.error('Transfer failed:', error);
  }
}
```

---

## TypeScript Types

```typescript
import type {
  IAction,
  ActionOptions,
  FeeConfig,
  CCTPTransferParams,
  TransferResult,
  ChainConfig,
  PonsClientConfig,
} from '@pons-network/sdk';

// Full type safety
const action: ActionOptions = {
  target: '0x...',
  callData: '0x...',
  feeConfig: {
    paymentToken: '0x...',
    indexerFee: 100000n,
    relayerFee: 200000n,
  },
};
```

---

## More Resources

- [Pons SDK Documentation](https://docs.pons.network)
- [GitHub Repository](https://github.com/pons-network/pons-sdk)
- [CCTP Documentation](https://developers.circle.com/stablecoins/cctp)

