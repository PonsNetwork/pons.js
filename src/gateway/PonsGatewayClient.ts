import type { TransferAnnouncement } from '../types.js';

/**
 * Pons Gateway Client
 * 
 * Communicates with Pons Gateway servers (gateway.pons.sh or custom)
 * instead of raw Waku REST APIs. This provides:
 * 
 * - Simpler API
 * - Better error handling
 * - Connection pooling (Cloudflare)
 * - Rate limiting (Cloudflare)
 * - SSL termination (Cloudflare)
 * 
 * @example
 * const gateway = new PonsGatewayClient('https://gateway.pons.sh');
 * await gateway.announce(transferData, destinationChainId);
 * 
 * @example
 * // Custom gateway
 * const gateway = new PonsGatewayClient({
 *   url: 'https://my-gateway.example.com',
 *   timeout: 60000,
 * });
 */

export interface PonsGatewayClientConfig {
  /** Gateway endpoint URL */
  url: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Retry count for failed requests (default: 3) */
  retries?: number;
  /** Custom headers (e.g., API key) */
  headers?: Record<string, string>;
}

export interface AnnounceResponse {
  success: boolean;
  txHash: string;
  message: string;
}

export interface TransferStatusResponse {
  txHash: string;
  status: 'pending' | 'waiting_attestation' | 'minting' | 'executing' | 'completed' | 'failed';
  smartAccountAddress?: string;
  mintTxHash?: string;
  executeTxHash?: string;
  error?: string;
  timestamp: number;
}

export interface NodeInfoResponse {
  nodeId: string;
  version: string;
  uptime: number;
  supportedChains: number[];
  wakuConnected: boolean;
}

export interface TransfersResponse {
  transfers: TransferStatusResponse[];
  total: number;
}

export class PonsGatewayClient {
  private url: string;
  private timeout: number;
  private retries: number;
  private headers: Record<string, string>;
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: PonsGatewayClientConfig | string) {
    if (typeof config === 'string') {
      this.url = config.replace(/\/$/, '');
      this.timeout = 30000;
      this.retries = 3;
      this.headers = {};
    } else {
      this.url = config.url.replace(/\/$/, '');
      this.timeout = config.timeout ?? 30000;
      this.retries = config.retries ?? 3;
      this.headers = config.headers ?? {};
    }
  }

  /**
   * Initialize and verify connection
   */
  async initialize(): Promise<void> {
    try {
      const response = await this.request<{ status: string }>('GET', '/v1/health');
      if (response.status !== 'ok') {
        throw new Error('Health check failed');
      }
      console.log('✅ Pons Gateway connected:', this.url);
    } catch (error) {
      console.warn('⚠️ Pons Gateway health check failed:', error);
      // Don't throw - allow SDK to continue
    }
  }

  /**
   * Get node info
   */
  async getInfo(): Promise<NodeInfoResponse> {
    return this.request('GET', '/v1/info');
  }

  /**
   * Announce a transfer to the network
   */
  async announce(data: TransferAnnouncement, destinationChainId: number): Promise<AnnounceResponse> {
    // Convert Uint8Array to base64 for transport
    const payload = {
      ...data,
      hookData: this.uint8ArrayToBase64(data.hookData),
      destinationChainId,
    };

    return this.request('POST', '/v1/announce', payload);
  }

  /**
   * Get transfer status by source tx hash
   */
  async getStatus(txHash: string): Promise<TransferStatusResponse> {
    return this.request('GET', `/v1/status/${txHash}`);
  }

  /**
   * Query transfers with filters
   */
  async getTransfers(options?: {
    chainId?: number;
    status?: string;
    since?: number;
    limit?: number;
  }): Promise<TransfersResponse> {
    const params = new URLSearchParams();
    if (options?.chainId) params.set('chainId', String(options.chainId));
    if (options?.status) params.set('status', options.status);
    if (options?.since) params.set('since', String(options.since));
    if (options?.limit) params.set('limit', String(options.limit));
    
    const query = params.toString();
    return this.request('GET', `/v1/transfers${query ? `?${query}` : ''}`);
  }

  /**
   * Subscribe to transfer status updates (polling-based)
   */
  subscribeStatus(
    txHash: string,
    callback: (status: TransferStatusResponse) => void,
    pollInterval: number = 3000
  ): () => void {
    const key = `status-${txHash}`;
    
    const poll = async () => {
      try {
        const status = await this.getStatus(txHash);
        callback(status);
        
        // Stop polling if terminal state
        if (status.status === 'completed' || status.status === 'failed') {
          this.unsubscribe(key);
        }
      } catch (error) {
        // Ignore errors during polling
      }
    };

    // Initial poll
    poll();
    
    // Set up interval
    const interval = setInterval(poll, pollInterval);
    this.pollIntervals.set(key, interval);

    // Return unsubscribe function
    return () => this.unsubscribe(key);
  }

  /**
   * Subscribe to new transfer announcements for a chain
   */
  subscribeTransfers(
    destinationChainId: number,
    callback: (transfers: TransferStatusResponse[]) => void,
    pollInterval: number = 5000
  ): () => void {
    const key = `transfers-${destinationChainId}`;
    let lastTimestamp = Date.now();

    const poll = async () => {
      try {
        const result = await this.getTransfers({
          chainId: destinationChainId,
          since: lastTimestamp,
        });
        
        if (result.transfers.length > 0) {
          callback(result.transfers);
          lastTimestamp = Math.max(...result.transfers.map(t => t.timestamp));
        }
      } catch (error) {
        // Ignore errors during polling
      }
    };

    // Set up interval
    const interval = setInterval(poll, pollInterval);
    this.pollIntervals.set(key, interval);

    return () => this.unsubscribe(key);
  }

  /**
   * Unsubscribe from polling
   */
  private unsubscribe(key: string): void {
    const interval = this.pollIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(key);
    }
  }

  /**
   * Stop all subscriptions
   */
  async stop(): Promise<void> {
    for (const [key] of this.pollIntervals) {
      this.unsubscribe(key);
    }
    console.log('🛑 Pons Gateway client stopped');
  }

  /**
   * Make HTTP request with retries
   */
  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = `${this.url}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...this.headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.retries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  /**
   * Convert Uint8Array to base64
   */
  private uint8ArrayToBase64(arr: Uint8Array): string {
    if (typeof btoa !== 'undefined') {
      // Browser
      let binary = '';
      for (let i = 0; i < arr.length; i++) {
        binary += String.fromCharCode(arr[i]);
      }
      return btoa(binary);
    } else {
      // Node.js
      return Buffer.from(arr).toString('base64');
    }
  }

  /**
   * Get the Gateway URL
   */
  getUrl(): string {
    return this.url;
  }
}

