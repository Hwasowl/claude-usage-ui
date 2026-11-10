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
  // 대기하는 동안 알림이 계속 다시 뜸
  await clock.advance(5000)
  expect(toasts.filter(t => t === '응답이 끝나면 세션을 압축합니다.').length).toBeGreaterThan(5)

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await clock.advance(10)
  expect(runs).toEqual(['compact'])
  // 압축이 시작되면 알림도 멈춤
  const n = toasts.length
  await clock.advance(5000)
  expect(toasts.length).toBe(n)

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
  on('agent.list', () => ({ value: [{ id: 'a1', description: '조사', type: 'Explore', status: 'running' }] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: '', turnId: 'x', agentId: 'a1' })
  await clock.advance(65_000)
  const ui = await $.ui.mount(BAND as any)
  expect((await ui.find({ type: 'Text', text: /^1분 05초$/ }))?.text).toBe('1분 05초')
  await ui.unmount()
})
