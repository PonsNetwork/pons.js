import EventEmitter from 'eventemitter3';
import type { Address, Hex, PublicClient } from 'viem';
import { createPublicClient, http } from 'viem';
import { TransferStatus, type TransferStatusUpdate, type ChainConfig } from '../types.js';
import { DEFAULTS, CIRCLE_API, SMART_ACCOUNT_ABI } from '../config/constants.js';

/**
 * Transfer tracker - polls chain for transfer status
 */
export class TransferTracker extends EventEmitter {
  private status: TransferStatus = TransferStatus.INITIATED;
  private polling: boolean = false;
  private pollingInterval?: NodeJS.Timeout;
  private destinationClient: PublicClient;

  constructor(
    private sourceTxHash: Hex,
    private smartAccountAddress: Address,
    private nonce: bigint,
    private sourceChain: ChainConfig,
    private _destinationChain: ChainConfig
  ) {
    super();

    this.destinationClient = createPublicClient({
      transport: http(this._destinationChain.rpcUrl),
    });
  }

  /**
   * Start tracking the transfer
   */
  async start(): Promise<void> {
    if (this.polling) {
      return;
    }

    this.polling = true;
    this.emitStatus(TransferStatus.INITIATED);

    // Start chain polling
    this.startChainPolling();
  }

  /**
   * Stop tracking
   */
  stop(): void {
    this.polling = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  /**
   * Poll chain status
   */
  private startChainPolling(): void {
    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkChainStatus();
      } catch (error) {
        console.error('Error polling chain status:', error);
      }
    }, DEFAULTS.POLL_INTERVAL);

    // Also check immediately
    this.checkChainStatus();
  }

  /**
   * Check status on destination chain
   */
  private async checkChainStatus(): Promise<void> {
    if (!this.polling) {
      return;
    }

    try {
      // Check if we have attestation from Circle
      if (this.status === TransferStatus.INITIATED) {
        const hasAttestation = await this.checkAttestation();
        if (hasAttestation) {
          this.emitStatus(TransferStatus.ATTESTED);
          // After attestation, mark as announced (ready for indexers/resolvers)
          // In production, this would be set after confirming network broadcast
          setTimeout(() => {
            if (this.status === TransferStatus.ATTESTED) {
              this.emitStatus(TransferStatus.ANNOUNCED);
            }
          }, 1000);
        }
      }

      // Check if USDC was minted
      if (this.status === TransferStatus.ATTESTED || this.status === TransferStatus.ANNOUNCED) {
        const flow = await this.getCCTPFlow();
        
        if (flow && flow.amount > 0n) {
          this.emitStatus(TransferStatus.MINTED, {
            amount: flow.amount.toString(),
            indexer: flow.indexer,
          });
        }
      }

      // Check if action was executed
      if (this.status === TransferStatus.MINTED) {
        const flow = await this.getCCTPFlow();
        
        if (flow && flow.executed) {
          this.emitStatus(TransferStatus.EXECUTED, {
            executor: flow.executor,
          });
          this.stop(); // Stop polling once executed
        }
      }
    } catch (error) {
      console.error('Error checking chain status:', error);
    }
  }

  /**
   * Check Circle attestation status
   */
  private async checkAttestation(): Promise<boolean> {
    try {
      const apiUrl = this.sourceChain.id === 1 || this.sourceChain.id === 11155111 
        ? CIRCLE_API.testnet 
        : CIRCLE_API.testnet;

      const url = `${apiUrl}/messages/${this.sourceChain.domain}?transactionHash=${this.sourceTxHash}`;
      
      // Use Circle CCTP API v2 format: /v2/messages/{sourceDomainId}?transactionHash={txHash}
      const response = await fetch(url);

      // Log the response for debugging
      if (!response.ok) {
        if (response.status === 404) {
          // 404 is expected while waiting for attestation - transaction is still being processed
          console.log(`⏳ Waiting for Circle attestation (not yet available, will retry)...`);
        } else {
          console.warn(`⚠️  Circle API returned ${response.status}: ${response.statusText}`);
        }
        return false;
      }

      const data = await response.json();
      
      // Log the message status if available
      if (data.messages?.[0]) {
        const message = data.messages[0];
        console.log(`📋 Circle API response: status=${message.status}, has attestation=${!!message.attestation}`);
        
        if (message.status === 'complete' && message.attestation) {
          console.log('✅ Circle attestation received!');
          return true;
        } else if (message.status === 'pending') {
          console.log('⏳ Circle attestation pending...');
        } else {
          console.log(`⏳ Message status: ${message.status}`);
        }
      } else {
        console.log('⏳ No messages found yet, waiting...');
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error checking attestation:', error);
      return false;
    }
  }

  /**
   * Get CCTP flow from smart account
   */
  private async getCCTPFlow(): Promise<{
    indexer: Address;
    executor: Address;
    amount: bigint;
    messageHash: Hex;
    executed: boolean;
  } | null> {
    try {
      const flow = await this.destinationClient.readContract({
        address: this.smartAccountAddress,
        abi: SMART_ACCOUNT_ABI,
        functionName: 'getCCTPFlow',
        args: [this.nonce],
      });

      return flow as any;
    } catch (error) {
      return null;
    }
  }

  /**
   * Emit status update
   */
  private emitStatus(status: TransferStatus, metadata?: Record<string, any>): void {
    if (this.status === status) {
      return; // Don't emit duplicate status
    }

    this.status = status;

    const update: TransferStatusUpdate = {
      status,
      timestamp: Date.now(),
      txHash: this.sourceTxHash,
      metadata,
    };

    this.emit('statusChange', update);
    this.emit(status, update);
  }

  /**
   * Get current status
   */
  getCurrentStatus(): TransferStatus {
    return this.status;
  }

  /**
   * Wait for specific status
   */
  async waitForStatus(
    targetStatus: TransferStatus,
    timeout: number = DEFAULTS.ATTESTATION_TIMEOUT
  ): Promise<void> {
    if (this.status === targetStatus) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for status: ${targetStatus}`));
      }, timeout);

      const handler = (update: TransferStatusUpdate) => {
        if (update.status === targetStatus) {
          clearTimeout(timeoutId);
          this.off('statusChange', handler);
          resolve();
        }
      };

      this.on('statusChange', handler);
    });
  }
}

