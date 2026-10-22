import { Pool, PoolClient } from 'pg'
import { MAX_ATTEMPTS } from './delivery-policy'

export class DeliveryBatch {
  constructor(private client: PoolClient) {}

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.client.query('BEGIN')
    try {
      const result = await work()
      await this.client.query('COMMIT')
      return result
    } catch (error) {
      await this.client.query('ROLLBACK').catch(() => {})
      throw error
    }
  }

  async prepare() {
    await this.transaction(async () => {
      // Only the advisory-lock holder can send. A prior unfinished attempt may
      // already have reached Telegram, so recovery deliberately skips it.
      await this.client.query(`UPDATE deliveries SET status='skipped',updated_at=now(),
        last_error='Interrupted send; delivery outcome uncertain' WHERE status='sending'`)
      await this.client.query(`UPDATE deliveries SET status='skipped',updated_at=now(),
        last_error='Retry budget exhausted' WHERE status='pending' AND (expires_at<=now() OR attempts>=$1)`, [MAX_ATTEMPTS])
      await this.client.query(`WITH candidates AS MATERIALIZED (
        SELECT s.id AS subscription_id,i.id AS feed_item_id,i.date,i.title,i.url,f.title AS feed_title
        FROM subscriptions s JOIN users u ON u.chat_id=s.chat_id
        JOIN feeds f ON f.id=s.feed_id JOIN feed_items i ON i.feed_id=s.feed_id AND i.id>s.delivery_cursor
        WHERE s.active AND u.delivery_paused_at IS NULL AND u.migrated_to_chat_id IS NULL
        ORDER BY i.id,s.id LIMIT 500 FOR UPDATE OF s SKIP LOCKED
      ), inserted AS (
        INSERT INTO deliveries(subscription_id,feed_item_id,item_date,item_title,item_url,feed_title)
        SELECT subscription_id,feed_item_id,date,title,url,feed_title FROM candidates
        ON CONFLICT(subscription_id,feed_item_id) DO NOTHING
      ) UPDATE subscriptions s SET delivery_cursor=c.last_id FROM
        (SELECT subscription_id,max(feed_item_id) AS last_id FROM candidates GROUP BY subscription_id) c
        WHERE s.id=c.subscription_id`)
      await this.client.query(`DELETE FROM deliveries WHERE id IN (
        SELECT id FROM deliveries WHERE status IN('sent','skipped','cancelled')
        AND updated_at<now()-interval '7 days' ORDER BY updated_at LIMIT 1000)`)
    })
  }

  async claim() {
    return this.transaction(async () => {
      const result = await this.client.query(`SELECT d.*,s.chat_id
        FROM deliveries d JOIN subscriptions s ON s.id=d.subscription_id JOIN users u ON u.chat_id=s.chat_id
        WHERE d.status='pending' AND d.next_attempt_at<=now() AND d.expires_at>now() AND d.attempts<$1
          AND s.active AND u.delivery_paused_at IS NULL AND u.migrated_to_chat_id IS NULL
          AND u.delivery_next_at<=now() AND (SELECT not_before<=now() FROM delivery_runtime)
          AND NOT EXISTS (SELECT 1 FROM deliveries earlier JOIN subscriptions es ON es.id=earlier.subscription_id
            WHERE es.chat_id=s.chat_id AND earlier.status IN('pending','sending') AND earlier.id<d.id)
        ORDER BY d.id LIMIT 1 FOR UPDATE OF u SKIP LOCKED`, [MAX_ATTEMPTS])
      const row = result.rows[0]
      if (!row) return null
      const claimed = await this.client.query(`UPDATE deliveries SET status='sending',attempts=attempts+1,updated_at=now()
        WHERE id=$1 AND status='pending' AND EXISTS(SELECT 1 FROM subscriptions WHERE id=$2 AND active)`, [row.id, row.subscription_id])
      if (!claimed.rowCount) return null
      await this.client.query(`UPDATE users SET delivery_next_at=now()+$2*interval '1 second' WHERE chat_id=$1`,
        [row.chat_id, row.chat_id.startsWith('-') ? 4 : 2])
      await this.client.query("UPDATE delivery_runtime SET not_before=now()+interval '100 milliseconds'")
      return { ...row, attempts: row.attempts + 1 }
    })
  }

  async sent(row: any, message: any) {
    await this.transaction(async () => {
      const result = await this.client.query(`UPDATE deliveries SET status='sent',telegram_message_id=$2,
        last_error=NULL,updated_at=now() WHERE id=$1 AND status<>'sent' RETURNING id`, [row.id, message.message_id])
      if (!result.rowCount) return
      await this.client.query(`INSERT INTO unsubscriptions(chat_id,msg_id,subscription_id)
        SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM unsubscriptions WHERE chat_id=$1 AND msg_id=$2)`,
        [String(message.chat.id), message.message_id, row.subscription_id])
      await this.client.query('UPDATE subscriptions SET last_sent=greatest(last_sent,$2) WHERE id=$1', [row.subscription_id, row.item_date])
    })
  }

  async skipped(row: any, reason: string) {
    await this.client.query("UPDATE deliveries SET status='skipped',last_error=$2,updated_at=now() WHERE id=$1 AND status='sending'", [row.id, reason])
  }

  async retry(row: any, reason: string, requestedDelay = 0, flood = false) {
    const delay = Math.max(requestedDelay, row.attempts === 1 ? 30 : 120)
    await this.transaction(async () => {
      await this.client.query(`UPDATE deliveries SET
        status=CASE WHEN attempts<$3 AND now()+$4*interval '1 second'<expires_at THEN 'pending' ELSE 'skipped' END,
        next_attempt_at=now()+$4*interval '1 second',last_error=$2,updated_at=now()
        WHERE id=$1 AND status='sending'`, [row.id, reason, MAX_ATTEMPTS, delay])
      if (flood) await this.client.query("UPDATE delivery_runtime SET not_before=greatest(not_before,now()+$1*interval '1 second')", [requestedDelay])
    })
  }

  async pause(row: any, reason: string) {
    await this.client.query('SELECT pause_delivery_chat($1,$2)', [row.chat_id, reason])
  }

  async migrate(row: any, newChatId: string) {
    await this.transaction(async () => {
      await this.client.query(`UPDATE deliveries SET status=CASE WHEN attempts<$2 THEN 'pending' ELSE 'skipped' END,
        next_attempt_at=now(),last_error='Group migrated',updated_at=now() WHERE id=$1 AND status='sending'`, [row.id, MAX_ATTEMPTS])
      await this.client.query('SELECT migrate_delivery_chat($1,$2)', [row.chat_id, newChatId])
    })
  }
}

