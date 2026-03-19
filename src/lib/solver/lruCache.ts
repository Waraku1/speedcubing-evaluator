/**
 * LRU Cache 実装
 *
 * 問題点: 設計書に LRUCache(500件, TTL 30分) と記載があるが、
 *         実装が存在するか不明確。テストで直接使うため確実に存在させる。
 *
 * 解決方針:
 *   - Doubly Linked List + Map で O(1) get/set/delete を実現
 *   - TTL オプション付き（省略可能）
 *   - TypeScript generics で型安全
 *   - Node.js 標準ライブラリのみ使用（外部依存なし）
 */

interface CacheEntry<V> {
  key: string
  value: V
  expiresAt: number | null  // null = TTL なし
  prev: CacheEntry<V> | null
  next: CacheEntry<V> | null
}

interface LRUCacheOptions {
  ttlMs?: number  // TTL（ミリ秒）。省略時は期限なし
}

export class LRUCache<K extends string, V> {
  private readonly capacity: number
  private readonly ttlMs: number | null
  private readonly map: Map<K, CacheEntry<V>>

  // 双方向リンクリストの番兵ノード（head = 最古, tail = 最新）
  private head: CacheEntry<V>  // dummy head (oldest side)
  private tail: CacheEntry<V>  // dummy tail (newest side)

  get size(): number {
    return this.map.size
  }

  constructor(capacity: number, options: LRUCacheOptions = {}) {
    if (capacity < 1) throw new Error('LRUCache: capacity must be >= 1')
    this.capacity = capacity
    this.ttlMs = options.ttlMs ?? null
    this.map = new Map()

    // 番兵ノード（実データを持たない）
    this.head = { key: '', value: undefined as unknown as V, expiresAt: null, prev: null, next: null }
    this.tail = { key: '', value: undefined as unknown as V, expiresAt: null, prev: null, next: null }
    this.head.next = this.tail
    this.tail.prev = this.head
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined

    // TTL チェック
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.removeEntry(entry)
      this.map.delete(key)
      return undefined
    }

    // MRU 側（tail 直前）に移動
    this.moveToTail(entry)
    return entry.value
  }

  set(key: K, value: V): void {
    // 既存キーの更新
    const existing = this.map.get(key)
    if (existing) {
      existing.value = value
      existing.expiresAt = this.ttlMs !== null ? Date.now() + this.ttlMs : null
      this.moveToTail(existing)
      return
    }

    // 容量超過時: LRU エントリ（head.next）を evict
    if (this.map.size >= this.capacity) {
      const lru = this.head.next!
      if (lru !== this.tail) {
        this.removeEntry(lru)
        this.map.delete(lru.key as K)
      }
    }

    // 新エントリを tail 直前に追加
    const entry: CacheEntry<V> = {
      key,
      value,
      expiresAt: this.ttlMs !== null ? Date.now() + this.ttlMs : null,
      prev: null,
      next: null,
    }
    this.insertBeforeTail(entry)
    this.map.set(key, entry)
  }

  delete(key: K): boolean {
    const entry = this.map.get(key)
    if (!entry) return false
    this.removeEntry(entry)
    this.map.delete(key)
    return true
  }

  clear(): void {
    this.map.clear()
    this.head.next = this.tail
    this.tail.prev = this.head
  }

  has(key: K): boolean {
    const entry = this.map.get(key)
    if (!entry) return false
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.removeEntry(entry)
      this.map.delete(key)
      return false
    }
    return true
  }

  // ── リンクリスト操作（private） ───────────────────────────────────────

  private removeEntry(entry: CacheEntry<V>): void {
    const prev = entry.prev!
    const next = entry.next!
    prev.next = next
    next.prev = prev
    entry.prev = null
    entry.next = null
  }

  private insertBeforeTail(entry: CacheEntry<V>): void {
    const prev = this.tail.prev!
    prev.next = entry
    entry.prev = prev
    entry.next = this.tail
    this.tail.prev = entry
  }

  private moveToTail(entry: CacheEntry<V>): void {
    this.removeEntry(entry)
    this.insertBeforeTail(entry)
  }
}
