/**
 * Pons Gateway Module
 * 
 * Client for communicating with Pons Gateway servers.
 * Default endpoint: https://gateway.pons.sh
 */

export { PonsGatewayClient } from './PonsGatewayClient.js';
export type {
  PonsGatewayClientConfig,
  AnnounceResponse,
  TransferStatusResponse,
  NodeInfoResponse,
  TransfersResponse,
} from './PonsGatewayClient.js';

