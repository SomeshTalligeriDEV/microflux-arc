import algosdk from 'algosdk';
import { getAlgodConfigFromViteEnvironment } from '../network/getAlgoClientConfigs';

let algodClient: algosdk.Algodv2 | null = null;
let indexerClient: algosdk.Indexer | null = null;

export function getAlgodClient(): algosdk.Algodv2 {
  if (algodClient) return algodClient;
  
  const config = getAlgodConfigFromViteEnvironment();
  
  // Convert token to string if needed (algosdk v3 expects specific types)
  const token = typeof config.token === 'string' ? config.token : '';
  
  algodClient = new algosdk.Algodv2(
    token,
    config.server,
    config.port
  );
  
  return algodClient;
}

export function getIndexerClient(): algosdk.Indexer {
  if (indexerClient) return indexerClient;
  
  // Indexer typically uses port 8980 for localnet, 443 for testnet/mainnet
  const config = getAlgodConfigFromViteEnvironment();
  const indexerPort = config.network === 'localnet' ? '8980' : '443';
  const indexerServer = config.server.replace(':4001', ':8980').replace(':443', '');
  
  // Convert token to string if needed
  const token = typeof config.token === 'string' ? config.token : '';
  
  indexerClient = new algosdk.Indexer(
    token,
    indexerServer,
    indexerPort
  );
  
  return indexerClient;
}

export function resetClients() {
  algodClient = null;
  indexerClient = null;
}
