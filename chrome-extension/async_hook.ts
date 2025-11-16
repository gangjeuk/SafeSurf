/**
 * Polyfill for AsyncLocalStorage
 * @see chrome-extension/vite.config.mts
 */
import 'zone.js';

type ZoneLike = {
  get(key: string): any;
  fork(spec: { name?: string; properties?: Record<string, any> }): ZoneLike;
  run<T>(callback: (...args: any[]) => T, applyThis?: any, applyArgs?: any[]): T;
};
declare const Zone: { current: ZoneLike };

export class AsyncLocalStorage<T> {
  private _key: string;
  private _disabled = false;

  constructor() {
    this._key = `ALS_${Math.random().toString(36).slice(2)}`;
  }

  disable(): void {
    this._disabled = true;
  }

  getStore(): T | undefined {
    return Zone.current.get(this._key) as T | undefined;
  }

  run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
    if (this._disabled) return callback(...args);
    const zone = Zone.current.fork({
      name: 'async-local-storage',
      properties: { [this._key]: store },
    });
    return zone.run(callback, undefined, args);
  }

  enterWith(store: T): void {
    if (this._disabled) return;
    Zone.current
      .fork({
        name: 'async-local-enter',
        properties: { [this._key]: store },
      })
      .run(() => void 0);
  }
}

export default { AsyncLocalStorage };
