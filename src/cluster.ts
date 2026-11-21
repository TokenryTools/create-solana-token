// RPC connections, a check that the endpoint really is the cluster you asked
// for, and explorer links.
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

export type Cluster = 'devnet' | 'mainnet';

const CLUSTERS = {
  devnet: {
    rpc: 'https://api.devnet.solana.com',
    genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  },
  mainnet: {
    rpc: 'https://api.mainnet.solana.com',
    genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  },
} as const;

export function connect(cluster: Cluster) {
  const rpcUrl = process.env.RPC_URL || CLUSTERS[cluster].rpc;
  // Most providers serve WebSockets on the same host: https -> wss, http -> ws.
  const wsUrl = process.env.RPC_WS_URL || rpcUrl.replace(/^http/, 'ws');
  return {
    rpcUrl,
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
  };
}

/** Refuses to continue when RPC_URL points at a different cluster than the flags say. */
export async function assertCluster(rpc: ReturnType<typeof connect>['rpc'], cluster: Cluster) {
  const genesisHash = await rpc.getGenesisHash().send();
  if (genesisHash !== CLUSTERS[cluster].genesisHash) {
    const other = cluster === 'mainnet' ? 'devnet' : 'mainnet';
    const hint = genesisHash === CLUSTERS[other].genesisHash ? ` It is ${other}.` : '';
    throw new Error(
      `The RPC endpoint is not ${cluster} (genesis hash ${genesisHash}).${hint} ` +
        (cluster === 'devnet' ? 'Pass --mainnet to use mainnet on purpose.' : 'Fix RPC_URL.'),
    );
  }
}

function clusterQuery(cluster: Cluster) {
  return cluster === 'mainnet' ? '' : '?cluster=devnet';
}

export function explorerTx(signature: string, cluster: Cluster) {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery(cluster)}`;
}

export function explorerAddress(address: string, cluster: Cluster) {
  return `https://explorer.solana.com/address/${address}${clusterQuery(cluster)}`;
}

export function solscanToken(address: string, cluster: Cluster) {
  return `https://solscan.io/token/${address}${clusterQuery(cluster)}`;
}
