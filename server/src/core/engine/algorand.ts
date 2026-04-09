import algosdk from 'algosdk';


// Use a public TestNet node for the hackathon
const ALGO_SERVER = "https://testnet-api.algonode.cloud";
const ALGO_PORT = "";
const ALGO_TOKEN = "";


export const algoClient = new algosdk.Algodv2(ALGO_TOKEN, ALGO_SERVER, ALGO_PORT);
export const indexerClient = new algosdk.Indexer(ALGO_TOKEN, "https://testnet-idx.algonode.cloud", ALGO_PORT);