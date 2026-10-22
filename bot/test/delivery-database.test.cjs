const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Pool } = require('pg')
const { DeliveryStore } = require('../.build/delivery-store')

test('persistent delivery state and chat lifecycle', {skip:process.env.TEST_DELIVERY_STATE!=='1'}, async t => {
  assert.equal(process.env.PGDATABASE,'greader_limits_test')
  const pool=new Pool({max:5})
  const store=new DeliveryStore(pool)
  let feedId=1000
  async function reset() {
    await pool.query('TRUNCATE deliveries,subscriptions,users,api CASCADE')
    await pool.query("UPDATE delivery_runtime SET not_before='-infinity'")
  }
  async function user(chat) { await pool.query('INSERT INTO users(chat_id) VALUES($1) ON CONFLICT DO NOTHING',[chat]) }
  async function feed() {
    const id=++feedId
    await pool.query("INSERT INTO feeds(id,url,title,last_update_time,next_update_time,most_recent_item) VALUES($1,$2,'Feed',now(),now(),now())",[id,`https://example.invalid/${id}`])
    return id
  }
  async function sub(chat,feed_id,active=true) {
    await user(chat)
    return (await pool.query('INSERT INTO subscriptions(chat_id,feed_id,last_sent,active) VALUES($1,$2,now(),$3) RETURNING id',[chat,feed_id,active])).rows[0].id
  }
  async function item(feed_id,guid,date='2020-01-01') {
    return (await pool.query("INSERT INTO feed_items(feed_id,guid,title,url,date) VALUES($1,$2,'Article',$3,$4) RETURNING id",[feed_id,guid,`https://example.invalid/${guid}`,date])).rows[0].id
  }
  async function ready() {
    await pool.query("UPDATE users SET delivery_next_at='-infinity'")
    await pool.query("UPDATE delivery_runtime SET not_before='-infinity'")
  }
  async function state() { return (await pool.query('SELECT * FROM deliveries ORDER BY id')).rows }
  try {
    await t.test('equal/old feed timestamps queue once; a later item cannot bypass a pending retry',async()=>{
      await reset()
      const f=await feed(),s=await sub('123',f)
      const a=await item(f,'a'),b=await item(f,'b')
      await store.withBatch(async batch=>{
        await batch.prepare()
        await batch.prepare()
        assert.equal((await state()).length,2)
        const first=await batch.claim()
        assert.equal(Number(first.feed_item_id),a)
        assert.equal(first.attempts,1)
        await batch.retry(first,'503')
        await ready()
        assert.equal(await batch.claim(),null)
        const retry=(await state())[0]
        assert.equal(retry.status,'pending')
        assert.ok(retry.next_attempt_at-retry.updated_at>=29000)
        await pool.query("UPDATE deliveries SET next_attempt_at='-infinity' WHERE id=$1",[first.id])
        const again=await batch.claim()
        assert.equal(again.attempts,2)
        await batch.sent(again,{message_id:42,chat:{id:123}})
        await ready()
        const second=await batch.claim()
        assert.equal(Number(second.feed_item_id),b)
        await batch.sent(second,{message_id:43,chat:{id:123}})
      })
      assert.deepEqual((await state()).map(r=>r.status),['sent','sent'])
      assert.equal((await pool.query('SELECT * FROM unsubscriptions WHERE subscription_id=$1',[s])).rowCount,2)
      await pool.query("UPDATE deliveries SET updated_at=now()-interval '8 days'")
      await store.withBatch(async batch=>{await batch.prepare();assert.equal(await batch.claim(),null)})
      assert.equal((await state()).length,0,'retention cleanup must not requeue sent items')
    })

    await t.test('three attempts and the age limit are terminal; flood waits are respected',async()=>{
      await reset()
      const f=await feed();await sub('123',f);await item(f,'retry-budget')
      await store.withBatch(async batch=>{
        await batch.prepare()
        for(let attempt=1;attempt<=3;attempt++) {
          await ready()
          await pool.query("UPDATE deliveries SET next_attempt_at='-infinity'")
          const row=await batch.claim()
          assert.equal(row.attempts,attempt)
          await batch.retry(row,'flood',90,true)
          assert.equal(await batch.claim(),null)
          const remaining=(await pool.query('SELECT extract(epoch FROM not_before-now()) AS seconds FROM delivery_runtime')).rows[0]
          assert.ok(Number(remaining.seconds)>85)
        }
        assert.equal((await state())[0].status,'skipped')
        await item(f,'expired')
        await batch.prepare()
        await pool.query("UPDATE deliveries SET expires_at=now()-interval '1 second' WHERE status='pending'")
        await batch.prepare()
        assert.ok((await state()).every(r=>r.status==='skipped'))
      })
    })

    await t.test('restart after an uncertain send skips it; separate workers cannot overlap',async()=>{
      await reset()
      const f=await feed();await sub('123',f);await item(f,'interrupted')
      const second=new DeliveryStore(pool)
      await store.withBatch(async batch=>{
        await batch.prepare()
        assert.ok(await batch.claim())
        let entered=false
        await second.withBatch(async()=>{entered=true})
        assert.equal(entered,false)
      })
      await second.withBatch(async batch=>{
        await batch.prepare()
        assert.equal(await batch.claim(),null)
      })
      assert.equal((await state())[0].status,'skipped')
    })

    await t.test('receipt transaction failure rolls back and recovery never resends the acknowledged message',async()=>{
      await reset()
      const f=await feed();await sub('123',f);await item(f,'receipt-failure')
      await pool.query('ALTER TABLE unsubscriptions ADD CONSTRAINT test_receipt_failure CHECK(msg_id<0) NOT VALID')
      try {
        await store.withBatch(async batch=>{
          await batch.prepare()
          const row=await batch.claim()
          await assert.rejects(batch.sent(row,{message_id:99,chat:{id:123}}),/test_receipt_failure/)
        })
        assert.equal((await state())[0].status,'sending')
        await store.withBatch(async batch=>{await batch.prepare();assert.equal(await batch.claim(),null)})
        assert.equal((await state())[0].status,'skipped')
      } finally {await pool.query('ALTER TABLE unsubscriptions DROP CONSTRAINT test_receipt_failure')}
    })

    await t.test('pause stops all subscriptions and resume never revives manual unsubscriptions or replays the gap',async()=>{
      await reset()
      const f=await feed(),g=await feed(),h=await feed()
      const a=await sub('123',f),b=await sub('123',g),manual=await sub('123',h,false)
      await item(f,'before-block')
      await store.withBatch(async batch=>{await batch.prepare();await batch.pause(await batch.claim(),'blocked')})
      assert.equal((await pool.query("SELECT active_count FROM subscription_limits WHERE chat_id='123'")).rows[0].active_count,0)
      assert.equal((await state())[0].status,'cancelled')
      await item(f,'while-blocked')
      // Explicitly remove one of the automatically paused subscriptions.
      await pool.query('UPDATE subscriptions SET active=false,delivery_paused=false WHERE id=$1',[b])
      assert.deepEqual(await store.resume('123'),{restored:1,remaining:0})
      const rows=(await pool.query('SELECT id,active FROM subscriptions ORDER BY id')).rows
      assert.deepEqual(rows.map(r=>[r.id,r.active]),[[a,true],[b,false],[manual,false]])
      await store.withBatch(async batch=>{await batch.prepare();await ready();assert.equal(await batch.claim(),null)})
      await item(f,'after-unblock')
      await store.withBatch(async batch=>{await batch.prepare();assert.ok(await batch.claim())})
    })

    await t.test('migration merges overlapping feeds, receipts and API aliases without duplicate sends',async()=>{
      await reset()
      const f=await feed(),g=await feed(),h=await feed()
      const old=await sub('-401',f),target=await sub('-100401',f)
      await sub('-401',g);await sub('-100401',h)
      await pool.query("INSERT INTO api(chat_id,hash) VALUES('-401','old-hash'),('-100401','new-hash')")
      const i=await item(f,'migration')
      await store.withBatch(async batch=>{await batch.prepare()})
      await pool.query("UPDATE deliveries SET status='sent',telegram_message_id=7 WHERE subscription_id=$1",[target])
      await pool.query("INSERT INTO unsubscriptions(chat_id,msg_id,subscription_id) VALUES('-401',4,$1)",[old])
      await store.migrate('-401','-100401')
      await store.migrate('-401','-100401')
      const counts=(await pool.query("SELECT chat_id,active_count FROM subscription_limits WHERE chat_id IN('-401','-100401') ORDER BY chat_id")).rows
      assert.deepEqual(counts,[{chat_id:'-100401',active_count:3},{chat_id:'-401',active_count:0}])
      const d=await state()
      assert.equal(d.length,1)
      assert.equal(d[0].status,'sent')
      assert.equal(Number(d[0].feed_item_id),i)
      assert.equal(d[0].subscription_id,target)
      assert.equal((await pool.query("SELECT subscription_id FROM unsubscriptions WHERE chat_id='-401' AND msg_id=4")).rows[0].subscription_id,target)
      assert.equal((await pool.query("SELECT coalesce(u.migrated_to_chat_id,a.chat_id) AS chat_id FROM api a JOIN users u USING(chat_id) WHERE hash='old-hash'")).rows[0].chat_id,'-100401')
    })

    await t.test('migration of an in-flight rejected send retries only in the new group',async()=>{
      await reset()
      const f=await feed();await sub('-402',f);await item(f,'migrate-response')
      await store.withBatch(async batch=>{
        await batch.prepare()
        const old=await batch.claim()
        await batch.migrate(old,'-100402')
        await ready()
        const redirected=await batch.claim()
        assert.equal(redirected.chat_id,'-100402')
        assert.equal(redirected.attempts,2)
        await batch.sent(redirected,{message_id:5,chat:{id:-100402}})
      })
    })

    await t.test('a migration union above the cap is preserved paused; resume respects 100',async()=>{
      await reset()
      const feeds=[]
      for(let n=0;n<101;n++) feeds.push(await feed())
      for(const f of feeds.slice(0,60)) await sub('-403',f)
      for(const f of feeds.slice(41)) await sub('-100403',f)
      await store.migrate('-403','-100403')
      assert.equal((await pool.query("SELECT count(*) FROM subscriptions WHERE chat_id='-100403'")).rows[0].count,'101')
      assert.deepEqual(await store.resume('-100403'),{restored:100,remaining:1})
      const mismatch=await pool.query(`SELECT l.chat_id FROM subscription_limits l LEFT JOIN subscriptions s USING(chat_id)
        GROUP BY l.chat_id,l.active_count HAVING l.active_count<>count(*) FILTER(WHERE s.active)`)
      assert.equal(mismatch.rowCount,0)
    })
  } finally {await pool.end()}
})
