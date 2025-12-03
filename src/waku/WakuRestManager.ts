import { WAKU_CONFIG, getContentTopic, getPubsubTopic } from '../config/constants.js';
import type { TransferAnnouncement, MintCompleted, ActionExecuted } from '../types.js';

/**
 * WakuRestManager - Handles Waku communication via REST API
 * 
 * This is the default connection mode for Pons SDK.
 * It communicates with a Waku node's REST API instead of using direct peer connections.
 * 
 * Advantages:
 * - No WebSocket/libp2p complexity
 * - Works from any environment (browser, Node.js, serverless)
 * - No NAT traversal issues
 * - Simple HTTP calls
 */
export class WakuRestManager {
  private restUrl: string;
  private pubsubTopic: string;
  private contentTopicPrefix: string;
  private contentTopicSuffix: string;
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private subscriptionIds: Map<string, string> = new Map();

  constructor(
    restUrl: string = WAKU_CONFIG.DEFAULT_REST_URL,
    clusterId: number = WAKU_CONFIG.CLUSTER_ID,
    shard: number = WAKU_CONFIG.SHARD,
    contentTopicPrefix: string = WAKU_CONFIG.CONTENT_TOPIC_PREFIX,
    contentTopicSuffix: string = WAKU_CONFIG.CONTENT_TOPIC_SUFFIX
  ) {
    this.restUrl = restUrl.replace(/\/$/, ''); // Remove trailing slash
    this.pubsubTopic = getPubsubTopic(clusterId, shard);
    this.contentTopicPrefix = contentTopicPrefix;
    this.contentTopicSuffix = contentTopicSuffix;
  }

  /**
   * Get content topic for a destination chain
   */
  getContentTopic(destinationChainId: number): string {
    return getContentTopic(destinationChainId, this.contentTopicPrefix, this.contentTopicSuffix);
  }

