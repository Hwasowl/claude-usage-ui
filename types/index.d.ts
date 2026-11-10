export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Usage = { contextPercent?: number; contextTokens?: number; contextMax?: number; rateLimits: Limit[] }
// 막대별 색 기준(%): warn 이상 주황, err 이상 빨강
export type Level = { warn: number; err: number }
export type Levels = { five: Level; week: Level; ctx: Level }
// 배너 아래 띄우는 백그라운드 서브에이전트 한 줄
// startedAt: 목록에 처음 보인 시각(ms). 엔진이 시작 시각을 주지 않아서 직접 기록
export type Bg = { id: string; description: string; type: string; status: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage | null; isOn: boolean; ctxOpen: boolean; agents: Bg[]; bgOpen: boolean; now: number; compactQueued: boolean }
  }
}
