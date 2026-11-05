import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage } from 'claude-code'

import type { Level, Levels, Limit, Usage } from '../types'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const isOn = atom({ plugin: 'usage-band', key: 'isOn' } as const, true)
const ctxOpen = atom({ plugin: 'usage-band', key: 'ctxOpen' } as const, false) // 컨텍스트 상세 펼침 여부

// 막대 색 기준. 기본은 셋 다 40% 주황, 80% 빨강. 설정 창에서 바꾸면 store에 남아 다음 세션에도 유지
const DEFAULT_LEVELS: Levels = { five: { warn: 40, err: 80 }, week: { warn: 40, err: 80 }, ctx: { warn: 40, err: 80 } }
const levels = atom({ plugin: 'usage-band', key: 'levels' } as const, DEFAULT_LEVELS)
const isLevel = (v: unknown): v is Level =>
  typeof v === 'object' && v !== null && typeof (v as Level).warn === 'number' && typeof (v as Level).err === 'number'
const isLevels = (v: unknown): v is Levels =>
  typeof v === 'object' && v !== null && ['five', 'week', 'ctx'].every(k => isLevel((v as Record<string, unknown>)[k]))
const setLevels = async ($: EngineInterface, fn: (l: Levels) => Levels) => {
  const v = fn(await read($, levels))
  await update($, levels, () => v)
  await $.store.set('levels', v)
}

