import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage } from 'claude-code'

import type { Bg, Level, Levels, Limit, Usage } from '../types'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const isOn = atom({ plugin: 'usage-band', key: 'isOn' } as const, true)
const ctxOpen = atom({ plugin: 'usage-band', key: 'ctxOpen' } as const, false) // 컨텍스트 상세 펼침 여부
const agents = atom({ plugin: 'usage-band', key: 'agents' } as const, [] as Bg[]) // 돌고 있는 서브에이전트
const bgOpen = atom({ plugin: 'usage-band', key: 'bgOpen' } as const, false) // 서브에이전트 목록 펼침
const tick = atom({ plugin: 'usage-band', key: 'now' } as const, 0) // 실행 시간 표시용 시각, 목록이 있는 동안 1초마다 갱신
const compactQueued = atom({ plugin: 'usage-band', key: 'compactQueued' } as const, false) // 응답이 끝나면 압축할지

// 끝나지 않은 서브에이전트만 보여줌
const ACTIVE = ['pending', 'running', 'waiting']
const STATUS_KO: Record<string, string> = { pending: '대기', running: '실행 중', waiting: '기다리는 중' }
let poll: { cancel: () => void } | undefined
// 백그라운드로 돌린 셸 명령(Bash/PowerShell). 엔진에 목록 API가 없어서 시작은 도구 결과의 작업 id로,
// 끝은 완료 알림이나 TaskStop으로 직접 지움.
// shortcut: 모듈 변수라 /reload-plugins 하면 그 전에 시작한 셸은 목록에서 빠짐, 문제되면 $.state로 옮길 것
const shells = new Map<string, Bg>()
// 목록을 다시 읽어 상태에 넣음. 하나라도 돌고 있으면 1초마다 다시 읽고(실행 시간 갱신 겸), 다 끝나면 멈춤
// (끝남을 알려주는 이벤트가 따로 없어서 도는 동안만 짧게 확인)
const refreshAgents = async ($: EngineInterface) => {
  const list = await $.agent.list().catch(() => [])
  const t = await $.clock.now()
  const prev = await read($, agents)
  // 엔진이 시작 시각을 주지 않으므로 처음 보인 시각을 이어서 씀
  const since = (id: string) => prev.find(p => p.id === id)?.startedAt ?? t
  const v: Bg[] = list
    .filter(a => ACTIVE.includes(a.status))
    .map((a): Bg => ({ id: a.id, description: a.description || a.name || a.type, type: a.type, status: a.status, startedAt: since(a.id) }))
    .concat([...shells.values()])
  if (JSON.stringify(prev) !== JSON.stringify(v)) await update($, agents, () => v)
  if (v.length) await update($, tick, () => t)
  // 없다가 생기면 목록을 자동으로 펼치고, 다 끝나면 접음. 그 사이엔 목록 머리의 ▾/▴로 직접 접고 폄
  if (!prev.length && v.length) await update($, bgOpen, () => true)
  if (prev.length && !v.length) await update($, bgOpen, () => false)
  if (v.length && !poll) poll = $.clock.every(1000,() => void refreshAgents($))
  if (!v.length && poll) {
    poll.cancel()
    poll = undefined
  }
}

// 백그라운드 셸: 결과에 작업 id가 있으면 목록에 올림(Ctrl+B로 옮긴 것도 같은 id가 옴)
const trackShell = async ($: EngineInterface, e: any, next: (e: any) => Promise<any>) => {
  const r = await next(e)
  const id = r?.result?.backgroundTaskId
  if (typeof id === 'string') {
    shells.set(id, { id, description: e.description || e.command || id, type: 'shell', status: 'running', startedAt: await $.clock.now() })
    await refreshAgents($)
  }
  return r
}

// 막대 색 기준(고정): 이 % 이상이면 주황, 빨강. 5시간/주간 50/80, 컨텍스트 30/60
const LEVELS: Levels = { five: { warn: 50, err: 80 }, week: { warn: 50, err: 80 }, ctx: { warn: 30, err: 60 } }

// 실행 시간: 12초, 3분 05초, 1시간 02분
const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  if (s < 60) return `${s}초`
  if (s < 3600) return `${Math.floor(s / 60)}분 ${p(s % 60)}초`
  return `${Math.floor(s / 3600)}시간 ${p(Math.floor(s / 60) % 60)}분`
}

const pct = (n?: number) => (n === undefined ? '-' : `${Math.round(n)}%`)

