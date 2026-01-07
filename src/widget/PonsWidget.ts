/**
 * Pons Network Web Component Widget
 * 
 * A standalone Web Component that dApps can embed to enable cross-chain transfers
 * via the Pons Network. Works with any framework (React, Vue, Angular, vanilla JS).
 * 
 * @example HTML
 * ```html
 * <script type="module" src="https://cdn.pons.sh/widget.js"></script>
 * <pons-widget 
 *   from="sepolia" 
 *   to="arc-testnet"
 *   theme="dark"
 * ></pons-widget>
 * ```
 * 
 * @example JavaScript
 * ```js
 * import { PonsWidget } from '@pons-network/pons.js/widget';
 * 
 * // Register the custom element
 * PonsWidget.register();
 * 
 * // Or create programmatically
 * const widget = document.createElement('pons-widget');
 * widget.setAttribute('from', 'sepolia');
 * widget.setAttribute('to', 'arc-testnet');
 * document.body.appendChild(widget);
 * ```
 */

import { PonsClient } from '../PonsClient.js';
import { Chain } from '../config/chains.js';
import { formatUSDC, parseUSDC, truncateAddress } from '../utils/helpers.js';
import type { ChainName } from '../config/chains.js';
import { getWidgetStyles, getWidgetHTML } from './styles.js';

// Widget state
interface WidgetState {
  connected: boolean;
  walletAddress: string | null;
  smartAccountAddress: string | null;
  sourceBalance: bigint;
  destBalance: bigint;
  amount: string;
  loading: boolean;
  error: string | null;
  txHash: string | null;
  status: 'idle' | 'connecting' | 'approving' | 'burning' | 'waiting' | 'complete' | 'error';
}

export class PonsWidget extends HTMLElement {
  private shadow: ShadowRoot;
  private state: WidgetState;
  private ponsClient: PonsClient | null = null;
  private walletClient: any = null;

  // Observed attributes
  static get observedAttributes(): string[] {
    return ['from', 'to', 'theme', 'gateway-url', 'source-rpc', 'dest-rpc'];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.state = {
      connected: false,
      walletAddress: null,
      smartAccountAddress: null,
      sourceBalance: 0n,
      destBalance: 0n,
      amount: '',
      loading: false,
      error: null,
      txHash: null,
      status: 'idle',
    };
  }

  // Getters for attributes
  get fromChain(): ChainName {
    return (this.getAttribute('from') || 'sepolia') as ChainName;
  }

  get toChain(): ChainName {
    return (this.getAttribute('to') || 'arc-testnet') as ChainName;
  }

  get theme(): 'light' | 'dark' {
    return (this.getAttribute('theme') || 'dark') as 'light' | 'dark';
  }

  get gatewayUrl(): string | undefined {
    return this.getAttribute('gateway-url') || undefined;
  }

  get sourceRpc(): string | undefined {
    return this.getAttribute('source-rpc') || undefined;
  }

  get destRpc(): string | undefined {
    return this.getAttribute('dest-rpc') || undefined;
  }

