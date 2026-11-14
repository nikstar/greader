// Run with scripts/test-empty-feeds.sh: real handlers, HTTP crawler and Postgres.
// Only Telegram replies/delivery are simulated; no Telegram credentials are used.
const assert = require('node:assert/strict')
const http = require('node:http')
const { Pool } = require('pg')

assert.equal(process.env.PGDATABASE, 'greader_empty_feed_test', 'requires disposable Postgres')
const pool = new Pool()
const { handleSingleSubscription } = require('../.build/handlers/subscribe')
const { handleImportFile } = require('../.build/handlers/import')
const { generateOPML } = require('../.build/opml')
const { updateAll } = require('../.build/updater')
const { DeliveryStore } = require('../.build/delivery-store')
const store = new DeliveryStore(pool)
const states = new Map()
const replies = [], edits = [], sends = []
let messageId = 100
const feedUrl = name => `http://127.0.0.1:9091/${name}?action=display&name=${name}&token=C%2B%2B+news`
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:9091')
  if (url.pathname === '/import.opml') {
    response.end(generateOPML([{ title: 'Imported empty feed', url: feedUrl('import') }]))
    return
  }
  assert.equal(url.searchParams.get('action'), 'display')
  assert.equal(url.searchParams.get('token'), 'C++ news')
  const name = url.pathname.slice(1)
  const populated = states.get(name) === 'populated'
  const title = `${name} feed`
  const post = `<title>First post</title><link>https://example.invalid/${name}/first</link>`
  response.setHeader('Content-Type', 'application/xml')
  if (name === 'rss') {
    response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>https://example.invalid/</link><description>Test feed</description>${populated ? `<item>${post}<guid>first</guid><pubDate>Wed, 01 Jan 2020 00:00:00 GMT</pubDate></item>` : ''}</channel></rss>`)
  } else {
    response.end(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>urn:${name}</id><title>${title}</title><updated>2026-11-14T00:00:00Z</updated><author><name>Test</name></author>${populated ? `<entry><id>first</id><title>First post</title><link href="https://example.invalid/${name}/first"/><updated>2020-01-01T00:00:00Z</updated></entry>` : ''}</feed>`)
  }
})
const context = chatId => ({
  chat: { id: chatId },
  reply: async text => {
    replies.push({ chatId, text })
    return { chat: { id: chatId }, message_id: ++messageId }
  }
})
const telegram = { callApi: async (method, payload) => {
  assert.equal(method, 'sendMessage')
  sends.push(payload)
  return { chat: { id: payload.chat_id }, message_id: ++messageId }
} }

async function crawl(url) {
  const response = await fetch(`http://127.0.0.1:9090/crawl?url=${encodeURIComponent(url)}`)
  const body = await response.text()
  assert.equal(response.status, 200, body)
  const id = Number(body)
  assert.ok(Number.isInteger(id) && id > 0, `invalid feed id: ${body}`)
  return id
}

async function main() {
  await new Promise(resolve => server.listen(9091, '127.0.0.1', resolve))
  for (let attempt = 0; ; attempt++) {
    try { await fetch('http://127.0.0.1:9090/crawl'); break } catch (error) {
      if (attempt === 99) throw error
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  for (const chat of ['atom-user', 'rss-user', 'import-user']) {
    await pool.query('INSERT INTO users(chat_id) VALUES($1)', [chat])
  }
  for (const name of ['atom', 'rss']) {
    await handleSingleSubscription(context(`${name}-user`), feedUrl(name))
    const reply = replies[replies.length - 1]
    assert.match(reply.text, /^Subscribed to /)
    assert.match(reply.text, /\n\nEmpty feed$/)
    assert.ok(!reply.text.includes('Recent posts:'))
    const result = await pool.query(`SELECT f.id,f.title,f.most_recent_item,s.active,s.delivery_cursor,
      (SELECT count(*) FROM feed_items WHERE feed_id=f.id) AS items,
      (SELECT count(*) FROM unsubscriptions WHERE subscription_id=s.id) AS reply_mappings
      FROM feeds f JOIN subscriptions s ON s.feed_id=f.id WHERE f.url=$1 AND s.chat_id=$2`, [feedUrl(name), `${name}-user`])
    assert.equal(result.rowCount, 1)
    const row = result.rows[0]
    assert.ok(row.id > 0)
    assert.equal(row.title, `${name} feed`)
    assert.equal(row.most_recent_item, null)
    assert.equal(row.active, true)
    assert.equal(Number(row.delivery_cursor), 0)
    assert.equal(Number(row.items), 0)
    assert.equal(Number(row.reply_mappings), 1)
    await pool.query("UPDATE feeds SET next_update_time=now()-interval '1 minute' WHERE id=$1", [row.id])
    assert.equal(await crawl(feedUrl(name)), row.id)
    assert.equal((await pool.query('SELECT next_update_time>now() AS scheduled FROM feeds WHERE id=$1', [row.id])).rows[0].scheduled, true)
  }
  const importContext = context('import-user')
  importContext.message = { document: { file_id: 'fixture' } }
  importContext.telegram = {
    getFileLink: async () => 'http://127.0.0.1:9091/import.opml',
    editMessageText: async (_chat, _message, _inline, text) => edits.push(text)
  }
  await handleImportFile(importContext)
  assert.equal(edits[0], 'Imported 1 feeds.')
  assert.equal(Number((await pool.query("SELECT count(*) FROM subscriptions WHERE chat_id='import-user' AND active")).rows[0].count), 1)
  await updateAll(telegram, store)
  assert.equal(sends.length, 0)
  assert.equal(Number((await pool.query('SELECT count(*) FROM deliveries')).rows[0].count), 0)
  console.log('PASS: empty Atom/RSS subscriptions and OPML import persist, confirm, and poll without phantom posts or deliveries')

  for (const name of ['atom', 'rss', 'import']) {
    states.set(name, 'populated')
    const id = await crawl(feedUrl(name))
    assert.equal(await crawl(feedUrl(name)), id)
    states.set(name, 'empty')
    assert.equal(await crawl(feedUrl(name)), id)
    const row = (await pool.query('SELECT most_recent_item,(SELECT count(*) FROM feed_items WHERE feed_id=feeds.id) AS items FROM feeds WHERE id=$1', [id])).rows[0]
    assert.equal(row.most_recent_item.toISOString(), '2020-01-01T00:00:00.000Z')
    assert.equal(Number(row.items), 1)
  }
  for (let attempt = 0; attempt < 30 && sends.length < 3; attempt++) {
    await updateAll(telegram, store)
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  await updateAll(telegram, store)
  assert.equal(sends.length, 3)
  assert.deepEqual(sends.map(send => send.chat_id).sort(), ['atom-user', 'import-user', 'rss-user'])
  for (const send of sends) assert.match(send.text, /First post/)
  assert.equal(Number((await pool.query("SELECT count(*) FROM deliveries WHERE status='sent'")).rows[0].count), 3)
  assert.equal(Number((await pool.query('SELECT count(*) FROM bad_feeds')).rows[0].count), 0)
  console.log('PASS: each first later post is delivered once, including old publication dates; later empty polls preserve posts and dates')
}

main().then(async () => {
  await pool.end()
  server.close()
  // The production db module owns a long-lived connection; this is a one-shot runner.
  process.exit(0)
}).catch(error => { console.error(error); process.exit(1) })
