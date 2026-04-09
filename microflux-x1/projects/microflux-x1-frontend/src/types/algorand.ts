export interface AlgodConfig {
  network: string;
  server: string;
  port: string;
  token: string;
}

export interface Asset {
  assetId: number;
  amount: number;
  creator: string;
  frozen: boolean;
  decimals: number;
  name?: string;
  unitName?: string;
  url?: string;
}

export interface AccountInfo {
  address: string;
  balance: number;
  assets: Asset[];
  minBalance: number;
  appsLocalState: number[];
  appsTotalSchema: {
    numByteSlice: number;
    numUint: number;
  };
}

export interface SuggestedParams {
  flatFee: boolean;
  fee: number;
  firstRound: number;
  lastRound: number;
  genesisID: string;
  genesisHash: string;
}