  /**
   * Register the custom element
   */
  static register(tagName = 'pons-widget'): void {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, PonsWidget);
    }
  }

  /**
   * Lifecycle: connected to DOM
   */
  connectedCallback(): void {
    this.render();
    this.attachEventListeners();
  }

  /**
   * Lifecycle: attribute changed
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  /**
   * Render the widget
   */
  private render(): void {
    const styles = getWidgetStyles(this.theme);
    const html = getWidgetHTML(this.state, {
      fromChain: this.fromChain,
      toChain: this.toChain,
      formatUSDC,
      truncateAddress,
    });

    this.shadow.innerHTML = `<style>${styles}</style>${html}`;
    this.attachEventListeners();
  }

  /**
   * Update state and re-render
   */
  private setState(updates: Partial<WidgetState>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  /**
   * Attach event listeners to shadow DOM elements
   */
  private attachEventListeners(): void {
    // Connect button
    const connectBtn = this.shadow.querySelector('.connect-btn');
    connectBtn?.addEventListener('click', () => this.handleConnect());

    // Amount input
    const amountInput = this.shadow.querySelector('.amount-input') as HTMLInputElement;
    amountInput?.addEventListener('input', (e) => {
      this.state.amount = (e.target as HTMLInputElement).value;
    });

    // Transfer button
    const transferBtn = this.shadow.querySelector('.transfer-btn');
    transferBtn?.addEventListener('click', () => this.handleTransfer());

    // Max button
    const maxBtn = this.shadow.querySelector('.max-btn');
    maxBtn?.addEventListener('click', () => this.handleMax());
  }

  /**
   * Handle wallet connection
   */
  private async handleConnect(): Promise<void> {
    this.setState({ status: 'connecting', error: null });

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
      }

      // Request accounts
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      // Import viem dynamically to keep bundle size small
      const { createWalletClient, createPublicClient, http, custom } = await import('viem');
      const { sepolia } = await import('viem/chains');

      this.walletClient = createWalletClient({
        account: walletAddress,
        chain: sepolia,
        transport: custom(ethereum),
      });

      // Initialize Pons client
      const sourceChain = this.fromChain === 'sepolia' ? Chain.SEPOLIA :
                          this.fromChain === 'arc-testnet' ? Chain.ARC_TESTNET :
                          this.fromChain === 'ethereum' ? Chain.ETHEREUM : Chain.SEPOLIA;

      const destChain = this.toChain === 'arc-testnet' ? Chain.ARC_TESTNET :
                        this.toChain === 'sepolia' ? Chain.SEPOLIA :
                        this.toChain === 'ethereum' ? Chain.ETHEREUM : Chain.ARC_TESTNET;

      // Get RPC URLs from SDK or attributes
      const { getChain } = await import('../config/chains.js');
      const sourceConfig = getChain(sourceChain);
      const destConfig = getChain(destChain);

      this.ponsClient = await PonsClient.create({
        from: sourceChain,
        to: destChain,
        sourceRpcUrl: this.sourceRpc || sourceConfig?.rpcUrl || '',
        destinationRpcUrl: this.destRpc || destConfig?.rpcUrl || '',
        gatewayUrl: this.gatewayUrl,
      });

      // Get smart account address
      const smartAccountAddress = await this.ponsClient.calculateSmartAccountAddress(walletAddress as `0x${string}`, 0n);

      this.setState({
        connected: true,
        walletAddress,
        smartAccountAddress,
        status: 'idle',
      });

      // Fetch balances
      await this.fetchBalances();

      // Emit connected event
      this.dispatchEvent(new CustomEvent('pons-connected', {
        detail: { walletAddress, smartAccountAddress },
        bubbles: true,
        composed: true,
      }));

    } catch (error: any) {
      this.setState({
        status: 'error',
        error: error.message || 'Failed to connect wallet',
      });
    }
  }

  /**
   * Fetch balances
   */
  private async fetchBalances(): Promise<void> {
    if (!this.ponsClient || !this.state.walletAddress) return;

    try {
      const { createPublicClient, http } = await import('viem');
      const { getChain } = await import('../config/chains.js');

      const sourceConfig = getChain(this.fromChain as ChainName);
      const destConfig = getChain(this.toChain as ChainName);

      if (!sourceConfig || !destConfig) return;

      // Source chain balance (user's EOA)
      const sourceClient = createPublicClient({
        transport: http(this.sourceRpc || sourceConfig.rpcUrl),
      });

      const sourceBalance = await sourceClient.readContract({
        address: sourceConfig.usdc as `0x${string}`,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
        functionName: 'balanceOf',
        args: [this.state.walletAddress as `0x${string}`],
      });

      // Destination chain balance (smart account)
      const destClient = createPublicClient({
        transport: http(this.destRpc || destConfig.rpcUrl),
      });

      const destBalance = await destClient.readContract({
        address: destConfig.usdc as `0x${string}`,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
        functionName: 'balanceOf',
        args: [this.state.smartAccountAddress as `0x${string}`],
      });

      this.setState({
        sourceBalance: sourceBalance as bigint,
        destBalance: destBalance as bigint,
      });

    } catch (error) {
      console.error('Failed to fetch balances:', error);
    }
  }

  /**
   * Handle max button
   */
  private handleMax(): void {
    if (this.state.sourceBalance > 0n) {
      this.state.amount = formatUSDC(this.state.sourceBalance);
      this.render();
    }
  }

  /**
   * Handle transfer
   */
  private async handleTransfer(): Promise<void> {
    if (!this.ponsClient || !this.walletClient || !this.state.amount) {
      return;
    }

    this.setState({ status: 'burning', error: null, txHash: null });

    try {
      const amount = parseUSDC(this.state.amount);

      // Get destination chain config to get USDC address for fees
      const { getChain } = await import('../config/chains.js');
      const destConfig = getChain(this.toChain as ChainName);

      if (!destConfig) {
        throw new Error(`Unknown destination chain: ${this.toChain}`);
      }

      // Execute transfer through Pons
      // ActionOptions only needs feeConfig - the rest is built by ActionBuilder
      const result = await this.ponsClient.execute({
        amount,
        action: {
          // Simple transfer - empty targets = just receive USDC
          targets: [],
          callDatas: [],
          values: [],
          feeConfig: {
            paymentToken: destConfig.usdc as `0x${string}`,
            indexerFee: 200000n, // 0.2 USDC
            resolverFee: 100000n, // 0.1 USDC
          },
        },
      }, this.walletClient);

      this.setState({
        status: 'waiting',
        txHash: result.txHash,
      });

      // Emit transfer started event
      this.dispatchEvent(new CustomEvent('pons-transfer-started', {
        detail: { txHash: result.txHash, amount: this.state.amount },
        bubbles: true,
        composed: true,
      }));

      // Wait for completion (simplified - in production use TransferTracker)
      this.setState({ status: 'complete' });

      // Emit transfer complete event
      this.dispatchEvent(new CustomEvent('pons-transfer-complete', {
        detail: { txHash: result.txHash },
        bubbles: true,
        composed: true,
      }));

      // Refresh balances
      await this.fetchBalances();

    } catch (error: any) {
      this.setState({
        status: 'error',
        error: error.message || 'Transfer failed',
      });

      this.dispatchEvent(new CustomEvent('pons-transfer-error', {
        detail: { error: error.message },
        bubbles: true,
        composed: true,
      }));
    }
  }
}

// Auto-register if in browser
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  PonsWidget.register();
}
