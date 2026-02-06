import { LRUCache, LITE_TTL_MS, PRO_TTL_MS } from '../../src/services/cache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3);
  });

  it('stores and retrieves values', () => {
    cache.set('a', 'hello', 60_000);
    expect(cache.get('a')).toBe('hello');
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts oldest entry when at capacity', () => {
    cache.set('a', '1', 60_000);
    cache.set('b', '2', 60_000);
    cache.set('c', '3', 60_000);
    cache.set('d', '4', 60_000); // evicts 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe('4');
  });

  it('moves accessed key to end (LRU behavior)', () => {
    cache.set('a', '1', 60_000);
    cache.set('b', '2', 60_000);
    cache.set('c', '3', 60_000);
    cache.get('a'); // touch 'a', so 'b' is now oldest
    cache.set('d', '4', 60_000); // evicts 'b'
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    cache.set('a', 'value', 100);

    jest.spyOn(Date, 'now').mockReturnValue(now + 101);
    expect(cache.get('a')).toBeUndefined();

    jest.restoreAllMocks();
  });

  it('reports correct size', () => {
    expect(cache.size).toBe(0);
    cache.set('a', '1', 60_000);
    cache.set('b', '2', 60_000);
    expect(cache.size).toBe(2);
  });

  it('clears all entries', () => {
    cache.set('a', '1', 60_000);
    cache.set('b', '2', 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('exports correct TTL constants', () => {
    expect(LITE_TTL_MS).toBe(300_000);
    expect(PRO_TTL_MS).toBe(60_000);
  });
});
