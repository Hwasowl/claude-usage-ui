import { expect, mock, test } from 'claude-code/testing'

const BAND = { plugin: 'usage-band', component: 'AbovePrompt', surface: 'desktop', props: { hasSurvey: false, isCollapsed: false } } as const
const USAGE = { startedAt: 0, context: { window: 200000, tokens: 1000, percent: 0.5 }, rateLimits: [], cost: 0 }

const engine = (on: any) => {
  mock.store(on)
  const clock = mock.clock(on)
  const runs: string[] = []
  on('command.list', () => ({ value: [{ name: 'cs-on' }, { name: 'cs-off' }] }))
  on('session.usage', () => ({ value: USAGE }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 's1' }))
  const toasts: string[] = []
  on('ui.toast', (_: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('command.run', (_: any, e: any) => {
    runs.push(e.command)
    return { text: '' }
  })
  return { clock, runs, toasts }
}

test('응답 중에 누른 세션 압축은 응답이 끝난 뒤 실행되고, 다시 누르면 취소됨', async ($, on) => {
  const { clock, runs, toasts } = engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(BAND as any)
  await ui.press({ key: 'compact' })
  await clock.settle()
  expect((await ui.find({ key: 'compact' }))?.props?.label).toBe('압축 대기 중')
  expect(runs).toEqual([])
  // 누를 때 팝업은 띄우지 않음(버튼 글자로만 알림)
  expect(toasts).toEqual([])

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await clock.advance(10)
  expect(runs).toEqual(['compact'])

  // 다음 응답 중 두 번 누르면 대기가 풀려 아무것도 실행 안 됨
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await ui.press({ key: 'compact' })
  await ui.press({ key: 'compact' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  await clock.advance(10)
  expect(runs).toEqual(['compact'])
  await ui.unmount()
})

test('백그라운드 서브에이전트 줄에 실행 시간이 나옴', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('command.list', () => ({ value: [{ name: 'cs-on' }, { name: 'cs-off' }] }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 's1' }))
  on('agent.list', () => ({ value: [{ id: 'a1', description: '조사', type: 'Explore', status: 'running' }] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: '', turnId: 'x', agentId: 'a1' })
  await clock.advance(65_000)
  const ui = await $.ui.mount(BAND as any)
  expect((await ui.find({ type: 'Text', text: /^1분 05초$/ }))?.text).toBe('1분 05초')
  await ui.unmount()
})

test('창이 좁아지면 압축 버튼 글자가 줄어듦', async ($, on) => {
  engine(on)
  const label = async (columns: number) => {
    const ui = await $.ui.mount({ ...BAND, viewport: { columns, rows: 30 } } as any)
    const v = (await ui.find({ key: 'compact' }))?.props?.label
    await ui.unmount()
    return v
  }
  expect(await label(130)).toBe('세션 압축')
  expect(await label(90)).toBe('압축')
  expect(await label(60)).toBe('⇩')
})

test('다른 세션이 저장한 5시간/주간 값이 쉬고 있는 세션에도 반영됨', async ($, on) => {
  const clock = mock.clock(on)
  const store = new Map<string, unknown>()
  on('store.get', (_: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('command.list', () => ({ value: [{ name: 'cs-on' }, { name: 'cs-off' }] }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 's1' }))
  on('agent.list', () => ({ value: [] }))
  const seen: number[] = []
  on('state.set', (_: any, e: any, next: any) => {
    if (e.key === 'usage') seen.push(e.value?.rateLimits?.[0]?.percentUsed)
    return next(e)
  })

  await $.command.run({ command: 'cs-on' })
  const ui = await $.ui.mount(BAND as any)
  // 다른 세션이 공유 저장소에 새 값을 씀
  store.set('lastLimits', [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2999-01-01T00:00:00Z' }])
  await clock.advance(10_000)
  // 저장소 읽기는 다시 그리는 계기가 안 되므로, 상태에 들어갔는지로 확인
  expect(seen.at(-1)).toBe(42)
  await ui.unmount()
})