  /**
   * Initialize the REST manager (check connection)
   */
  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.restUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      console.log('✅ Waku REST API connected:', this.restUrl);
    } catch (error) {
      console.warn('⚠️ Waku REST API health check failed, but continuing:', error);
      // Don't throw - allow SDK to work even if initial health check fails
    }
  }

  /**
   * Encode data to base64 (browser-compatible)
   */
  private encodePayload(data: any): string {
    const json = JSON.stringify(data);
    if (typeof btoa !== 'undefined') {
      // Browser
      return btoa(unescape(encodeURIComponent(json)));
    } else {
      // Node.js
      return Buffer.from(json, 'utf-8').toString('base64');
    }
  }

  /**
   * Decode base64 to data (browser-compatible)
   */
  private decodePayload(base64: string): any {
    let json: string;
    if (typeof atob !== 'undefined') {
      // Browser
      json = decodeURIComponent(escape(atob(base64)));
    } else {
      // Node.js
      json = Buffer.from(base64, 'base64').toString('utf-8');
    }
    return JSON.parse(json);
  }

  /**
   * Announce a transfer to the network via LightPush REST API
   * Includes retry logic for transient failures
   */
  async announceTransfer(data: TransferAnnouncement, destinationChainId: number): Promise<void> {
    const contentTopic = this.getContentTopic(destinationChainId);
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    // Convert Uint8Array hookData to base64 string for JSON serialization
    const serializableData = {
      ...data,
      hookData: this.uint8ArrayToBase64(data.hookData),
    };
    
    const payload = this.encodePayload(serializableData);
    const requestBody = JSON.stringify({
      pubsubTopic: this.pubsubTopic,
      message: {
        payload,
        contentTopic,
        timestamp: Date.now() * 1000000, // nanoseconds
      },
    });
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.restUrl}/lightpush/v1/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LightPush failed: ${response.status} - ${errorText}`);
        }

        console.log('📡 Transfer announced via REST API');
        console.log(`   Content Topic: ${contentTopic}`);
        console.log(`   Destination Chain: ${destinationChainId}`);
        if (attempt > 1) {
          console.log(`   ✓ Succeeded on attempt ${attempt}/${maxRetries}`);
        }
        return; // Success - exit the function
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`⚠️ Waku announcement attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries exhausted
    console.error('❌ Failed to announce transfer via REST after all retries:', lastError);
    throw lastError;
  }

  /**
   * Helper: Convert Uint8Array to base64
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
   * Helper: Convert base64 to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    if (typeof atob !== 'undefined') {
      // Browser
      const binary = atob(base64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        arr[i] = binary.charCodeAt(i);
      }
      return arr;
    } else {
      // Node.js
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
  }

  /**
   * Subscribe to a content topic and create a filter subscription
   */
  private async createFilterSubscription(contentTopic: string): Promise<string> {
    const requestId = `pons-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const response = await fetch(`${this.restUrl}/filter/v2/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          contentFilters: [contentTopic],
          pubsubTopic: this.pubsubTopic,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Filter subscription failed: ${response.status} - ${errorText}`);
      }

      return requestId;
    } catch (error) {
      console.error('Failed to create filter subscription:', error);
      throw error;
    }
  }

  /**
   * Poll for messages on a content topic
   */
  private async pollMessages(contentTopic: string): Promise<any[]> {
    try {
      const encodedTopic = encodeURIComponent(contentTopic);
      const response = await fetch(`${this.restUrl}/filter/v2/messages/${encodedTopic}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // No messages or subscription expired
          return [];
        }
        throw new Error(`Poll failed: ${response.status}`);
      }

      const messages = await response.json();
      return Array.isArray(messages) ? messages : [];
    } catch (error) {
      // Silently ignore poll errors to avoid spamming console
      return [];
    }
  }

  /**
   * Subscribe to transfer announcements (for resolvers/indexers)
   */
  async subscribeTransferAnnouncements(
    callback: (data: TransferAnnouncement) => void,
    destinationChainId: number
  ): Promise<() => void> {
    const contentTopic = this.getContentTopic(destinationChainId);
    const subscriptionKey = `transfers-${destinationChainId}`;

    try {
      // Create filter subscription
      const requestId = await this.createFilterSubscription(contentTopic);
      this.subscriptionIds.set(subscriptionKey, requestId);

      console.log(`📡 Subscribed to transfer announcements`);
      console.log(`   Content Topic: ${contentTopic}`);
      console.log(`   Destination Chain: ${destinationChainId}`);

      // Start polling
      const pollInterval = setInterval(async () => {
        const messages = await this.pollMessages(contentTopic);
        
        for (const msg of messages) {
          try {
            if (msg.payload) {
              const data = this.decodePayload(msg.payload);
              // Convert hookData back to Uint8Array
              if (data.hookData && typeof data.hookData === 'string') {
                data.hookData = this.base64ToUint8Array(data.hookData);
              }
              callback(data as TransferAnnouncement);
            }
          } catch (decodeError) {
            console.error('Failed to decode message:', decodeError);
          }
        }
      }, WAKU_CONFIG.POLL_INTERVAL);

      this.pollIntervals.set(subscriptionKey, pollInterval);

      // Return unsubscribe function
      return () => {
        const interval = this.pollIntervals.get(subscriptionKey);
        if (interval) {
          clearInterval(interval);
          this.pollIntervals.delete(subscriptionKey);
        }
        this.subscriptionIds.delete(subscriptionKey);
        console.log(`🛑 Unsubscribed from ${contentTopic}`);
      };
    } catch (error) {
      console.error('Failed to subscribe to transfer announcements:', error);
      return () => {}; // Return empty cleanup function
    }
  }

  /**
   * Subscribe to mint completed events
   */
  async subscribeMintEvents(
    callback: (data: MintCompleted) => void,
    destinationChainId: number
  ): Promise<() => void> {
    // For mint events, we use a different suffix
    const contentTopic = `${this.contentTopicPrefix}/${destinationChainId}/minted`;
    const subscriptionKey = `minted-${destinationChainId}`;

    try {
      const requestId = await this.createFilterSubscription(contentTopic);
      this.subscriptionIds.set(subscriptionKey, requestId);

      const pollInterval = setInterval(async () => {
        const messages = await this.pollMessages(contentTopic);
        
        for (const msg of messages) {
          try {
            if (msg.payload) {
              const data = this.decodePayload(msg.payload);
              if (data.hookData && typeof data.hookData === 'string') {
                data.hookData = this.base64ToUint8Array(data.hookData);
              }
              callback(data as MintCompleted);
            }
          } catch (decodeError) {
            console.error('Failed to decode mint event:', decodeError);
          }
        }
      }, WAKU_CONFIG.POLL_INTERVAL);

      this.pollIntervals.set(subscriptionKey, pollInterval);

      return () => {
        const interval = this.pollIntervals.get(subscriptionKey);
        if (interval) {
          clearInterval(interval);
          this.pollIntervals.delete(subscriptionKey);
        }
        this.subscriptionIds.delete(subscriptionKey);
      };
    } catch (error) {
      console.error('Failed to subscribe to mint events:', error);
      return () => {};
    }
  }

  /**
   * Subscribe to action executed events
   */
  async subscribeExecutionEvents(
    callback: (data: ActionExecuted) => void,
    destinationChainId: number
  ): Promise<() => void> {
    const contentTopic = `${this.contentTopicPrefix}/${destinationChainId}/executed`;
    const subscriptionKey = `executed-${destinationChainId}`;

    try {
      const requestId = await this.createFilterSubscription(contentTopic);
      this.subscriptionIds.set(subscriptionKey, requestId);

      const pollInterval = setInterval(async () => {
        const messages = await this.pollMessages(contentTopic);
        
        for (const msg of messages) {
          try {
            if (msg.payload) {
              const data = this.decodePayload(msg.payload);
              callback(data as ActionExecuted);
            }
          } catch (decodeError) {
            console.error('Failed to decode execution event:', decodeError);
          }
        }
      }, WAKU_CONFIG.POLL_INTERVAL);

      this.pollIntervals.set(subscriptionKey, pollInterval);

      return () => {
        const interval = this.pollIntervals.get(subscriptionKey);
        if (interval) {
          clearInterval(interval);
          this.pollIntervals.delete(subscriptionKey);
        }
        this.subscriptionIds.delete(subscriptionKey);
      };
    } catch (error) {
      console.error('Failed to subscribe to execution events:', error);
      return () => {};
    }
  }

  /**
   * Stop all subscriptions and cleanup
   */
  async stop(): Promise<void> {
    // Clear all polling intervals
    for (const [, interval] of this.pollIntervals) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();
    this.subscriptionIds.clear();
    
    console.log('🛑 Waku REST manager stopped');
  }

  /**
   * Check if connected (REST is always "connected" if URL is set)
   */
  isConnected(): boolean {
    return true; // REST API is stateless, always "connected"
  }

  /**
   * Get the REST URL
   */
  getRestUrl(): string {
    return this.restUrl;
  }
}

