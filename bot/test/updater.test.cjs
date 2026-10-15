const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const item = id => ({
  chat_id: `chat-${id}`, feed_id: id, subscription_id: id,
  item_title: 'Article', feed_title: 'Feed', item_url: 'https://example.invalid/article',
  item_date: '2026-10-15T00:00:00Z'
})

function loadUpdater(db) {
  const exports = {}
  const logs = []
  vm.runInNewContext(readFileSync(path.join(__dirname, '../.build/updater.js'), 'utf8'), {
    exports,
    require(name) {
      if (name === './db') return db
      if (name === './sanitize') return require('../.build/sanitize.js')
      throw Error(`Unexpected dependency: ${name}`)
    },
    console: { log: (...args) => logs.push(args) }
  }, { filename: 'updater.js' })
  return { updateAll: exports.updateAll, logs }
}

test('slow query, cursor write, send, and mapping each keep later polls out', async () => {
  const gates = [deferred(), deferred(), deferred(), deferred()]
  const calls = { queries: 0, writes: 0, sends: 0, mappings: 0 }
  const { updateAll } = loadUpdater({
    feedItems: { selectUpdates: async () => ++calls.queries === 1 ? gates[0].promise : { rows: [] } },
    subscriptions: { updateLastSent: async () => { calls.writes++; await gates[1].promise } },
    unsubscriptions: { insert: async () => { calls.mappings++; await gates[3].promise } }
  })
  const telegram = { sendMessage: async () => {
    calls.sends++
    await gates[2].promise
    return { chat: { id: 'chat-1' }, message_id: 1 }
  } }
  let finished = false
  const first = updateAll(telegram).then(() => { finished = true })
  const laterPolls = []
  for (let stage = 0; stage < gates.length; stage++) {
    // Simulate dozens of timer ticks while this part of a batch is stalled.
    for (let tick = 0; tick < 40; tick++) laterPolls.push(updateAll(telegram))
    await flush()
    assert.equal(calls.queries, 1, `overlapping query at stage ${stage}`)
    assert.equal(finished, false, `batch finished prematurely at stage ${stage}`)
    gates[stage].resolve(stage === 0 ? { rows: [item(1)] } : undefined)
    await flush()
  }
  await Promise.all([first, ...laterPolls])
  assert.deepEqual(calls, { queries: 1, writes: 1, sends: 1, mappings: 1 })
  await updateAll(telegram)
  assert.equal(calls.queries, 2, 'polling must resume after the batch completes')
})

test('one rejected send cannot release the guard while another delivery is pending', async () => {
  const slowSend = deferred()
  let queries = 0
  const written = []
  const mapped = []
  const { updateAll, logs } = loadUpdater({
    feedItems: { selectUpdates: async () => { queries++; return { rows: [item(1), item(2)] } } },
    subscriptions: { updateLastSent: async chat => { written.push(chat) } },
    unsubscriptions: { insert: async chat => { mapped.push(chat) } }
  })
  const telegram = { sendMessage: async chat => {
    if (chat === 'chat-1') throw Error('simulated blocked user')
    await slowSend.promise
    return { chat: { id: chat }, message_id: 2 }
  } }
  let finished = false
  const first = updateAll(telegram).then(() => { finished = true })
  await flush()
  const second = updateAll(telegram)
  await flush()
  assert.equal(queries, 1)
  assert.equal(finished, false)
  // Existing send-error/cursor policy is intentionally preserved by this fix.
  assert.deepEqual(written, ['chat-1', 'chat-2'])
  assert.equal(logs.length, 1)
  slowSend.resolve()
  await Promise.all([first, second])
  assert.deepEqual(mapped, ['chat-2'])
})

test('a rejected database query releases the guard for the next poll', async () => {
  let queries = 0
  const { updateAll } = loadUpdater({
    feedItems: { selectUpdates: async () => {
      if (++queries === 1) throw Error('temporary database failure')
      return { rows: [] }
    } }
  })
  await assert.rejects(updateAll({}), /temporary database failure/)
  await updateAll({})
  assert.equal(queries, 2)
})

test('a failed mapping also releases the guard after the batch settles', async () => {
  let queries = 0
  const { updateAll, logs } = loadUpdater({
    feedItems: { selectUpdates: async () => ({ rows: ++queries === 1 ? [item(1)] : [] }) },
    subscriptions: { updateLastSent: async () => {} },
    unsubscriptions: { insert: async () => { throw Error('mapping write failed') } }
  })
  await updateAll({ sendMessage: async () => ({ chat: { id: 'chat-1' }, message_id: 1 }) })
  await updateAll({})
  assert.equal(queries, 2)
  assert.equal(logs.length, 1)
})

test('the timer catches a failed poll and continues invoking later polls', async () => {
  let poll, interval, calls = 0
  const logs = []
  class FakeBot {
    constructor() { this.telegram = {} }
    static log() { return () => {} }
    use() {}
    start() {}
    command() {}
    action() {}
    on() {}
    launch() {}
  }
  vm.runInNewContext(readFileSync(path.join(__dirname, '../.build/index.js'), 'utf8'), {
    exports: {},
    process: { env: { BOT_TOKEN: 'test-only' } },
    require(name) {
      if (name === 'telegraf') return { Telegraf: FakeBot }
      if (name === './updater') return { updateAll: async () => {
        if (++calls === 1) throw Error('temporary database failure')
      } }
      if (name === './handlers') return {}
      if (name.startsWith('./middleware/')) return () => {}
      throw Error(`Unexpected dependency: ${name}`)
    },
    setInterval(callback, delay) { poll = callback; interval = delay },
    console: { log: (...args) => logs.push(args) }
  }, { filename: 'index.js' })
  await flush()
  assert.equal(interval, 30000)
  assert.equal(calls, 1)
  assert.equal(logs.length, 1)
  assert.match(logs[0].join(' '), /temporary database failure/)
  poll()
  await flush()
  assert.equal(calls, 2)
})
