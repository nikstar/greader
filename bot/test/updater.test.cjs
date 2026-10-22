const assert = require('node:assert/strict')
const { test } = require('node:test')
const { updateAll } = require('../.build/updater')
const { classifyDeliveryError, deliveryText } = require('../.build/delivery-policy')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r }); return { promise, resolve } }
const flush = () => new Promise(r => setImmediate(r))
const row = { id: '1', chat_id: '123', subscription_id: 1, attempts: 1, item_title: 'Article', feed_title: 'Feed', item_url: 'https://example.invalid/a' }
const apiError = (error_code, description, parameters) => ({ response: { error_code, description, parameters } })
const storeFor = batch => ({ withBatch: async fn => fn(batch) })

test('overlapping polls stay out during queue preparation, claiming, sending and receipt storage', async () => {
  const gates = Array.from({ length: 4 }, deferred)
  let prepares=0,claims=0,sends=0,receipts=0
  const batch = {
    async prepare() { prepares++; await gates[0].promise },
    async claim() { if (claims++) return null; await gates[1].promise; return row },
    async sent() { receipts++; await gates[3].promise }
  }
  const telegram = { async callApi() { sends++; await gates[2].promise; return { message_id: 1, chat: { id: 123 } } } }
  const store=storeFor(batch)
  const first=updateAll(telegram,store)
  for (const gate of gates) {
    for(let n=0;n<40;n++) await updateAll(telegram,store)
    assert.equal(prepares,1)
    gate.resolve()
    await flush()
  }
  await first
  assert.equal(sends,1)
  assert.equal(receipts,1)
  await updateAll(telegram,store)
  assert.equal(prepares,2)
})

test('known errors get the correct bounded retry, pause, migration or skip action', async () => {
  const cases = [
    [apiError(403,'Forbidden: bot was blocked by the user'),'pause'],
    [apiError(403,'Forbidden: user is deactivated'),'pause'],
    [apiError(400,'Bad Request: chat not found'),'pause'],
    [apiError(400,'Bad Request: group chat was upgraded',{migrate_to_chat_id:-1001234567890}),'migrate'],
    [apiError(429,'Too Many Requests',{retry_after:90}),'retry'],
    [apiError(503,'Service Unavailable'),'retry'],
    [{code:'ECONNREFUSED'},'retry'],
    [{code:'ECONNRESET'},'skip'],
    [{name:'AbortError'},'skip'],
    [apiError(400,'Bad Request: message is too long'),'skip']
  ]
  for (const [error,expected] of cases) {
    let claims=0
    const actions=[]
    const batch={ prepare:async()=>{}, claim:async()=>claims++ ? null : row,
      sent:async()=>{throw Error('must not acknowledge a rejected send')},
      pause:async(...args)=>actions.push(['pause',...args]),
      migrate:async(...args)=>actions.push(['migrate',...args]),
      retry:async(...args)=>actions.push(['retry',...args]),
      skipped:async(...args)=>actions.push(['skip',...args]) }
    await updateAll({callApi:async()=>{throw error}},storeFor(batch))
    assert.equal(actions.length,1)
    assert.equal(actions[0][0],expected)
  }
  assert.deepEqual(classifyDeliveryError(apiError(429,'flood',{retry_after:90})), {kind:'retry',reason:'flood',delay:90,flood:true})
})

test('a failed receipt write never retries the already successful Telegram send', async () => {
  let sends=0, claims=0, retries=0
  const batch={prepare:async()=>{},claim:async()=>claims++?null:row,
    sent:async()=>{throw Error('database disconnected after send')},retry:async()=>{retries++}}
  await assert.rejects(updateAll({callApi:async()=>{sends++;return {message_id:1,chat:{id:123}}}},storeFor(batch)), /database disconnected/)
  assert.equal(sends,1)
  assert.equal(retries,0)
  await updateAll({},storeFor({prepare:async()=>{},claim:async()=>null}))
})

test('a failed preparation releases the polling guard', async () => {
  await assert.rejects(updateAll({},storeFor({prepare:async()=>{throw Error('temporary database failure')}})), /temporary database failure/)
  let prepared=false
  await updateAll({},storeFor({prepare:async()=>{prepared=true},claim:async()=>null}))
  assert.equal(prepared,true)
})

test('messages are plain text and fit Telegram limits without dropping normal URLs', () => {
  const url='https://example.invalid/?a=1&b=2'
  const text=deliveryText({item_title:'<&>'.repeat(3000),feed_title:'Feed',item_url:url})
  assert.ok(text.length<=4096)
  assert.ok(text.endsWith(url))
  assert.ok(text.startsWith('<&>'))
})

test('a hung request is aborted after 15 seconds and is not retried', async () => {
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
  const exports={}
  let abort,timeout,claims=0,skips=0
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../.build/updater.js'),'utf8'),{
    exports,AbortController,console:{log(){}},
    require(name) { return name==='./delivery-policy' ? require('../.build/delivery-policy') : {} },
    setTimeout(fn,ms) {abort=fn;timeout=ms;return 1},clearTimeout(){}
  })
  const promise=exports.updateAll({callApi:async(_method,_payload,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject({name:'AbortError'}))
  })},storeFor({prepare:async()=>{},claim:async()=>claims++?null:row,skipped:async()=>{skips++}}))
  await flush()
  assert.equal(timeout,15000)
  abort()
  await promise
  assert.equal(skips,1)
})
