import algosdk from 'algosdk';

/** Strip invisible / stray chars from pasted addresses (common cause of isValidAddress false). */
export function normalizeAlgorandAddressInput(raw: unknown): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Zero-width joiners, word joiners, etc. (paste from PDF/slack can include these)
  s = s.replace(/\p{Cf}/gu, '');
  s = s.replace(/[\r\n\t]/g, '');
  s = s.replace(/\s+/g, '');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

// Use a public TestNet node for the hackathon
const ALGO_SERVER = "https://testnet-api.algonode.cloud";
const ALGO_PORT = "";
const ALGO_TOKEN = "";


export const algoClient = new algosdk.Algodv2(ALGO_TOKEN, ALGO_SERVER, ALGO_PORT);
export const indexerClient = new algosdk.Indexer(ALGO_TOKEN, "https://testnet-idx.algonode.cloud", ALGO_PORT);