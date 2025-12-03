import { createLightNode, waitForRemotePeer, createEncoder, createDecoder, Protocols } from '@waku/sdk';
import type { LightNode } from '@waku/interfaces';
import { WAKU_CONFIG, getContentTopic } from '../config/constants.js';
import type { TransferAnnouncement, MintCompleted, ActionExecuted } from '../types.js';
import { convertMultiaddrToWebSocket, isBrowser } from '../utils/helpers.js';

/**
 * Simple protobuf encoder/decoder for Waku messages
 * Note: In production, use generated protobuf types from messages.proto
 */
class ProtobufCodec {
  static encodeTransferAnnouncement(data: TransferAnnouncement): Uint8Array {
    // Simple JSON encoding for now - replace with actual protobuf
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
  }

  static decodeTransferAnnouncement(data: Uint8Array): TransferAnnouncement {
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }

  static encodeMintCompleted(data: MintCompleted): Uint8Array {
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
  }

  static decodeMintCompleted(data: Uint8Array): MintCompleted {
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }

  static encodeActionExecuted(data: ActionExecuted): Uint8Array {
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
  }

  static decodeActionExecuted(data: Uint8Array): ActionExecuted {
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }
}

/**
 * Waku Manager - handles Waku node lifecycle and message publishing/subscription
 * 
 * This is the Waku peer mode for direct peer-to-peer communication.
 * Use this when you want decentralized message passing without a central relay.
 */
export class WakuManager {
  private node: LightNode | null = null;
  private isConnected: boolean = false;
  private subscriptions: Map<string, any> = new Map(); // Store decoders for unsubscribing
  private pubsubTopic: string;
  private contentTopicPrefix: string;
  private contentTopicSuffix: string;

