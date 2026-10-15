const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { XMLParser, XMLValidator } = require('fast-xml-parser')
const { generateOPML } = require('../.build/opml')
const limit = require('../.build/subscription-limit')

function handler(name, db, fetch) {
  const exports = {}
  vm.runInNewContext(readFileSync(path.join(__dirname, `../.build/handlers/${name}.js`), 'utf8'), {
    exports, fetch, URL, console: { log() {} },
    require(name) {
      if (name === '../db') return db
      if (name === '../subscription-limit') return limit
      if (name === '../sanitize') return require('../.build/sanitize')
      return require(name)
    }
  })
  return exports
}

test('OPML round trips XML punctuation, whitespace and Unicode without losing URLs', () => {
  const feeds = [{ title: 'A & "B" <C> \'D\'\n\t🚀', url: 'https://example.invalid/feed?a=1&b="two"' }]
  const opml = generateOPML(feeds)
  assert.equal(XMLValidator.validate(opml), true)
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', trimValues: false })
  // This installed parser only decodes a small entity whitelist by default.
  parser.addEntity('#10', '\n')
  parser.addEntity('#9', '\t')
  const parsed = parser.parse(opml)
  assert.equal(parsed.opml.body.outline['@xmlUrl'], feeds[0].url)
  assert.equal(parsed.opml.body.outline['@title'], feeds[0].title)
  assert.equal(parsed.opml.body.outline['@text'], feeds[0].title)
  assert.equal(XMLValidator.validate(generateOPML([{ title: 'bad\x00\x1f\ud800', url: 'https://example.invalid' }])), true)
})

test('manual subscription at capacity stops before crawling and reports the limit', async () => {
  const replies = []
  const db = { subscriptions: { assertCanSubscribe: async () => { throw limit.subscriptionLimitError() } } }
  const { handleSingleSubscription } = handler('subscribe', db, () => { throw Error('must not crawl') })
  await handleSingleSubscription({ chat: { id: 1 }, reply: async text => replies.push(text) }, 'example.invalid')
  assert.deepEqual(replies, [limit.subscriptionLimitMessage])
})

test('a concurrent activation rejected by the database never sends a subscribed confirmation', async () => {
  const replies = []
  const db = {
    subscriptions: { assertCanSubscribe: async () => {}, insertNewOrUpdateLastSent: async () => { throw limit.subscriptionLimitError() } },
    feeds: { selectFeedTitle: async () => 'Example' }, feedItems: { selectTenMostRecent: async () => [] }
  }
  const { handleSingleSubscription } = handler('subscribe', db, async () => ({ status: 200, text: async () => '1' }))
  await handleSingleSubscription({ chat: { id: 1 }, reply: async text => replies.push(text) }, 'example.invalid')
  assert.deepEqual(replies, [limit.subscriptionLimitMessage])
})

test('an import stops at capacity and reports successful and skipped feeds accurately', async () => {
  let active = 99, crawls = 0
  const replies = [], edits = []
  const db = { subscriptions: {
    assertCanSubscribe: async () => { if (active >= 100) throw limit.subscriptionLimitError() },
    insertNewOrActivate: async () => { active++ }
  } }
  const opml = generateOPML([1, 2, 3].map(n => ({ title: `Feed ${n}`, url: `https://example.invalid/${n}` })))
  const { handleImportFile } = handler('import', db, async url => {
    if (url === 'local-file') return { text: async () => opml }
    crawls++
    return { status: 200, text: async () => '1' }
  })
  await handleImportFile({ chat: { id: 1 }, message: { document: { file_id: 'file' } },
    reply: async text => { replies.push(text); return { message_id: 1 } },
    telegram: { getFileLink: async () => 'local-file', editMessageText: async (...args) => edits.push(args[3]) }
  })
  assert.equal(active, 100)
  assert.equal(crawls, 1)
  assert.match(replies[0], /Found 3 feeds/)
  assert.match(edits[0], /Imported 1 feeds/)
  assert.match(edits[0], /Skipped 2 feeds/)
})

test('the API returns a clear limit error and releases its connection', async () => {
  const routes = new Map()
  let releases = 0
  const app = { use() {}, disable() {}, get(route, handler) { routes.set(route, handler) }, listen() {} }
  class Pool {
    async connect() {
      return { release() { releases++ }, async query(sql) {
        if (sql.includes('FROM api')) return { rowCount: 1, rows: [{ chat_id: '1' }] }
        throw limit.subscriptionLimitError()
      } }
    }
  }
  const source = readFileSync(path.join(__dirname, '../../api/app.js'), 'utf8').replace(/^import .+$/gm, '')
  vm.runInNewContext(source, { express: () => app, morgan: () => {}, pg: { Pool }, process: { env: { PGHOST: 'test' } }, console })
  let status, body
  const response = { status(value) { status = value; return this }, json(value) { body = value } }
  await routes.get('/api/:hash/resubscribe/:id')({ params: { hash: 'test', id: '1' } }, response)
  assert.equal(status, 409)
  assert.match(body.error, /100 active subscriptions/)
  assert.equal(releases, 2)
})