const SETTINGS = 'usage-band-settings'
// 톱니를 다시 누르면 닫힘. 열림 여부는 엔진 기록(panes)으로 확인해 Esc로 닫은 경우도 맞게 동작
const openSettings = async ($: EngineInterface) => {
  const open = (await $.ui.panes()).some(p => p.id === SETTINGS)
  if (open) await $.ui.close({ id: SETTINGS })
  else await $.ui.open({ id: SETTINGS, title: '사용량 배너 색 기준', focus: true, closeOnEscape: true })
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
type Col = { name: string; n?: number; note: string; c: string }
const svgBand = (cols: Col[]) => {
  const W = 168
  const g = cols
    .map((c, i) => {
      const x = i * (W + 24)
      const w = Math.max(0, Math.min(100, c.n ?? 0)) / 100 * W
      return `<text x="${x}" y="11" class="l">${c.name}<tspan class="m" dx="6">${c.note}</tspan></text>
<text x="${x + W}" y="11" class="v" text-anchor="end">${pct(c.n)}</text>
<rect x="${x}" y="17" width="${W}" height="5" rx="2.5" class="t"/>
<rect x="${x}" y="17" width="${Math.max(w, c.n ? 5 : 0)}" height="5" rx="2.5" class="${c.c}"/>`
    })
    .join('')
  const total = cols.length * (W + 24) - 24
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="22" viewBox="0 0 ${total} 22">
${STYLE}${g}</svg>`
}
// 컨텍스트 칸 윗줄 글자. 5시간/주간 칸과 같은 글꼴, 간격(dx=6)으로 그리고, 버튼을 바로 옆에 붙이려고
// 글자 길이만큼만 폭을 잡음(한글 12px, 그 외 6.5px 정도로 어림)
const textW = (t: string, ko: number, en: number) => [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? ko : en), 0)
const svgLabel = (name: string, note: string) => {
  const w = Math.ceil(textW(name, 12, 7) + 6 + textW(note, 11, 6.2)) + 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="14" viewBox="0 0 ${w} 14">
${STYLE}<text x="0" y="11" class="l">${name}<tspan class="m" dx="6">${note}</tspan></text></svg>`
}
const svgValue = (v: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="14" viewBox="0 0 40 14">
${STYLE}<text x="40" y="11" class="v" text-anchor="end">${v}</text></svg>`
// 컨텍스트 칸의 막대
// viewBox 없이 퍼센트 길이라 남은 폭을 다 써도 모양이 안 늘어남
const svgBar = (n: number | undefined, c: string) => {
  const w = Math.max(0, Math.min(100, n ?? 0))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="6">
${STYLE}<rect x="0" y="0" width="100%" height="5" rx="2.5" class="t"/>
<rect x="0" y="0" width="${w}%" height="5" rx="2.5" class="${c}"/></svg>`
}
const tone = (n = 0, l: Level, base = 'ac') => (n >= l.err ? 'er' : n >= l.warn ? 'wn' : base)
// 설정 줄의 눈금: 0~100을 기본/주황/빨강 구간으로 칠하고 10%마다 세로선
const svgScale = (l: Level, base: string) => {
  const W = 200
  const x = (p: number) => (Math.max(0, Math.min(100, p)) / 100) * W
  const ticks = Array.from({ length: 11 }, (_, i) => `<line x1="${Math.min(x(i * 10), W - 0.5)}" y1="2" x2="${Math.min(x(i * 10), W - 0.5)}" y2="14" class="tk"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="16" viewBox="0 0 ${W} 16">
${STYLE}<style>.tk{stroke:rgba(0,0,0,.35);stroke-width:1}@media (prefers-color-scheme:dark){.tk{stroke:rgba(255,255,255,.4)}}</style>
<rect x="0" y="5" width="${x(Math.min(l.warn, l.err))}" height="6" class="${base}"/>
<rect x="${x(l.warn)}" y="5" width="${Math.max(0, x(l.err) - x(l.warn))}" height="6" class="wn"/>
<rect x="${x(l.err)}" y="5" width="${W - x(l.err)}" height="6" class="er"/>${ticks}</svg>`
}
// 입력값은 1~100 정수만 받음. 그 외는 무시(입력 중간 상태일 수 있음)
const toPct = (v: string) => {
  const n = Number(v.trim())
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : undefined
}

const k = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${+(n / 1000).toFixed(1)}k`)
const ctxText = (u: Usage) =>
  u.contextTokens === undefined || u.contextMax === undefined ? '' : `${k(u.contextTokens)} / ${k(u.contextMax)}`

// 분모는 모델 최대 창이 아니라 압축 기준 창(사용자가 400k 등으로 줄였으면 그 값).
// summary 분해는 로컬 추정이라 API 호출 없음. 모델 창이 바뀔 때만 다시 읽음
let maxFor: { window: number; max: number } | undefined
// 호버 상세용: 마지막으로 읽은 항목별 분해. 그리는 중엔 계산을 새로 하지 않고 이걸 보여줌(답변마다 갱신)
let lastBreakdown: SessionContextBreakdown | undefined
const ctxOf = async ($: EngineInterface, c: SessionContextUsage) => {
  if (maxFor?.window !== c.window) {
    const b = await $.session.usage({ breakdown: 'summary' }).then(r => r.context.breakdown, () => undefined)
    if (b) lastBreakdown = b
    // 세션이 아직 안 붙어 분해가 없으면 캐시하지 않고 다음에 다시 시도
    if (b?.rawMaxTokens) maxFor = { window: c.window, max: b.rawMaxTokens }
  }
  const max = maxFor?.window === c.window ? maxFor.max : c.window
  const percent = c.tokens === undefined ? c.percent : Math.min(100, (c.tokens / max) * 100)
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
    await $.store.set('lastLimits', u.rateLimits)
    return u
  }
  const saved = await $.store.get('lastLimits')
  if (!Array.isArray(saved)) return u
  const now = Date.now()
  // 리셋 시각이 지난 값은 이미 초기화된 것이므로 0%로 봄
  const rateLimits = (saved as Limit[]).map(r =>
    r.resetsAt && new Date(r.resetsAt).getTime() <= now ? { kind: r.kind, percentUsed: 0 } : r,
  )
  return { ...u, rateLimits }
}

// 망치 버튼: /compact 를 직접 입력한 것과 같은 경로로 실행(진행 표시도 똑같이 나옴).
// 응답이 진행 중이면 엔진이 거부하므로, 조용히 실패하지 않게 안내를 띄움
const compactNow = async ($: EngineInterface) => {
  try {
    await $.command.run({ command: 'compact' })
  } catch (err) {
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
    const lv = await $.store.get('levels')
    if (isLevels(lv)) await update($, levels, () => lv)
    const u = await $.session.usage()
    { const v = await withLast($, { ...(await ctxOf($, u.context)), rateLimits: u.rateLimits }); await update($, usage, () => v) }
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

  on('session.measure', async ($, e, next) => {
    // 다른 경로(설정 파일 직접 수정 등)로 바뀐 것도 답변이 올 때마다 다시 읽어 맞춤
    maxFor = undefined
    const u = await withLast($, { ...(await ctxOf($, e.context)), rateLimits: e.rateLimits })
    await update($, usage, () => u)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await ensureCommands($)
    const saved = await read($, usage)
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)
    // 그리는 중에는 상태를 쓸 수 없어서(엔진이 거부) 읽기만 함. 컨텍스트는 그릴 때마다 지금 값을 읽어
    // 모델을 바꾼 직후에도 맞게 나옴(기본 호출은 비용 없음). 5시간/주간은 저장된 값, 없으면 지금 값
    const now = await $.session.usage()
    const u: Usage = { rateLimits: saved?.rateLimits.length ? saved.rateLimits : now.rateLimits, ...(await ctxOf($, now.context)) }

    const { Box, Button, Text, Svg } = $.ui.resolve(e) as any
    const five = u.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
    const week = u.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed
    const ctx = u.contextPercent
    const lv = await read($, levels)
    if (Svg) {
      const svg = svgBand([
        { name: '5시간', n: five, note: reset(u.rateLimits, 'five_hour'), c: tone(five, lv.five) },
        { name: '주간', n: week, note: reset(u.rateLimits, 'seven_day'), c: tone(week, lv.week) },
      ])
      const ctxSvg = svgBar(ctx, tone(ctx, lv.ctx, 'ok'))
      const b = lastBreakdown
      const open = await read($, ctxOpen)
      const max = b?.rawMaxTokens || 1
      const line = (key: string, name: string, colr: string | undefined, tokens: string, part: string, dim = false) => (
        <Box key={key} gap={2}>
          <Box width={2}><Text color={colr}>{colr ? '■' : ' '}</Text></Box>
          <Box flexGrow={1}><Text dimColor={dim}>{name}</Text></Box>
          <Box width={9} justifyContent="flex-end"><Text dimColor={dim}>{tokens}</Text></Box>
          <Box width={7} justifyContent="flex-end"><Text dimColor>{part}</Text></Box>
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Box alignItems="center" gap={3}>
            <Svg key="band" source={svg} alt={`5시간 ${pct(five)}, 주간 ${pct(week)}`} />
            {/* 사용량 글자(예: 292.3k / 1M) 바로 오른쪽 작은 버튼: 누르면 아래에 항목별 상세가 펼쳐지고 다시 누르면 접힘 */}
            <Box key="ctx" flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column">
              <Box alignItems="center">
                <Svg key="ctxlabel" source={svgLabel('컨텍스트', ctxText(u))} alt={`컨텍스트 ${ctxText(u)}`} />
                <Button key="ctxdetail" label={open ? '▴' : '▾'} plain dimColor onPress={() => update($, ctxOpen, v => !v)} />
                <Box flexGrow={1} />
                <Svg key="ctxpct" source={svgValue(pct(ctx))} alt={pct(ctx)} />
              </Box>
              <Svg key="ctxband" source={ctxSvg} alt={`컨텍스트 ${ctxText(u)} ${pct(ctx)}`} />
            </Box>
            <Box alignItems="center" gap={1}>
              <Button key="compact" label="⚒︎" dimColor onPress={() => compactNow($)} />
              <Button key="settings" label="⚙" dimColor onPress={() => openSettings($)} />
              <Button key="close" label="✕" dimColor role="dismiss" onPress={() => setOn($, false)} />
            </Box>
          </Box>
          <Box display={open ? 'flex' : 'none'} flexDirection="column" gap={1} marginTop={1}>
            {b ? (
              <Box flexDirection="column" gap={1}>
                <Box justifyContent="space-between">
                  <Text weight="semibold">{Math.round(b.percentage)}% 사용됨</Text>
                  <Text>{k(b.totalTokens)} / {k(max)}</Text>
                </Box>
                <Box flexDirection="column">
                  {b.categories.map((c, i) =>
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
      <Box>
        {col('5시간', five, reset(u.rateLimits, 'five_hour'), lv.five)}
        {col('주간', week, reset(u.rateLimits, 'seven_day'), lv.week)}
        {col('컨텍스트', ctx, ctxText(u), lv.ctx)}
        <Button key="compact" label="⚒︎" dimColor onPress={() => compactNow($)} />
        <Text> </Text>
        <Button key="settings" label="⚙" dimColor onPress={() => openSettings($)} />
        <Text> </Text>
        <Button key="close" label="✕" dimColor onPress={() => setOn($, false)} />
      </Box>
    )
  })

  // 설정 창: 막대마다 10% 눈금 막대와 주황/빨강 시작 % 입력칸
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const { Box, Text, Input, Button, Svg } = $.ui.resolve(e) as any
    const lv = await read($, levels)
    const set = (id: keyof Levels, which: keyof Level) => (v: string) => {
      const n = toPct(v)
      if (n !== undefined) void setLevels($, l => ({ ...l, [id]: { ...l[id], [which]: n } }))
    }
    const row = (id: keyof Levels, name: string, base: string) => (
      <Box key={`set-${id}`} flexDirection="column" gap={1} marginBottom={2}>
        <Text weight="semibold">{name}</Text>
        {Svg && <Svg key={`scale-${id}`} source={svgScale(lv[id], base)} alt={`${name} 주황 ${lv[id].warn}%, 빨강 ${lv[id].err}%`} />}
        <Box gap={2}>
          <Input key={`${id}-warn`} label="주황 %" value={String(lv[id].warn)} onInput={set(id, 'warn')} onSubmit={set(id, 'warn')} />
          <Input key={`${id}-err`} label="빨강 %" value={String(lv[id].err)} onInput={set(id, 'err')} onSubmit={set(id, 'err')} />
        </Box>
      </Box>
    )
    return (
      <Box flexDirection="column">
        {row('five', '5시간 세션', 'ac')}
        {row('week', '주간 세션', 'ac')}
        {row('ctx', '컨텍스트', 'ok')}
        <Button key="reset" variant="secondary" onPress={() => setLevels($, () => DEFAULT_LEVELS)}>
          <Text>기본값으로 (40% / 80%)</Text>
        </Button>
      </Box>
    )
  })

}
