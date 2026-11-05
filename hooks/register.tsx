import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Usage } from '../types'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const isOn = atom({ plugin: 'usage-band', key: 'isOn' } as const, true)

const pct = (n?: number) => (n === undefined ? '-' : `${Math.round(n)}%`)

const CTX_WARN = 40 // 컨텍스트가 이 값을 넘으면 세션 압축 버튼 색이 바뀜
const color = (n = 0) => (n >= 95 ? 'error' : n >= 80 ? 'warning' : 'success')
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
const svgBand = (cols: { name: string; n?: number; note: string; c: string }[]) => {
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${3 * W + 48}" height="22" viewBox="0 0 ${3 * W + 48} 22">
<style>text{font-family:system-ui,'Malgun Gothic',sans-serif}.l{font-size:12px;fill:#5f5e5a}.v{font-size:12px;font-weight:500;fill:#141413}.m{font-size:11px;fill:#8a8985}
.t{fill:rgba(0,0,0,.1)}.ok{fill:#3b8f3b}.ac{fill:#2c84db}.wn{fill:#d99a00}.er{fill:#d33f3f}
@media (prefers-color-scheme:dark){.l{fill:#b0aea5}.v{fill:#faf9f5}.t{fill:rgba(255,255,255,.14)}.ok{fill:#6cc16c}.ac{fill:#5aa5f0}.wn{fill:#f0b429}.er{fill:#f06a6a}}</style>${g}</svg>`
}
const tone = (n = 0, base = 'ac') => (n >= 95 ? 'er' : n >= 80 ? 'wn' : base)

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

const setOn = async ($: EngineInterface, on: boolean) => {
  await update($, isOn, () => on)
  await $.store.set('isOn', on)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // ~/.claude/commands/cs-on.md 가 있으면 그게 목록에 뜨므로 중복 등록 안 함
    await ensureCommands($)
    const saved = await $.store.get('isOn')
    if (typeof saved === 'boolean') await update($, isOn, () => saved)
    const u = await $.session.usage()
    { const v = await withLast($, { contextPercent: u.context.percent, rateLimits: u.rateLimits }); await update($, usage, () => v) }
    return next(e)
  })

  on('command.run', { command: 'cs-on' }, async $ => {
    await setOn($, true)
    // 켜자마자 보이도록 지금 사용량을 바로 읽음(안 하면 다음 측정 때까지 비어 있음)
    const u = await $.session.usage()
    { const v = await withLast($, { contextPercent: u.context.percent, rateLimits: u.rateLimits }); await update($, usage, () => v) }
    return { text: '사용량 배너를 켰습니다.' }
  })

  on('command.run', { command: 'cs-off' }, async $ => {
    await setOn($, false)
    return { text: '사용량 배너를 껐습니다.' }
  })

  on('session.measure', async ($, e, next) => {
    const u = await withLast($, { contextPercent: e.context.percent, rateLimits: e.rateLimits })
    await update($, usage, () => u)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await ensureCommands($)
    let u = await read($, usage)
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)
    // 첫 메시지 전에는 값이 비어 있으므로 다시 읽어 보고, 그래도 비면 '-'로 표시(켰는데 안 보이면 혼란)
    if (u === null || (u.contextPercent === undefined && u.rateLimits.length === 0)) {
      const n = await $.session.usage()
      const v = await withLast($, { contextPercent: n.context.percent, rateLimits: n.rateLimits })
      u = v
      if (v.contextPercent !== undefined || v.rateLimits.length > 0) await update($, usage, () => v)
    }

    const { Box, Button, Text, Svg } = $.ui.resolve(e) as any
    const five = u.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
    const week = u.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed
    const ctx = u.contextPercent
    const hot0 = (ctx ?? 0) >= CTX_WARN
    if (Svg) {
      const svg = svgBand([
        { name: '5시간', n: five, note: reset(u.rateLimits, 'five_hour'), c: tone(five) },
        { name: '주간', n: week, note: reset(u.rateLimits, 'seven_day'), c: tone(week) },
        { name: '컨텍스트', n: ctx, note: hot0 ? '압축 권장' : '', c: hot0 ? 'wn' : tone(ctx, 'ok') },
      ])
      return (
        <Box justifyContent="space-between" alignItems="center">
          <Svg key="band" source={svg} alt={`5시간 ${pct(five)}, 주간 ${pct(week)}, 컨텍스트 ${pct(ctx)}`} />
          <Box alignItems="center" gap={1}>
            <Button key="compact" variant={hot0 ? 'primary' : 'secondary'} onPress={() => $.session.compact()}>
              <Text color={hot0 ? 'warning' : undefined}>세션 압축</Text>
            </Button>
            <Button key="close" label="✕" dimColor role="dismiss" onPress={() => setOn($, false)} />
          </Box>
        </Box>
      )
    }
    const col = (name: string, n: number | undefined, note: string) => (
      <Box key={name} marginRight={2}>
        <Text dimColor>{name} </Text>
        <Text color={color(n)}>{bar(n)}</Text>
        <Text> {pct(n)} </Text>
        <Text dimColor>{note}</Text>
      </Box>
    )
    const hot = (ctx ?? 0) >= CTX_WARN
    return (
      <Box>
        {col('5시간', five, reset(u.rateLimits, 'five_hour'))}
        {col('주간', week, reset(u.rateLimits, 'seven_day'))}
        {col('컨텍스트', ctx, hot ? '압축 권장' : '여유')}
        <Button key="compact" variant={hot ? 'primary' : 'secondary'} onPress={() => $.session.compact()}>
          <Text color={hot ? 'warning' : undefined}>세션 압축</Text>
        </Button>
        <Text> </Text>
        <Button key="close" label="✕" dimColor onPress={() => setOn($, false)} />
      </Box>
    )
  })
}
