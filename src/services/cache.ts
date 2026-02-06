interface CacheEntry<T> {
  value: T;
  expires_at: number;
}

export class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  constructor(private maxSize = 500) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires_at) {
      this.map.delete(key);
      return undefined;
    }

    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.map.delete(key);

    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }

    this.map.set(key, { value, expires_at: Date.now() + ttlMs });
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const LITE_TTL_MS = 5 * 60 * 1000;
export const PRO_TTL_MS = 60 * 1000;
