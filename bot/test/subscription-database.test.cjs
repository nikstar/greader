const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Pool } = require('pg')

test('database limit is atomic across inserts, imports, reactivation, deletion and rollback',
  { skip: process.env.TEST_SUBSCRIPTION_LIMITS !== '1' }, async () => {
  assert.equal(process.env.PGDATABASE, 'greader_limits_test', 'must use the isolated test database')
  const pool = new Pool({ max: 20 })
  const add = (chat, feed, active = true) => pool.query(`INSERT INTO subscriptions(chat_id,feed_id,last_sent,active)
    VALUES($1,$2,now(),$3) ON CONFLICT(chat_id,feed_id) DO UPDATE SET active=EXCLUDED.active`, [chat, feed, active])
  const count = async chat => Number((await pool.query('SELECT count(*) FROM subscriptions WHERE chat_id=$1 AND active', [chat])).rows[0].count)
  const limited = e => e.code === 'P0001' && e.message === 'SUBSCRIPTION_LIMIT_REACHED'
  try {
    await pool.query("INSERT INTO users(chat_id) VALUES ('normal'),('import'),('move')")
    for (let i=1; i<=99; i++) await add('normal', i)
    const concurrent = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => add('normal', i+100)))
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(concurrent.filter(r => r.status === 'rejected' && limited(r.reason)).length, 39)
    assert.equal(await count('normal'), 100)
    await add('normal', 1) // already active is idempotent, even at capacity
    await pool.query("INSERT INTO subscriptions(chat_id,feed_id,last_sent) VALUES('normal',1,now()) ON CONFLICT DO NOTHING")
    await add('normal', 149, false)
    await assert.rejects(add('normal', 149), limited)
    await pool.query("UPDATE subscriptions SET active=false WHERE chat_id='normal' AND feed_id=1")
    await add('normal', 149)
    assert.equal(await count('normal'), 100)
    await pool.query("DELETE FROM subscriptions WHERE chat_id='normal' AND feed_id=2")
    await add('normal', 150)
    assert.equal(await count('normal'), 100)

    // A bulk import that would exceed 100 rolls back all rows and counters.
    await assert.rejects(pool.query("INSERT INTO subscriptions(chat_id,feed_id,last_sent) SELECT 'import',id,now() FROM feeds LIMIT 101"), limited)
    assert.equal(await count('import'), 0)
    const tx = await pool.connect()
    try {
      await tx.query('BEGIN')
      await tx.query("INSERT INTO subscriptions(chat_id,feed_id,last_sent) VALUES('import',1,now())")
      await tx.query('ROLLBACK')
    } finally { tx.release() }
    assert.equal(await count('import'), 0)

    for (let i=1; i<=150; i++) await add('700001', i) // exempt owner
    assert.equal(await count('700001'), 150)
    assert.equal(await count('legacy'), 150) // backfilled before the migration
    await assert.rejects(add('legacy', 151), limited)
    await pool.query("UPDATE subscriptions SET active=false WHERE chat_id='legacy' AND feed_id<=51")
    await add('legacy', 151)
    assert.equal(await count('legacy'), 100)

    await add('move', 152)
    await assert.rejects(pool.query("UPDATE subscriptions SET chat_id='normal' WHERE chat_id='move'"), limited)
    assert.equal(await count('move'), 1)
    const mismatch = await pool.query(`SELECT l.chat_id FROM subscription_limits l LEFT JOIN subscriptions s USING(chat_id)
      GROUP BY l.chat_id,l.active_count HAVING l.active_count <> count(*) FILTER(WHERE s.active)`)
    assert.equal(mismatch.rowCount, 0)
    await pool.query('TRUNCATE subscriptions')
    assert.equal((await pool.query('SELECT * FROM subscription_limits WHERE active_count <> 0')).rowCount, 0)
  } finally { await pool.end() }
})