const color = (n = 0, l: Level) => (n >= l.err ? 'error' : n >= l.warn ? 'warning' : 'success')
const bar = (n = 0) => {
  const on = Math.max(0, Math.min(8, Math.round(n / 12.5)))
  return '▰'.repeat(on) + '▱'.repeat(8 - on)
}

const reset = (list: Limit[], kind: string) => {
  const w = list.find(r => r.kind === kind)
  if (!w?.resetsAt) return ''
  const d = new Date(w.resetsAt)
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return kind === 'seven_day' ? `${'일월화수목금토'[d.getDay()]} ${hm} 리셋` : `${hm} 리셋`
}

// 시안 A 그대로의 그림. 라이트/다크는 시스템 설정을 따름(prefers-color-scheme)
const STYLE = `<style>text{font-family:system-ui,'Malgun Gothic',sans-serif}.l{font-size:12px;fill:#5f5e5a}.v{font-size:12px;font-weight:500;fill:#141413}.m{font-size:11px;fill:#8a8985}
.t{fill:rgba(0,0,0,.1)}.ok{fill:#3b8f3b}.ac{fill:#2c84db}.wn{fill:#d99a00}.er{fill:#d33f3f}
@media (prefers-color-scheme:dark){.l{fill:#b0aea5}.v{fill:#faf9f5}.t{fill:rgba(255,255,255,.14)}.ok{fill:#6cc16c}.ac{fill:#5aa5f0}.wn{fill:#f0b429}.er{fill:#f06a6a}}</style>`
// 칸 윗줄 글자(이름 + 작은 설명). 글자 길이만큼만 폭을 잡음(한글 12px, 그 외 6.5px 정도로 어림)
const textW = (t: string, ko: number, en: number) =>
  [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? ko : /[ ./]/.test(ch) ? en * 0.6 : /[MW]/.test(ch) ? en * 1.6 : en), 0)
