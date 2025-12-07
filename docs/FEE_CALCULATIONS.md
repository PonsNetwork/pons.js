# Pons Network Fee Calculations

Complete guide to understanding and calculating fees in Pons Network.

## Table of Contents

- [Fee Overview](#fee-overview)
- [Dynamic Fee Model](#dynamic-fee-model)
- [Fee Components](#fee-components)
- [Fee Calculation Functions](#fee-calculation-functions)
- [Speed vs Cost](#speed-vs-cost)
- [Fee Payment Order](#fee-payment-order)
- [Best Practices](#best-practices)

---

## Fee Overview

Pons Network uses **dynamic fees** - just like Ethereum gas! Pay more for faster execution, or save money with lower fees.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PONS NETWORK FEE BREAKDOWN                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User sends: 15.000000 USDC                                                 │
│       │                                                                     │
│       ├── Network Fee (~0.01%):   Cross-chain relay                        │
│       │                                                                     │
│       └── Expected Amount:        Arrives at Smart Account                 │
│               │                                                            │
│               ├── Protocol Fee:   Pons treasury                            │
│               ├── Indexer Fee:    Indexer operator (DYNAMIC)               │
│               ├── Relayer Fee:    Relayer operator (DYNAMIC)               │
│               │                                                            │
│               └── Amount for Action: Your action                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dynamic Fee Model

Fees in Pons Network work like **Ethereum gas**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DYNAMIC FEE MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ⚡ FAST (Higher fees)                                                      │
│     Pay above market rate → Operators prioritize your transaction          │
│     Example: indexerFee: 0.2 USDC, relayerFee: 0.3 USDC                   │
│     Estimated: ~5-10 minutes                                               │
│                                                                             │
│  🔄 STANDARD (Market rate)                                                  │
│     Pay market rate → Normal execution speed                               │
│     Example: indexerFee: 0.1 USDC, relayerFee: 0.15 USDC                  │
│     Estimated: ~15-20 minutes                                              │
│                                                                             │
│  🐢 ECONOMY (Lower fees)                                                    │
│     Pay below market rate → Slower execution, but cheaper                  │
│     Example: indexerFee: 0.05 USDC, relayerFee: 0.08 USDC                 │
│     Estimated: ~30+ minutes                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How Dynamic Fees Work

1. **Users set their own fees** - like setting gas price in Ethereum
2. **Operators compete** - they choose which transactions to process
3. **Higher fees = priority** - operators process profitable transactions first
4. **Market equilibrium** - supply/demand determines fair prices

---

## Fee Components

### 1. Network Fee (~0.01%)

**Purpose**: Cross-chain message relay
**Rate**: ~0.01% of send amount
**When**: During cross-chain transfer

```typescript
const networkFee = sendAmount * 0.0001;
const expectedAmount = sendAmount - networkFee;
```

### 2. Protocol Fee (~0.1%)

**Purpose**: Pons Network protocol treasury
**Rate**: ~0.1% of expected amount
**When**: Before action executes

```typescript
const protocolFee = expectedAmount * 0.001;
```

### 3. Indexer Fee (DYNAMIC)

**Purpose**: Reward for the indexer who indexes your message
**Amount**: Dynamic - YOU choose!
**When**: Before action executes
**Recipient**: Indexer operator (decentralized)

```typescript
// You set this - higher = faster processing
const indexerFee = parseUnits('0.1', 6);  // Standard
const indexerFee = parseUnits('0.2', 6);  // Fast
const indexerFee = parseUnits('0.05', 6); // Economy
```

### 4. Relayer Fee (DYNAMIC)

**Purpose**: Reward for the relayer who executes your action
**Amount**: Dynamic - YOU choose!
**When**: Before action executes
**Recipient**: Relayer operator (decentralized)

```typescript
// You set this - higher = faster execution
const relayerFee = parseUnits('0.15', 6); // Standard
const relayerFee = parseUnits('0.3', 6);  // Fast
const relayerFee = parseUnits('0.08', 6); // Economy
```

---

## Fee Calculation Functions

### `calculateFeesSync(sendAmount, options?)`

Calculate fees with custom fee rates.

```typescript
import { calculateFeesSync } from '@pons-network/sdk';
import { parseUnits, formatUnits } from 'viem';

// Standard fees
const standard = calculateFeesSync(parseUnits('15', 6));

// Fast fees (2x operator fees)
const fast = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.2', 6),
  relayerFee: parseUnits('0.3', 6),
});

// Economy fees (0.5x operator fees)
const economy = calculateFeesSync(parseUnits('15', 6), {
  indexerFee: parseUnits('0.05', 6),
  relayerFee: parseUnits('0.08', 6),
});

console.log('Standard:', formatUnits(standard.amountForAction, 6), 'USDC');
console.log('Fast:', formatUnits(fast.amountForAction, 6), 'USDC');
console.log('Economy:', formatUnits(economy.amountForAction, 6), 'USDC');
```

### `calculateBurnForAction(actionAmount, options?)`

Reverse calculation: Given how much you need for an action, calculate send amount.

```typescript
import { calculateBurnForAction } from '@pons-network/sdk';

// NFT costs 10 USDC - how much to send?
const fees = calculateBurnForAction(parseUnits('10', 6));
console.log('Send:', formatUnits(fees.burnAmount, 6), 'USDC');

// Same, but with fast execution
const fastFees = calculateBurnForAction(parseUnits('10', 6), {
  indexerFee: parseUnits('0.2', 6),
  relayerFee: parseUnits('0.3', 6),
});
console.log('Send (fast):', formatUnits(fastFees.burnAmount, 6), 'USDC');
```

### `validateActionFeasibility(sendAmount, actionCost, options?)`

Validate if send amount is sufficient.

```typescript
import { validateActionFeasibility } from '@pons-network/sdk';

const result = validateActionFeasibility(
  parseUnits('15', 6),  // User sends
  parseUnits('14', 6)   // Action needs
);

if (!result.feasible) {
  console.log(`Need at least ${formatUnits(result.minimumBurn, 6)} USDC`);
}
```

### `DEFAULT_FEES`

Default fee constants (standard market rate).

```typescript
import { DEFAULT_FEES } from '@pons-network/sdk';

DEFAULT_FEES.CCTP_FEE_BPS      // 1n (0.01%)
DEFAULT_FEES.PROTOCOL_FEE_BPS  // 10n (0.1%)
DEFAULT_FEES.INDEXER_FEE       // 100000n (0.1 USDC) - standard rate
DEFAULT_FEES.RELAYER_FEE       // 150000n (0.15 USDC) - standard rate
```

---

## Speed vs Cost

### Recommended Fee Levels

| Speed | Indexer Fee | Relayer Fee | Est. Time | Use Case |
|-------|------------|-------------|-----------|----------|
| ⚡ Fast | 0.2 USDC | 0.3 USDC | 5-10 min | Time-sensitive |
| 🔄 Standard | 0.1 USDC | 0.15 USDC | 15-20 min | Normal use |
| 🐢 Economy | 0.05 USDC | 0.08 USDC | 30+ min | Cost-sensitive |

### Implementation Example

```typescript
const SPEED_OPTIONS = {
  fast: {
    indexerFee: parseUnits('0.2', 6),
    relayerFee: parseUnits('0.3', 6),
    label: '⚡ Fast (~5-10 min)',
  },
  standard: {
    indexerFee: parseUnits('0.1', 6),
    relayerFee: parseUnits('0.15', 6),
    label: '🔄 Standard (~15-20 min)',
  },
  economy: {
    indexerFee: parseUnits('0.05', 6),
    relayerFee: parseUnits('0.08', 6),
    label: '🐢 Economy (~30+ min)',
  },
};

function getFees(amount: bigint, speed: 'fast' | 'standard' | 'economy') {
  return calculateFeesSync(amount, SPEED_OPTIONS[speed]);
}

// Let user choose
const userSpeed = 'fast';
const fees = getFees(parseUnits('15', 6), userSpeed);
```

### UI Component Example

```typescript
function SpeedSelector({ onChange }) {
  return (
    <select onChange={(e) => onChange(e.target.value)}>
      <option value="fast">⚡ Fast - Higher fees, ~5-10 min</option>
      <option value="standard">🔄 Standard - ~15-20 min</option>
      <option value="economy">🐢 Economy - Lower fees, ~30+ min</option>
    </select>
  );
}
```

---

## Fee Payment Order

All fees are paid **BEFORE** the action executes:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION ORDER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Message indexed on destination chain                       │
│                                                                 │
│  2. Fees paid FIRST:                                           │
│     ├── Protocol fee   → Pons treasury                         │
│     ├── Indexer fee    → Indexer operator                      │
│     └── Relayer fee    → Relayer operator                      │
│                                                                 │
│  3. YOUR ACTION EXECUTES                                        │
│     └── Uses remaining USDC freely                             │
│                                                                 │
│  4. Success! 🎉                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Best Practices

### 1. Let Users Choose Speed

```typescript
// Good - user has control
const fees = calculateFeesSync(amount, {
  indexerFee: userSelectedIndexerFee,
  relayerFee: userSelectedRelayerFee,
});

// Bad - hardcoded fees
const fees = calculateFeesSync(amount);
```

### 2. Show Fee Breakdown

```typescript
const fees = calculateFeesSync(parseUnits(userInput, 6), speedOptions);

// Show in UI:
// "You send: 15.00 USDC"
// "Operator fees: 0.25 USDC (fast)"
// "Available for action: 14.73 USDC"
// "Estimated time: ~5-10 minutes"
```

### 3. Validate Before Signing

```typescript
const validation = validateActionFeasibility(sendAmount, actionCost, speedOptions);

if (!validation.feasible) {
  throw new Error(`Need at least ${formatUnits(validation.minimumBurn, 6)} USDC`);
}
```

### 4. Explain Dynamic Fees to Users

```
"Pons Network uses dynamic fees like Ethereum gas:
- Pay more = faster execution (operators prioritize you)
- Pay less = slower execution (but saves money)
- You choose the tradeoff!"
```

---

## Fee Formula Reference

### Forward Calculation (send → action)

```
networkFee = sendAmount × 0.0001
expectedAmount = sendAmount - networkFee
protocolFee = expectedAmount × 0.001
totalOperatorFees = protocolFee + indexerFee + relayerFee
amountForAction = expectedAmount - totalOperatorFees
```

### Reverse Calculation (action → send)

```
baseNeeded = actionAmount + indexerFee + relayerFee
expectedAmount = baseNeeded × 10000 ÷ (10000 - protocolFeeBps)
sendAmount = expectedAmount × 10000 ÷ (10000 - networkFeeBps)
```

---

## Troubleshooting

### "Transaction taking too long"

**Cause**: Fees might be below market rate.

**Solution**: Use higher fees for faster execution, or wait longer.

### "SmartAccount: insufficient amount for fees"

**Cause**: Fees not properly accounted for.

**Solution**: Use SDK's `calculateFeesSync()` which includes all fees.

### "Operators not processing my transaction"

**Cause**: Fees too low for current market conditions.

**Solution**: Increase indexer and relayer fees.
