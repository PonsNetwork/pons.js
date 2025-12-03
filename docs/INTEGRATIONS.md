# Protocol Integration Guide

This guide shows how protocols like Uniswap, Aave, or any DeFi platform can integrate with Pons to enable cross-chain functionality.

## Overview

Pons provides a flexible action system that allows protocols to define custom actions that execute on the destination chain after USDC is minted via CCTP.

## Integration Steps

### 1. Create an Action Builder

Create a function that builds your protocol's action:

```typescript
import { ActionBuilder, type IAction } from '@pons/sdk';
import { encodeFunctionData, type Address, type Hex } from 'viem';

export interface YourProtocolParams {
  // Define your parameters
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: Address;
}

export function buildYourProtocolAction(
  params: YourProtocolParams
): IAction {
  // Encode your contract call
  const calldata = encodeFunctionData({
    abi: YOUR_PROTOCOL_ABI,
    functionName: 'yourFunction',
    args: [
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
      params.minAmountOut,
      params.recipient,
    ],
  });

  // Wrap in Pons action
  return ActionBuilder.fromCalldata(
    YOUR_CONTRACT_ADDRESS,
    calldata,
    {
      value: 0n, // ETH value if needed
      validate: async () => {
        // Add validation logic
        if (params.amountIn <= 0n) {
          throw new Error('Invalid amount');
        }
      },
    }
  );
}
```

### 2. Export for Users

Export your builder in an NPM package:

```typescript
// your-protocol-pons/index.ts
export { buildYourProtocolAction } from './action';
export type { YourProtocolParams } from './action';
```

### 3. Users Import and Use

Users can then integrate your protocol:

```typescript
import { PonsClient } from '@pons/sdk';
import { buildYourProtocolAction } from '@your-protocol/pons';

const action = buildYourProtocolAction({
  tokenIn: USDC,
  tokenOut: WETH,
  amountIn: parseUnits('100', 6),
  minAmountOut: parseUnits('0.03', 18),
  recipient: userAddress,
});

const result = await pons.executeCCTPTransfer(
  { action, amount: parseUnits('100', 6), relayerFeeBps: 100n },
  wallet
);
```

## Example: Uniswap V4 Integration

### Action Builder

```typescript
import { ActionBuilder, type IAction } from '@pons/sdk';
import { encodeFunctionData, type Address } from 'viem';

export interface UniswapV4SwapParams {
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  zeroForOne: boolean;
  amountSpecified: bigint;
  sqrtPriceLimitX96: bigint;
  recipient: Address;
}

export function buildUniswapV4Swap(
  params: UniswapV4SwapParams,
  swapRouterAddress: Address
): IAction {
  const calldata = encodeFunctionData({
    abi: UNISWAP_V4_ROUTER_ABI,
    functionName: 'swap',
    args: [
      params.poolKey,
      {
        zeroForOne: params.zeroForOne,
        amountSpecified: params.amountSpecified,
        sqrtPriceLimitX96: params.sqrtPriceLimitX96,
      },
      params.recipient,
    ],
  });

  return ActionBuilder.fromCalldata(
    swapRouterAddress,
    calldata,
    {
      value: 0n,
      validate: async () => {
        if (params.amountSpecified <= 0n) {
          throw new Error('Amount must be positive');
        }
      },
    }
  );
}
```

### Usage Example

```typescript
import { buildUniswapV4Swap } from '@uniswap/pons';

const swapAction = buildUniswapV4Swap({
  poolKey: {
    currency0: USDC_ADDRESS,
    currency1: WETH_ADDRESS,
    fee: 3000, // 0.3%
    tickSpacing: 60,
    hooks: ZERO_ADDRESS,
  },
  zeroForOne: true,
  amountSpecified: parseUnits('100', 6),
  sqrtPriceLimitX96: 0n,
  recipient: userAddress,
});

await pons.executeCCTPTransfer({
  action: swapAction,
  amount: parseUnits('100', 6),
  relayerFeeBps: 100n,
}, wallet);
```

## Advanced: Actions with Funding

Some actions need additional ETH or ERC20 tokens. Use the funding system:

```typescript
export function buildComplexAction(params: ComplexParams): IAction {
  const calldata = encodeFunctionData({ ... });

  return ActionBuilder.fromCalldata(
    YOUR_CONTRACT,
    calldata,
    {
      value: parseEther('0.1'), // ETH needed
      ethNeeded: parseEther('0.1'),
      tokensNeeded: [
        {
          token: WETH_ADDRESS,
          amount: parseUnits('1', 18),
        },
      ],
    }
  );
}
```