  constructor(
    private bootstrapPeers?: string[],
    private localPeerAddress?: string,
    private wsPort: number = 8000,
    private clusterId: number = WAKU_CONFIG.CLUSTER_ID,
    private shard: number = WAKU_CONFIG.SHARD,
    contentTopicPrefix: string = WAKU_CONFIG.CONTENT_TOPIC_PREFIX,
    contentTopicSuffix: string = WAKU_CONFIG.CONTENT_TOPIC_SUFFIX
  ) {
    // Auto-generate pubsub topic from cluster and shard for static sharding
    this.pubsubTopic = `/waku/2/rs/${clusterId}/${shard}`;
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
   * Get routing info for encoder/decoder
   */
  private getRoutingInfo() {
    return {
      clusterId: this.clusterId,
      shardId: this.shard,
      pubsubTopic: this.pubsubTopic,
    };
  }

  /**
   * Initialize Waku node
   */
  async initialize(): Promise<void> {
    if (this.node) {
      return;
    }

    try {
      console.log('🚀 Initializing Waku node...');
      console.log('⚠️ Ignore WebSocket connection failures');
      console.log('⚠️ Waku tries to discover peers and some of them are expected to fail');
      
      // Prepare bootstrap peers
      let bootstrapPeersToUse: string[] | undefined = this.bootstrapPeers;
      
      // If local peer address is provided, convert it to WebSocket format for browser
      if (this.localPeerAddress) {
        if (isBrowser()) {
          // Convert multiaddr to WebSocket format for browser
          const wsMultiaddr = convertMultiaddrToWebSocket(this.localPeerAddress, this.wsPort);
          console.log(`🔌 Converting local peer to WebSocket format: ${this.localPeerAddress} -> ${wsMultiaddr}`);
          
          // Add to bootstrap peers
          bootstrapPeersToUse = [
            ...(this.bootstrapPeers || []),
            wsMultiaddr
          ];
        } else {
          // For Node.js, use the original multiaddr
          bootstrapPeersToUse = [
            ...(this.bootstrapPeers || []),
            this.localPeerAddress
          ];
        }
      }
      
      // Configure node with cluster settings
      const nodeConfig: any = {
        defaultBootstrap: !bootstrapPeersToUse || bootstrapPeersToUse.length === 0,
        bootstrapPeers: bootstrapPeersToUse,
      };

      // For custom clusters, use networkConfig with static sharding
      // Static sharding only needs clusterId, not shards array
      nodeConfig.networkConfig = {
        clusterId: this.clusterId,
      };
      
      console.log(`📡 Configuring custom cluster: ID=${this.clusterId}, Shard=${this.shard}, PubSub=${this.pubsubTopic}`);
      
      this.node = await createLightNode(nodeConfig);

      await this.node.start();
      
      // Wait for remote peers with longer timeout for protocol discovery
      // In browser environments, protocol discovery can take longer
      try {
        // Use waitForRemotePeer function (not node.waitForPeers method)
        // with a 90 second timeout to allow for slower WebSocket connections
        await waitForRemotePeer(this.node, [Protocols.LightPush, Protocols.Filter], 90000);
         
        this.isConnected = true;
        console.log('✅ Waku node connected to peers');
      } catch (peerError) {
        console.log('peerError', peerError);
        // If we can't connect to peers within timeout, continue anyway
        // The node is started and will keep trying to connect in the background
        console.warn('⚠️ Waku node started but no remote peers connected yet. Will continue trying in background.');
        this.isConnected = false; // Mark as not fully connected, but node is running
        // Don't throw - allow the node to keep running and try connecting later
      }
    } catch (error) {
      console.error('❌ Failed to initialize Waku node:', error);
      // Clean up on failure
      if (this.node) {
        try {
          await this.node.stop();
        } catch (stopError) {
          // Ignore stop errors
        }
        this.node = null;
      }
      throw error;
    }
  }

  /**
   * Try to connect to peers (can be called after initialization)
   */
  async tryConnectPeers(): Promise<void> {
    if (!this.node) {
      throw new Error('Waku node not initialized');
    }

    try {
      await Promise.race([
        waitForRemotePeer(this.node, [Protocols.LightPush, Protocols.Filter]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout waiting for remote peer')), 30000)
        )
      ]);
      this.isConnected = true;
      console.log('✅ Waku node connected to peers');
    } catch (error) {
      console.warn('⚠️ Still waiting for Waku peers...');
      // Don't throw - allow retries
    }
  }

  /**
   * Announce a transfer to the network
   */
  async announceTransfer(data: TransferAnnouncement, destinationChainId: number): Promise<void> {
    if (!this.node) {
      console.warn('⚠️ Waku node not initialized, skipping announcement');
      return;
    }

    if (!this.isConnected) {
      console.warn('⚠️ Waku not connected to peers, skipping announcement');
      return;
    }

    try {
      const contentTopic = this.getContentTopic(destinationChainId);
      
      const encoder = createEncoder({
        contentTopic,
        routingInfo: this.getRoutingInfo(),
      });

      const payload = ProtobufCodec.encodeTransferAnnouncement(data);

      await this.node.lightPush.send(encoder, { payload });
      
      console.log('📡 Transfer announced to Waku network');
      console.log(`   Content Topic: ${contentTopic}`);
      console.log(`   Destination Chain: ${destinationChainId}`);
    } catch (error) {
      console.error('❌ Failed to announce transfer:', error);
      // Don't throw - announcement is optional
    }
  }

  /**
   * Subscribe to mint completion events
   */
  async subscribeMintEvents(
    callback: (data: MintCompleted) => void,
    destinationChainId: number
  ): Promise<() => void> {
    if (!this.node) {
      console.warn('⚠️ Waku node not initialized, cannot subscribe to mint events');
      return () => {}; // Return empty cleanup function
    }

    if (!this.isConnected) {
      console.warn('⚠️ Waku not connected to peers, cannot subscribe to mint events');
      return () => {}; // Return empty cleanup function
    }

    const contentTopic = `${this.contentTopicPrefix}/${destinationChainId}/minted`;
    const decoder = createDecoder(contentTopic, this.getRoutingInfo());

    const wakuCallback = async (wakuMessage: any) => {
      if (!wakuMessage.payload) return;

      try {
        const data = ProtobufCodec.decodeMintCompleted(wakuMessage.payload);
        callback(data);
      } catch (error) {
        console.error('Failed to decode mint event:', error);
      }
    };

    // Use new Filter API: subscribe directly
    const success = await this.node.filter.subscribe([decoder], wakuCallback);
    
    if (!success) {
      console.error('Failed to subscribe to mint events');
      return () => {}; // Return empty cleanup function
    }

    // Store decoder for unsubscribing
    const subscriptionKey = `mint-${destinationChainId}`;
    this.subscriptions.set(subscriptionKey, decoder);
    
    return async () => {
      if (this.node) {
        await this.node.filter.unsubscribe([decoder]);
        this.subscriptions.delete(subscriptionKey);
      }
    };
  }

  /**
   * Subscribe to execution completion events
   */
  async subscribeExecutionEvents(
    callback: (data: ActionExecuted) => void,
    destinationChainId: number
  ): Promise<() => void> {
    if (!this.node) {
      console.warn('⚠️ Waku node not initialized, cannot subscribe to execution events');
      return () => {}; // Return empty cleanup function
    }

    if (!this.isConnected) {
      console.warn('⚠️ Waku not connected to peers, cannot subscribe to execution events');
      return () => {}; // Return empty cleanup function
    }

    const contentTopic = `${this.contentTopicPrefix}/${destinationChainId}/executed`;
    const decoder = createDecoder(contentTopic, this.getRoutingInfo());

    const wakuCallback = async (wakuMessage: any) => {
      if (!wakuMessage.payload) return;

      try {
        const data = ProtobufCodec.decodeActionExecuted(wakuMessage.payload);
        callback(data);
      } catch (error) {
        console.error('Failed to decode execution event:', error);
      }
    };

    // Use new Filter API: subscribe directly
    const success = await this.node.filter.subscribe([decoder], wakuCallback);
    
    if (!success) {
      console.error('Failed to subscribe to execution events');
      return () => {}; // Return empty cleanup function
    }

    // Store decoder for unsubscribing
    const subscriptionKey = `execution-${destinationChainId}`;
    this.subscriptions.set(subscriptionKey, decoder);
    
    return async () => {
      if (this.node) {
        await this.node.filter.unsubscribe([decoder]);
        this.subscriptions.delete(subscriptionKey);
      }
    };
  }

  /**
   * Subscribe to transfer announcements (for indexers/resolvers)
   */
  async subscribeTransferAnnouncements(
    callback: (data: TransferAnnouncement) => void,
    destinationChainId: number
  ): Promise<() => void> {
    if (!this.node) {
      console.warn('⚠️ Waku node not initialized, cannot subscribe to transfer announcements');
      return () => {}; // Return empty cleanup function
    }

    if (!this.isConnected) {
      console.warn('⚠️ Waku not connected to peers, cannot subscribe to transfer announcements');
      return () => {}; // Return empty cleanup function
    }

    const contentTopic = this.getContentTopic(destinationChainId);
    const decoder = createDecoder(contentTopic, this.getRoutingInfo());

    const wakuCallback = async (wakuMessage: any) => {
      if (!wakuMessage.payload) return;

      try {
        const data = ProtobufCodec.decodeTransferAnnouncement(wakuMessage.payload);
        callback(data);
      } catch (error) {
        console.error('Failed to decode transfer announcement:', error);
      }
    };

    // Use new Filter API: subscribe directly
    const success = await this.node.filter.subscribe([decoder], wakuCallback);
    
    if (!success) {
      console.error('Failed to subscribe to transfer announcements');
      return () => {}; // Return empty cleanup function
    }

    // Store decoder for unsubscribing
    const subscriptionKey = `transfers-${destinationChainId}`;
    this.subscriptions.set(subscriptionKey, decoder);
    
    console.log(`📡 Subscribed to transfer announcements`);
    console.log(`   Content Topic: ${contentTopic}`);
    console.log(`   Destination Chain: ${destinationChainId}`);
    
    return async () => {
      if (this.node) {
        await this.node.filter.unsubscribe([decoder]);
        this.subscriptions.delete(subscriptionKey);
      }
    };
  }

  /**
   * Stop Waku node and cleanup
   */
  async stop(): Promise<void> {
    // Cleanup all subscriptions using unsubscribeAll
    if (this.node && this.node.filter) {
      try {
        await this.node.filter.unsubscribeAll();
      } catch (error) {
        console.warn('Failed to unsubscribe from filter:', error);
      }
    }
    this.subscriptions.clear();

    if (this.node) {
      await this.node.stop();
      this.node = null;
      this.isConnected = false;
      console.log('🛑 Waku node stopped');
    }
  }

  /**
   * Check if connected
   */
  isNodeConnected(): boolean {
    return this.isConnected;
  }
}

