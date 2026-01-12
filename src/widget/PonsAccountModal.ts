
import { truncateAddress } from '../utils/helpers.js';
import { getWidgetStyles } from './styles.js';

export class PonsAccountModal extends HTMLElement {
    private shadow: ShadowRoot;
    private isOpen: boolean = false;

    static get observedAttributes(): string[] {
        return ['wallet-address', 'smart-account-address', 'smart-account-deployed', 'theme'];
    }

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
    }

    connectedCallback(): void {
        this.render();
        this.attachEventListeners();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    get walletAddress(): string {
        return this.getAttribute('wallet-address') || '';
    }

    get smartAccountAddress(): string {
        return this.getAttribute('smart-account-address') || '';
    }

    get smartAccountDeployed(): boolean {
        return this.getAttribute('smart-account-deployed') === 'true';
    }

    get theme(): 'light' | 'dark' {
        return (this.getAttribute('theme') || 'dark') as 'light' | 'dark';
    }

    open(): void {
        this.isOpen = true;
        this.render();
    }

    close(): void {
        this.isOpen = false;
        this.render();
    }

    private render(): void {
        const styles = getWidgetStyles(this.theme);

        // Icons
        const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const extLinkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

        // INTERNAL STATE for Tabs (simple implementation via dataset or class property if we want persistence)
        // For simplicity, we'll read from a private property or default to 'info'
        // Since render is called often, we need to preserve state.
        // We'll trust `this.activeTab` property.

        this.shadow.innerHTML = `
      <style>${styles}</style>
      <div class="modal-overlay ${this.isOpen ? 'open' : ''}">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">Account</div>
            <button class="close-btn">×</button>
          </div>

          <!-- Tabs -->
          <div class="tabs">
            <button class="tab-btn ${this.activeTab === 'info' ? 'active' : ''}" data-tab="info">Assets & Info</button>
            <button class="tab-btn ${this.activeTab === 'transfer' ? 'active' : ''}" data-tab="transfer">Transfer</button>
          </div>

          <!-- INFO TAB -->
          <div class="tab-content" style="display: ${this.activeTab === 'info' ? 'block' : 'none'}">
              <!-- EOA Section -->
              <div class="account-section">
                <div class="section-label">
                  <span>EOA Wallet (Sepolia)</span>
                </div>
                <div class="address-display">
                  <span>${this.walletAddress ? truncateAddress(this.walletAddress) : 'Not Connected'}</span>
                  <div class="actions">
                    <span class="copy-icon" data-copy="${this.walletAddress}">${copyIcon}</span>
                  </div>
                </div>
                 ${this.walletAddress ? `
                <div style="margin-top: 8px; font-size: 12px;">
                    <a href="https://sepolia.etherscan.io/address/${this.walletAddress}" target="_blank" style="color: inherit; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                        View on Explorer ${extLinkIcon}
                    </a>
                </div>` : ''}
              </div>

              <!-- Smart Account Section -->
              <div class="account-section">
                <div class="section-label">
                  <span>Smart Account (Arc)</span>
                  ${!this.smartAccountDeployed ? '<span style="color: #f59e0b;">Predicted</span>' : '<span style="color: #10b981;">Deployed</span>'}
                </div>
                <div class="address-display">
                  <span>${this.smartAccountAddress ? truncateAddress(this.smartAccountAddress) : '...'}</span>
                  <div class="actions">
                    <span class="copy-icon" data-copy="${this.smartAccountAddress}">${copyIcon}</span>
                  </div>
                </div>
                ${this.smartAccountAddress ? `
                <div style="margin-top: 8px; font-size: 12px; display: flex; justify-content: space-between;">
                    <a href="https://0x815.blockscout.com/address/${this.smartAccountAddress}" target="_blank" style="color: inherit; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                        View on Explorer ${extLinkIcon}
                    </a>
                    ${!this.smartAccountDeployed ? '<span style="font-style: italic; opacity: 0.7;">Deploys on first txn</span>' : ''}
                </div>` : ''}
              </div>
          </div>

          <!-- TRANSFER TAB -->
          <div class="tab-content" style="display: ${this.activeTab === 'transfer' ? 'block' : 'none'}">
            <div class="form-group">
                <label class="form-label">Recipient Address</label>
                <input type="text" class="form-input" id="recipient" placeholder="0x..." />
            </div>

            <div class="form-group">
                <label class="form-label">Amount</label>
                <div class="input-row">
                    <input type="number" class="amount-input" id="amount" placeholder="0.00" step="0.000001" />
                    <select class="token-select" id="token">
                        <option value="USDC">USDC (Arc)</option>
                        <option value="NATIVE">ARC (Native)</option>
                    </select>
                </div>
            </div>

            <button class="transfer-btn" id="send-btn">Send Transaction</button>
            <div id="transfer-status" style="margin-top: 12px; font-size: 12px; text-align: center; display: none;"></div>
          </div>

          <div style="margin-top: 16px; text-align: center;">
            <button class="close-btn-lg" style="background:none; border:none; color: inherit; cursor: pointer; text-decoration:underline; font-size: 12px;">Close Modal</button>
          </div>
        </div>
      </div>
    `;

        this.attachEventListeners();
    }

    // Add activeTab property
    private activeTab: 'info' | 'transfer' = 'info';

    private attachEventListeners(): void {
        const closeBtns = this.shadow.querySelectorAll('.close-btn, .close-btn-lg, .modal-overlay');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('close-btn-lg')) {
                    this.close();
                }
            });
        });

        // Prevent closing when clicking content
        this.shadow.querySelector('.modal-content')?.addEventListener('click', (e) => e.stopPropagation());

        // Copy buttons
        this.shadow.querySelectorAll('.copy-icon').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const addr = (e.currentTarget as HTMLElement).getAttribute('data-copy');
                if (addr) {
                    await navigator.clipboard.writeText(addr);
                    // Could show tooltip here
                }
            });
        });

        // Tab Switching
        this.shadow.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as 'info' | 'transfer';
                this.activeTab = tab;
                this.render();
            });
        });

        // Transfer Action
        const sendBtn = this.shadow.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                const recipient = (this.shadow.getElementById('recipient') as HTMLInputElement).value;
                const amount = (this.shadow.getElementById('amount') as HTMLInputElement).value;
                const token = (this.shadow.getElementById('token') as HTMLSelectElement).value;

                if (!recipient || !amount) return;

                // Dispatch Custom Event
                this.dispatchEvent(new CustomEvent('pons-transfer-request', {
                    detail: {
                        recipient,
                        amount,
                        tokenType: token // 'USDC' or 'NATIVE'
                    },
                    bubbles: true,
                    composed: true
                }));

                // Show loading state (optimistic)
                const statusEl = this.shadow.getElementById('transfer-status');
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.innerText = 'Requesting transfer... check your wallet.';
                    statusEl.style.color = '#eab308'; // yellow
                }
            });
        }
    }

    static register(tagName = 'pons-account-modal'): void {
        if (!customElements.get(tagName)) {
            customElements.define(tagName, PonsAccountModal);
        }
    }
}

if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
    PonsAccountModal.register();
}
