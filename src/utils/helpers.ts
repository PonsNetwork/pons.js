import type { Hex } from 'viem';
import { formatUnits, parseUnits } from 'viem';

/**
 * Format USDC amount (6 decimals) for display
 */
export function formatUSDC(amount: bigint): string {
  return formatUnits(amount, 6);
}

/**
 * Parse USDC amount from string
 */
export function parseUSDC(amount: string): bigint {
  return parseUnits(amount, 6);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 60000,
  interval: number = 1000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Calculate deadline timestamp (seconds)
 */
export function calculateDeadline(offsetSeconds: number = 86400): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSeconds);
}

/**
 * Check if deadline has passed
 */
export function isDeadlinePassed(deadline: bigint): boolean {
  return BigInt(Math.floor(Date.now() / 1000)) > deadline;
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(txHash: Hex, explorerUrl?: string): string {
  if (explorerUrl) {
    return `${explorerUrl}/tx/${txHash}`;
  }
  return txHash;
}

/**
 * Validate ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate transaction hash
 */
export function isValidTxHash(txHash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash);
}

/**
 * Parse multiaddr and convert to WebSocket format for browser usage
 * Converts /ip4/IP/tcp/PORT/p2p/PEER_ID to /ip4/IP/tcp/WS_PORT/ws/p2p/PEER_ID
 * 
 * @param multiaddr - Multiaddr string like /ip4/172.19.0.2/tcp/60000/p2p/16Uiu2HAm...
 * @param wsPort - WebSocket port (default: 8000)
 * @returns WebSocket-compatible multiaddr string
 */
export function convertMultiaddrToWebSocket(multiaddr: string, wsPort: number = 8000): string {
  // Parse the multiaddr components
  // Format: /ip4/IP/tcp/PORT/p2p/PEER_ID or /ip4/IP/tcp/PORT/ws/p2p/PEER_ID
  const parts = multiaddr.split('/').filter(Boolean);
  
  let ip: string | null = null;
  let port: number | null = null;
  let peerId: string | null = null;
  
  // Extract components
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'ip4' && i + 1 < parts.length) {
      ip = parts[i + 1];
    }
    if (parts[i] === 'tcp' && i + 1 < parts.length) {
      port = parseInt(parts[i + 1], 10);
    }
    if (parts[i] === 'p2p' && i + 1 < parts.length) {
      peerId = parts[i + 1];
    }
  }

  if (!ip) {
    throw new Error(`Invalid multiaddr format: could not extract IP address from ${multiaddr}`);
  }

  if (!peerId) {
    throw new Error(`Invalid multiaddr format: could not extract peer ID from ${multiaddr}`);
  }

  // Convert 0.0.0.0 to localhost for browser compatibility
  if (ip === '0.0.0.0') {
    ip = '127.0.0.1';
  }

  // Use provided wsPort or keep existing port
  const finalPort = wsPort || port || 8000;

  // Always construct proper WebSocket multiaddr: /ip4/IP/tcp/PORT/ws/p2p/PEER_ID
  return `/ip4/${ip}/tcp/${finalPort}/ws/p2p/${peerId}`;
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

