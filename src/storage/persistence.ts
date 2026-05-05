/**
 * IndexedDB 기반 진행상황 저장.
 * - 완료한 레벨 집합
 * - 마지막으로 연 레벨 id (이어하기)
 * - 뮤트 등 옵션
 *
 * IndexedDB가 없거나 손상되면 자동으로 in-memory fallback.
 * 모든 메서드는 Promise를 반환하므로 호출부는 동일하게 await 가능.
 */
const DB_NAME = "linegame";
const DB_VERSION = 1;
const STORE = "kv";

const KEY_COMPLETED = "completedLevels";
const KEY_LAST_LEVEL = "lastLevelId";
const KEY_MUTED = "muted";

export class Persistence {
  private db: IDBDatabase | null = null;
  private memory = new Map<string, unknown>();
  private usingMemory = false;

  async init(): Promise<void> {
    try {
      this.db = await this.openDb();
    } catch (err) {
      console.warn("IndexedDB unavailable, using memory fallback:", err);
      this.usingMemory = true;
    }
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("indexedDB not available"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => reject(req.error ?? new Error("idb open failed"));
      req.onblocked = (): void => reject(new Error("idb blocked"));
    });
  }

  private async get<T>(key: string): Promise<T | undefined> {
    if (this.usingMemory || !this.db) return this.memory.get(key) as T | undefined;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = (): void => resolve(req.result as T | undefined);
        req.onerror = (): void => reject(req.error);
      } catch (err) {
        // tx 생성 실패 등 → 메모리 fallback로 다운그레이드
        this.usingMemory = true;
        resolve(this.memory.get(key) as T | undefined);
        void err;
      }
    });
  }

  private async set(key: string, value: unknown): Promise<void> {
    this.memory.set(key, value); // 캐시 + fallback 일치
    if (this.usingMemory || !this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE, "readwrite");
        const req = tx.objectStore(STORE).put(value, key);
        req.onsuccess = (): void => resolve();
        req.onerror = (): void => {
          // 쓰기 실패 — 메모리에 남기고 조용히 진행
          resolve();
        };
      } catch {
        this.usingMemory = true;
        resolve();
      }
    });
  }

  async getCompletedLevels(): Promise<Set<number>> {
    const arr = (await this.get<number[]>(KEY_COMPLETED)) ?? [];
    return new Set(arr);
  }

  async markCompleted(levelId: number): Promise<void> {
    const set = await this.getCompletedLevels();
    set.add(levelId);
    await this.set(KEY_COMPLETED, Array.from(set).sort((a, b) => a - b));
  }

  async getLastLevelId(): Promise<number | undefined> {
    return await this.get<number>(KEY_LAST_LEVEL);
  }

  async setLastLevelId(id: number): Promise<void> {
    await this.set(KEY_LAST_LEVEL, id);
  }

  async getMuted(): Promise<boolean | undefined> {
    return await this.get<boolean>(KEY_MUTED);
  }

  async setMuted(m: boolean): Promise<void> {
    await this.set(KEY_MUTED, m);
  }

  /** 테스트/디버그용: 메모리 fallback 강제 */
  forceMemory(): void {
    this.usingMemory = true;
  }

  isUsingMemory(): boolean {
    return this.usingMemory;
  }
}
