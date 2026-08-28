import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * A tiny atomic JSON store living in the OS user-data directory
 * (%APPDATA%\Codeling on Windows). Written via a temp file + rename so a crash
 * mid-write can never leave a half-serialised profile on disk — losing a
 * 40-day streak to a power cut is exactly the kind of thing that makes people
 * quit an app like this.
 */
export class JsonStore<T extends object> {
  private readonly file: string;
  private cache: T;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(filename: string, private readonly fallback: T) {
    this.file = join(app.getPath('userData'), filename);
    this.cache = this.read();
  }

  private read(): T {
    try {
      if (!existsSync(this.file)) return structuredClone(this.fallback);
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as T;
      return { ...structuredClone(this.fallback), ...parsed };
    } catch {
      // A corrupt file is kept aside rather than silently overwritten, so a
      // support conversation can still recover what was in it.
      try {
        if (existsSync(this.file)) renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      } catch {
        /* best effort */
      }
      return structuredClone(this.fallback);
    }
  }

  get(): T {
    return this.cache;
  }

  set(value: T): void {
    this.cache = value;
    this.scheduleFlush();
  }

  /** Coalesces bursts of writes (every answer touches the profile). */
  private scheduleFlush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), 250);
  }

  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] failed to persist', err);
    }
  }

  get path(): string {
    return this.file;
  }
}
