import { TokenRegistryEntry, SOL_MINT } from '../types';

const STATIC_SEED: TokenRegistryEntry[] = [
  { ticker: 'SOL', mint: SOL_MINT, decimals: 9, name: 'Solana' },
  { ticker: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, name: 'USD Coin' },
  { ticker: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, name: 'Tether USD' },
  { ticker: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, name: 'Bonk' },
  { ticker: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, name: 'Jupiter' },
  { ticker: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, name: 'dogwifhat' },
  { ticker: 'PYTH', mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', decimals: 6, name: 'Pyth Network' },
  { ticker: 'JTO', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', decimals: 9, name: 'Jito' },
  { ticker: 'RAY', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6, name: 'Raydium' },
  { ticker: 'ORCA', mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', decimals: 6, name: 'Orca' },
  { ticker: 'MNDE', mint: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey', decimals: 9, name: 'Marinade' },
  { ticker: 'mSOL', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', decimals: 9, name: 'Marinade Staked SOL' },
  { ticker: 'stSOL', mint: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', decimals: 9, name: 'Lido Staked SOL' },
  { ticker: 'jitoSOL', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, name: 'Jito Staked SOL' },
  { ticker: 'RENDER', mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', decimals: 8, name: 'Render Token' },
  { ticker: 'HNT', mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', decimals: 8, name: 'Helium' },
  { ticker: 'TNSR', mint: 'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6', decimals: 9, name: 'Tensor' },
  { ticker: 'W', mint: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', decimals: 6, name: 'Wormhole' },
  { ticker: 'KMNO', mint: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', decimals: 6, name: 'Kamino' },
  { ticker: 'BSOL', mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', decimals: 9, name: 'BlazeStake Staked SOL' },
];

const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/all';
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export class TokenRegistry {
  private byTicker = new Map<string, TokenRegistryEntry[]>();
  private byMint = new Map<string, TokenRegistryEntry>();
  private lastRefresh = 0;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    for (const entry of STATIC_SEED) {
      this.addEntry(entry);
    }
  }

  private addEntry(entry: TokenRegistryEntry): void {
    if (this.byMint.has(entry.mint)) return;

    const ticker = entry.ticker.toUpperCase();
    this.byMint.set(entry.mint, entry);
    const existing = this.byTicker.get(ticker) || [];
    existing.push(entry);
    this.byTicker.set(ticker, existing);
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this._doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<void> {
    try {
      const res = await fetch(JUPITER_TOKEN_LIST_URL);
      if (!res.ok) return;

      const tokens = (await res.json()) as Array<{
        symbol: string;
        address: string;
        decimals: number;
        name: string;
      }>;

      for (const token of tokens) {
        this.addEntry({
          ticker: token.symbol.toUpperCase(),
          mint: token.address,
          decimals: token.decimals,
          name: token.name,
        });
      }

      this.lastRefresh = Date.now();
    } catch {
      // keep existing data
    }
  }

  needsRefresh(): boolean {
    return Date.now() - this.lastRefresh > REFRESH_INTERVAL_MS;
  }

  resolveByTicker(ticker: string): TokenRegistryEntry | null {
    const entries = this.byTicker.get(ticker.toUpperCase());
    if (!entries || entries.length === 0) return null;
    return entries.length === 1 ? entries[0] : null;
  }

  isAmbiguous(ticker: string): boolean {
    const entries = this.byTicker.get(ticker.toUpperCase());
    return !!entries && entries.length > 1;
  }

  get size(): number {
    return this.byMint.size;
  }
}