export class DeliveryStore {
  constructor(private pool: Pool) {}

  async withBatch(work: (batch: DeliveryBatch) => Promise<void>) {
    const client = await this.pool.connect()
    let locked = false, broken = false
    const onError = () => { broken = true }
    client.on('error', onError)
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(714202601) AS locked')).rows[0].locked
      if (locked) await work(new DeliveryBatch(client))
    } finally {
      if (locked && !broken) await client.query('SELECT pg_advisory_unlock(714202601)').catch(() => { broken = true })
      client.removeListener('error', onError)
      client.release(broken)
    }
  }

  async pause(chatId: string|number, reason: string) {
    await this.pool.query('SELECT pause_delivery_chat($1,$2)', [String(chatId), reason])
  }

  async resume(chatId: string|number): Promise<{ restored: number, remaining: number }> {
    const result = await this.pool.query('SELECT resume_delivery_chat($1) AS result', [String(chatId)])
    return result.rows[0].result
  }

  async migrate(oldChatId: string|number, newChatId: string|number) {
    await this.pool.query('SELECT migrate_delivery_chat($1,$2)', [String(oldChatId), String(newChatId)])
  }

  async health() {
    const result = await this.pool.query(`SELECT
      (SELECT count(*) FROM users WHERE delivery_paused_at IS NOT NULL AND migrated_to_chat_id IS NULL) AS paused_chats,
      count(*) FILTER(WHERE status='pending') AS pending,
      count(*) FILTER(WHERE status='skipped' AND updated_at>now()-interval '24 hours') AS skipped_24h
      FROM deliveries`)
    return result.rows[0]
  }
}

const pool = new Pool({ max: 4, connectionTimeoutMillis: 10000 })
pool.on('error', () => console.log('delivery: idle database connection failed'))
export const deliveryStore = new DeliveryStore(pool)
