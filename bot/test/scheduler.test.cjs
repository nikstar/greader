const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const flush = () => new Promise(resolve => setImmediate(resolve))

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
  assert.equal(interval, 1000)
  assert.equal(calls, 1)
  assert.equal(logs.length, 1)
  assert.match(logs[0].join(' '), /temporary database failure/)
  poll()
  await flush()
  assert.equal(calls, 2)
})