const svgLabel = (name: string, note: string) => {
  // 끝에 2px 여유: 어림이 모자라 마지막 글자(M 등)가 잘리지 않게
  const w = Math.ceil(textW(name, 12, 7) + 6 + textW(note, 11, 6.2)) + 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="14" viewBox="0 0 ${w} 14">
${STYLE}<text x="0" y="11" class="l">${name}<tspan class="m" dx="6">${note}</tspan></text></svg>`
}
const svgValue = (v: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="14" viewBox="0 0 40 14">
${STYLE}<text x="40" y="11" class="v" text-anchor="end">${v}</text></svg>`
// 칸 막대
// viewBox 없이 퍼센트 길이라 남은 폭을 다 써도 모양이 안 늘어남
// 말풍선(isInteractive + title)은 시도했으나 배너에서 그림 칸이 크게 부풀어 레이아웃이 깨져 뺌
const svgBar = (n: number | undefined, c: string) => {
  const w = Math.max(0, Math.min(100, n ?? 0))
  // 위 3px 띄움: 글자줄(14px)과 합쳐 5시간/주간 칸처럼 글자 아래 17px 지점에 막대가 오게
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="8">
${STYLE}<rect x="0" y="3" width="100%" height="5" rx="2.5" class="t"/>
<rect x="0" y="3" width="${w}%" height="5" rx="2.5" class="${c}"/></svg>`
}
// 상세 항목 순서: 실제로 쓰는 항목을 많은 순으로 먼저, 그다음 나중에 불러오는 항목, 압축 여유분, 빈 공간
const KIND_ORDER = { used: 0, deferred: 1, buffer: 2, free: 3 } as const
const byUse = (cs: readonly SessionContextBreakdown['categories'][number][]) =>
  [...cs].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || b.tokens - a.tokens)
const tone = (n = 0, l: Level, base = 'ac') => (n >= l.err ? 'er' : n >= l.warn ? 'wn' : base)
const k = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${+(n / 1000).toFixed(1)}k`)
const ctxText = (u: Usage) =>
  u.contextTokens === undefined || u.contextMax === undefined ? '' : `${k(u.contextTokens)} / ${k(u.contextMax)}`

// 분모는 모델 최대 창이 아니라 압축 기준 창(사용자가 400k 등으로 줄였으면 그 값).
// summary 분해는 로컬 추정이라 API 호출 없음. 모델 창이 바뀔 때만 다시 읽음
let maxFor: { window: number; max: number } | undefined
// 호버 상세용: 마지막으로 읽은 항목별 분해. 그리는 중엔 계산을 새로 하지 않고 이걸 보여줌(답변마다 갱신)
let lastBreakdown: SessionContextBreakdown | undefined
// 압축 직후 토큰 수. 엔진은 다음 답변이 올 때까지 압축 전 값을 주므로 그동안 이걸 보여줌
let compacted: number | undefined
const ctxOf = async ($: EngineInterface, c: SessionContextUsage) => {
  if (maxFor?.window !== c.window) {
    const b = await $.session.usage({ breakdown: 'summary' }).then(r => r.context.breakdown, () => undefined)
    if (b) lastBreakdown = b
    // 세션이 아직 안 붙어 분해가 없으면 캐시하지 않고 다음에 다시 시도
    if (b?.rawMaxTokens) maxFor = { window: c.window, max: b.rawMaxTokens }
  }
  const max = maxFor?.window === c.window ? maxFor.max : c.window
  const percent = c.tokens === undefined ? c.percent : Math.min(100, (c.tokens / max) * 100)
  if (compacted !== undefined) return { contextPercent: Math.min(100, (compacted / max) * 100), contextTokens: compacted, contextMax: max }
  return { contextPercent: percent, contextTokens: c.tokens, contextMax: max }
}

// session.start는 프로세스당 한 번만 불리므로, 새 세션에서는 배너가 그려질 때도 명령을 등록해 둠
const ensureCommands = async ($: EngineInterface) => {
  const have = (await $.command.list()).map(c => c.name)
  if (!have.includes('cs-on')) await $.command.register({ name: 'cs-on', description: '사용량 배너 켜기' })
  if (!have.includes('cs-off')) await $.command.register({ name: 'cs-off', description: '사용량 배너 끄기' })
}

// 5시간/주간은 계정 단위라 세션이 바뀌어도 같음. 새 세션에서 비어 있으면 마지막에 본 값을 씀
const withLast = async ($: EngineInterface, u: Usage): Promise<Usage> => {
  if (u.rateLimits.length > 0) {
    const raw = await $.store.get('lastLimits')
    const merged = newest(Array.isArray(raw) ? (raw as Limit[]) : [], u.rateLimits)
    await $.store.set('lastLimits', merged)
    return { ...u, rateLimits: expire(merged) }
  }
  const rateLimits = await storedLimits($)
  return rateLimits ? { ...u, rateLimits } : u
}
// 세션마다 마지막 답변 시점의 값을 들고 있어서, 오래 쉰 세션은 낡은 값(예: 37%)을 줌. 값에 시각이 없으므로
// 종류별로 리셋 시각이 늦은 쪽(새 구간)을, 같으면 퍼센트가 큰 쪽을 새 값으로 봄(한 구간 안에선 줄지 않음)
const newest = (a: readonly Limit[], b: readonly Limit[]): Limit[] => {
  const t = (r?: Limit) => (r?.resetsAt ? new Date(r.resetsAt).getTime() : 0)
  const kinds = [...new Set([...a, ...b].map(r => r.kind))]
  return kinds.map(kind => {
    const x = a.find(r => r.kind === kind)
    const y = b.find(r => r.kind === kind)
    if (!x || !y) return (x ?? y)!
    if (t(x) !== t(y)) return t(x) > t(y) ? x : y
    return (y.percentUsed ?? 0) >= (x.percentUsed ?? 0) ? y : x
  })
}
// 리셋 시각이 지난 값은 이미 초기화된 것이므로 0%로 봄
const expire = (ls: readonly Limit[]): Limit[] => {
  const now = Date.now()
  return ls.map(r => (r.resetsAt && new Date(r.resetsAt).getTime() <= now ? { kind: r.kind, percentUsed: 0 } : r))
}
// 모든 세션이 같은 저장소에 쓰고, 쓸 때 더 새 값만 남기므로 여기엔 어느 세션이든 가장 최근 값이 있음
const storedLimits = async ($: EngineInterface): Promise<Limit[] | undefined> => {
  const saved = await $.store.get('lastLimits')
  return Array.isArray(saved) ? expire(saved as Limit[]) : undefined
}
// 그림은 상태가 바뀔 때만 다시 그려지고 공유 저장소 읽기는 그 계기가 안 됨. 그래서 쉬고 있는 세션은
// 다른 세션이 갱신한 5시간/주간을 못 봄. 주기적으로 저장소를 읽어 달라졌으면 상태에 넣어 다시 그리게 함
// (리셋 시각이 지나 0%가 되는 것도 이걸로 반영)
// 한 프로세스가 /clear 등으로 세션을 바꿔도 세션마다 따로 돌게 세션 id로 묶음
const syncs = new Map<string, { cancel: () => void }>()
const syncLimits = async ($: EngineInterface) => {
  const s = await storedLimits($)
  const cur = await read($, usage)
  if (s && cur && JSON.stringify(s) !== JSON.stringify(cur.rateLimits)) await update($, usage, () => ({ ...cur, rateLimits: s }))
}
const startSync = async ($: EngineInterface) => {
  const id = await $.session.id()
  if (!syncs.has(id)) syncs.set(id, $.clock.every(10_000, () => void syncLimits($)))
}

// 본 대화의 응답이 진행 중인지. turn.start/turn.complete(agentId 없음)로 켜고 끔
// shortcut: 모듈 변수라 응답 도중 /reload-plugins 하면 그 응답 동안은 진행 중인 걸 모름(누르면 바로 실행 시도), 문제되면 $.state로
let busy = false
// 압축 버튼: /compact 를 직접 입력한 것과 같은 경로로 실행(진행 표시도 똑같이 나옴).
// 응답이 진행 중이면 엔진이 거부하므로 대기열에 걸어 두고, 응답이 끝나면 실행. 대기 중에 다시 누르면 취소
const compactNow = async ($: EngineInterface) => {
  if (busy) {
    const q = !(await read($, compactQueued))
    await update($, compactQueued, () => q)
    return
  }
  await update($, compactQueued, () => false)
  try {
    await $.command.run({ command: 'compact' })
  } catch (err) {
    // 그 사이 새 응답이 시작됐으면 다시 대기열로
    if (busy) return void (await update($, compactQueued, () => true))
    $.ui.toast(`압축하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const setOn = async ($: EngineInterface, on: boolean) => {
  await update($, isOn, () => on)
  await $.store.set('isOn', on)
}

// /autocompact 로 압축 기준을 바꾸면 모델 창은 그대로라 캐시가 안 풀림. 명령이 끝나면 다시 읽음
const recheck = async ($: EngineInterface) => {
  maxFor = undefined
  const u = await $.session.usage()
  const v = await withLast($, { ...(await ctxOf($, u.context)), rateLimits: u.rateLimits })
  await update($, usage, () => v)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // ~/.claude/commands/cs-on.md 가 있으면 그게 목록에 뜨므로 중복 등록 안 함
    await ensureCommands($)
    const saved = await $.store.get('isOn')
    if (typeof saved === 'boolean') await update($, isOn, () => saved)
    const u = await $.session.usage()
    { const v = await withLast($, { ...(await ctxOf($, u.context)), rateLimits: u.rateLimits }); await update($, usage, () => v) }
    await startSync($)
    return next(e)
  })

  on('command.run', { command: 'cs-on' }, async $ => {
    await setOn($, true)
    // 켜자마자 보이도록 지금 사용량을 바로 읽음(안 하면 다음 측정 때까지 비어 있음)
    const u = await $.session.usage()
    { const v = await withLast($, { ...(await ctxOf($, u.context)), rateLimits: u.rateLimits }); await update($, usage, () => v) }
    return { text: '사용량 배너를 켰습니다.' }
  })

  on('command.run', { command: 'cs-off' }, async $ => {
    await setOn($, false)
    return { text: '사용량 배너를 껐습니다.' }
  })

  on('command.run', { command: 'autocompact' }, async ($, e, next) => {
    const r = await next(e)
    await recheck($)
    return r
  })
  on('config.set', async ($, e, next) => {
    const r = await next(e)
    if (/compact/i.test(e.key)) await recheck($)
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // 서브에이전트 자기 압축, 미리 계산(precompute), 건너뜀은 본 대화가 안 바뀜
    if (r.skip === undefined && !e.agentId && e.trigger !== 'precompute') {
      maxFor = undefined
      const b = await $.session.usage({ breakdown: 'summary' }).then(x => x.context.breakdown, () => undefined)
      if (b) lastBreakdown = b
      compacted = r.tokensAfter ?? b?.totalTokens
      await recheck($)
    }
    return r
  })

  // 서브에이전트가 생기거나 상태가 바뀌는 때마다 목록을 다시 읽음
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    await refreshAgents($)
    return r
  })
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) await refreshAgents($)
    else busy = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      busy = false
      // 턴이 기다리는 훅 안에서는 명령 실행이 거부되므로 타이머로 훅 밖에서 실행
      if (await read($, compactQueued)) $.clock.after(1, () => void compactNow($))
    }
    return r
  })

  on('tool.call', { tool: 'Bash' }, trackShell)
  on('tool.call', { tool: 'PowerShell' }, trackShell)
  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const r = await next(e)
    const id = e.task_id ?? e.shell_id
    if (id && shells.delete(id)) await refreshAgents($)
    return r
  })
  // 끝나면 오는 완료 알림 본문에 작업 id가 들어 있음. 형식에 기대지 않고 id가 들어 있는지만 봄
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification' && shells.size) {
      let hit = false
      for (const id of [...shells.keys()]) if (e.text.includes(id)) hit = shells.delete(id) || hit
      if (hit) await refreshAgents($)
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    compacted = undefined
    await refreshAgents($)
    // 다른 경로(설정 파일 직접 수정 등)로 바뀐 것도 답변이 올 때마다 다시 읽어 맞춤
    maxFor = undefined
    const u = await withLast($, { ...(await ctxOf($, e.context)), rateLimits: e.rateLimits })
    await update($, usage, () => u)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await ensureCommands($)
    // session.start가 프로세스당 한 번이라, 새 세션에서는 여기서 시작
    await startSync($)
    const saved = await read($, usage)
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)
    // 그리는 중에는 상태를 쓸 수 없어서(엔진이 거부) 읽기만 함. 컨텍스트는 그릴 때마다 지금 값을 읽어
    // 모델을 바꾼 직후에도 맞게 나옴(기본 호출은 비용 없음). 5시간/주간은 저장된 값, 없으면 지금 값
    const now = await $.session.usage()
    // 5시간/주간은 계정 단위: 다른 세션에서 갱신된 값이 이 세션 것보다 새로우므로 공유 저장소를 먼저 봄
    const limits = (await storedLimits($)) ?? (saved?.rateLimits.length ? saved.rateLimits : now.rateLimits)
    const u: Usage = { rateLimits: limits, ...(await ctxOf($, now.context)) }

    const { Box, Button, Text, Svg } = $.ui.resolve(e) as any
    const five = u.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
    const week = u.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed
    const ctx = u.contextPercent
    const lv = LEVELS
    const bg = await read($, agents)
    const bgShown = await read($, bgOpen)
    const t = await read($, tick)
    const queued = await read($, compactQueued)
    // 창 폭(글자 칸 수)에 따라 버튼 글자를 줄임: 넓으면 '세션 압축', 좁으면 '압축', 더 좁으면 기호만
    const cols = e.viewport?.columns ?? 120
    const compactLabel = cols >= 110 ? (queued ? '압축 대기 중' : '세션 압축') : cols >= 80 ? (queued ? '대기 중' : '압축') : queued ? '⏳' : '⇩'
    const dot = (st: string) => (st === 'running' ? 'success' : st === 'waiting' ? 'warning' : undefined)
    // 서브에이전트가 돌 때만 배너 아래에 쌓임. 머리 줄의 ▾/▴로 펼치고 접음
    const bgList = bg.length ? (
      <Box key="bglist" flexDirection="column" gap={Svg ? 'sm' : 0} marginTop={1} paddingY={Svg ? 1 : 0} paddingLeft={Svg ? 'xs' : 0}>
        <Box alignItems="center" gap={1}>
          <Text dimColor>{`백그라운드 작업 ${bg.length}개`}</Text>
          <Button key="bgtoggle" label={bgShown ? '▴' : '▾'} plain dimColor onPress={() => update($, bgOpen, v => !v)} />
        </Box>
        <Box display={bgShown ? 'flex' : 'none'} flexDirection="column" gap={Svg ? 'xs' : 0}>
          {bg.map(a => (
            <Box key={`bg-${a.id}`} gap={2}>
              {/* 동그라미는 설명 글자에 바짝 붙임(바깥 줄 간격 2와 따로) */}
              <Box flexGrow={1} flexShrink={1} minWidth={0} gap={1}>
                <Text color={dot(a.status)} dimColor={!dot(a.status)}>•</Text>
                <Text wrap="truncate">{a.description}</Text>
              </Box>
              <Text dimColor>{a.type}</Text>
              <Box width={9} justifyContent="flex-end"><Text dimColor>{elapsed(t - (a.startedAt ?? t))}</Text></Box>
              <Box width={10} justifyContent="flex-end"><Text dimColor>{STATUS_KO[a.status] ?? a.status}</Text></Box>
            </Box>
          ))}
        </Box>
      </Box>
    ) : null
    if (Svg) {
      // 세 칸 모두 같은 구조(윗줄 글자/퍼센트, 아랫줄 막대)에 폭 0에서 똑같이 늘어나게 해서 창이 좁아도 고르게 줄어듦
      const cell = (key: string, name: string, note: string, n: number | undefined, cls: string) => (
        <Box key={key} width={0} flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column">
          <Box alignItems="center" overflow="hidden">
            <Svg key={`${key}label`} source={svgLabel(name, note)} alt={`${name} ${note}`} />
            <Box flexGrow={1} />
            <Svg key={`${key}pct`} source={svgValue(pct(n))} alt={pct(n)} />
          </Box>
          <Svg key={`${key}band`} source={svgBar(n, cls)} alt={`${name} ${pct(n)}`} />
        </Box>
      )
      const b = lastBreakdown
      const open = await read($, ctxOpen)
      const max = b?.rawMaxTokens || 1
      const line = (key: string, name: string, colr: string | undefined, tokens: string, part: string, dim = false) => (
        <Box key={key} gap={3}>
          <Box width={2}><Text color={colr}>{colr ? '■' : ' '}</Text></Box>
          <Box flexGrow={1}><Text dimColor={dim}>{name}</Text></Box>
          <Box width={12} justifyContent="flex-end"><Text dimColor={dim}>{tokens}</Text></Box>
          <Box width={9} justifyContent="flex-end"><Text dimColor>{part}</Text></Box>
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Box alignItems="center" gap={3}>
            {cell('five', '5시간', reset(u.rateLimits, 'five_hour'), five, tone(five, lv.five))}
            {cell('week', '주간', reset(u.rateLimits, 'seven_day'), week, tone(week, lv.week))}
            {cell('ctx', '컨텍스트', ctxText(u), ctx, tone(ctx, lv.ctx, 'ok'))}
            {/* 버튼은 칸 밖에 둬서 세 막대 길이가 같게. 배너 끄기는 /cs-off */}
            <Box key="btns" alignItems="center" gap={1}>
              <Button key="ctxdetail" label={open ? '▴' : '▾'} plain dimColor onPress={() => update($, ctxOpen, v => !v)} />
              <Button key="compact" label={compactLabel} dimColor={!queued} onPress={() => compactNow($)} />
            </Box>
          </Box>
          <Box display={open ? 'flex' : 'none'} flexDirection="column" gap={2} marginTop={1} paddingY={1} paddingLeft="xs">
            {b ? (
              <Box flexDirection="column" gap={2}>
                <Box justifyContent="space-between">
                  <Text weight="semibold">{Math.round(b.percentage)}% 사용됨</Text>
                  <Text>{k(b.totalTokens)} / {k(max)}</Text>
                </Box>
                <Box flexDirection="column">
                  {byUse(b.categories).map((c, i) =>
                    line(`c${i}`, c.name, c.color, k(c.tokens), c.isDeferred ? '—' : `${((c.tokens / max) * 100).toFixed(1)}%`, c.isDeferred),
                  )}
                </Box>
                <Box flexDirection="column">
                  {line('mcp', 'MCP 도구', undefined, String(b.mcpTools.length), '', true)}
                  {line('mem', '메모리 파일', undefined, String(b.memoryFiles.length), '', true)}
                </Box>
              </Box>
            ) : (
              <Text dimColor>메시지를 한 번 보내면 항목별 사용량이 나옵니다.</Text>
            )}
          </Box>
          {bgList}
        </Box>
      )
    }
    const col = (name: string, n: number | undefined, note: string, l: Level) => (
      <Box key={name} marginRight={2}>
        <Text dimColor>{name} </Text>
        <Text color={color(n, l)}>{bar(n)}</Text>
        <Text> {pct(n)} </Text>
        <Text dimColor>{note}</Text>
      </Box>
    )
    return (
      <Box flexDirection="column">
        <Box>
          {col('5시간', five, reset(u.rateLimits, 'five_hour'), lv.five)}
          {col('주간', week, reset(u.rateLimits, 'seven_day'), lv.week)}
          {col('컨텍스트', ctx, ctxText(u), lv.ctx)}
          <Button key="compact" label={compactLabel} dimColor={!queued} onPress={() => compactNow($)} />
        </Box>
        {bgList}
      </Box>
    )
  })


}
