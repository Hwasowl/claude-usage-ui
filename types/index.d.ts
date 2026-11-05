export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Usage = { contextPercent?: number; contextTokens?: number; contextMax?: number; rateLimits: Limit[] }
// 막대별 색 기준(%): warn 이상 주황, err 이상 빨강
export type Level = { warn: number; err: number }
export type Levels = { five: Level; week: Level; ctx: Level }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage | null; isOn: boolean; levels: Levels; settingsOpen: boolean }
  }
}
