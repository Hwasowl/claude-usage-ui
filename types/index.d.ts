export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Usage = { contextPercent?: number; rateLimits: Limit[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage | null; isOn: boolean }
  }
}
