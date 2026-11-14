export interface GasStorage { load(): unknown | null; save(state: unknown): void }
export interface Clock { Date: DateConstructor; set(at: string | number): void; advance(ms: number): void; reset(): void }
export interface Gas { clock: Clock; state: unknown; logs: string[]; globals: Record<string, unknown>; flush(): void }
export interface LoadedServer {
  Router: { handle(req: unknown): { ok: boolean; data?: unknown; error?: { code: string; message: string } } };
  setup(): string;
}
export function createClock(): Clock;
export function createGas(opts?: { storage?: GasStorage; clock?: Clock; log?: (...a: unknown[]) => void }): Gas;
export function loadServer(sources: { path: string; code: string }[], globals: Record<string, unknown>): LoadedServer;