The relayer will front these tokens and get reimbursed from the bridged USDC.

## Testing Your Integration

### 1. Local Testing

```typescript
import { buildYourProtocolAction } from './your-action';

// Test action building
const action = buildYourProtocolAction({
  // test params
});

// Verify calldata
console.log('Target:', action.target);
console.log('Calldata:', action.calldata);

// Test validation
await action.validate?.();
```

### 2. Testnet Testing

1. Deploy your protocol contracts to Sepolia
2. Get testnet USDC on Arc
3. Execute a test transfer:

```typescript
const pons = new PonsClient({
  sourceChain: arcTestnet,
  destinationChain: sepolia,
  factoryAddress: FACTORY_ADDRESS,
});

await pons.initialize();

const action = buildYourProtocolAction({ ... });

const result = await pons.executeCCTPTransfer({
  action,
  amount: parseUnits('1', 6), // Start small
  relayerFeeBps: 100n,
}, wallet);

console.log('Transfer initiated:', result.txHash);
```

4. Track the transfer:

```typescript
const tracker = pons.trackTransfer(
  result.txHash,
  result.smartAccountAddress,
  result.nonce
);

tracker.on('statusChange', (update) => {
  console.log('Status:', update.status, update.metadata);
});

await tracker.waitForStatus(TransferStatus.EXECUTED);
console.log('Action executed successfully!');
```

## Best Practices

### 1. Validation

Always validate parameters before execution:

```typescript
validate: async () => {
  // Check amounts
  if (params.amount <= 0n) {
    throw new Error('Amount must be positive');
  }
  
  // Check addresses
  if (!isAddress(params.recipient)) {
    throw new Error('Invalid recipient address');
  }
  
  // Check slippage
  if (params.minAmountOut >= params.amountIn) {
    throw new Error('Invalid slippage settings');
  }
}
```

### 2. Gas Estimation

Provide gas estimates for relayers:

```typescript
// In your documentation
export const ESTIMATED_GAS = {
  swap: 150_000n,
  swapAndStake: 250_000n,
};
```

### 3. Error Handling

Provide clear error messages:

```typescript
try {
  const action = buildYourProtocolAction(params);
  await action.validate?.();
} catch (error) {
  if (error.message.includes('liquidity')) {
    throw new Error('Insufficient liquidity in pool');
  }
  throw error;
}
```

### 4. Documentation

Document your integration:

```typescript
/**
 * Build a Uniswap V4 swap action for cross-chain execution
 * 
 * @param params - Swap parameters
 * @param params.poolKey - Uniswap pool configuration
 * @param params.amountSpecified - Amount to swap (in USDC)
 * @param params.recipient - Recipient of output tokens
 * @returns Action that can be executed via Pons
 * 
 * @example
 * ```typescript
 * const action = buildUniswapV4Swap({
 *   poolKey: { ... },
 *   amountSpecified: parseUnits('100', 6),
 *   recipient: '0x...',
 * });
 * ```
 */
export function buildUniswapV4Swap(params: UniswapV4SwapParams): IAction {
  // ...
}
```

## Publishing

### 1. Create NPM Package

```json
{
  "name": "@your-protocol/pons",
  "version": "1.0.0",
  "description": "Your Protocol integration for Pons",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@pons/sdk": "^0.1.0",
    "viem": "^2.0.0"
  }
}
```

### 2. Export TypeScript Types

```typescript
export type {
  YourProtocolParams,
  YourProtocolAction,
} from './types';

export {
  buildYourProtocolAction,
  ESTIMATED_GAS,
  PROTOCOL_ADDRESSES,
} from './action';
```

### 3. Publish

```bash
npm publish --access public
```

## Examples in the Wild

### Uniswap V4
```typescript
import { buildUniswapV4Swap } from '@uniswap/pons';
```

### Aave
```typescript
import { buildAaveSupply } from '@aave/pons';
```

### 1inch
```typescript
import { build1inchSwap } from '@1inch/pons';
```

## Support

- Join our Discord: https://discord.gg/pons
- Read the SDK docs: https://docs.pons.xyz
- See example integrations: https://github.com/pons-protocol/integrations

## License

MIT

