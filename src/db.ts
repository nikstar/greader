import { Client } from 'pg'

export const db = new Client()
db.connect()

export const getSubscription = async (id: string | number): Promise<string> => {
  const r = await db.query(`select feed from subscriptions where id = $1`, [id])
  if (r.rowCount == 0) {
    throw new Error(`db.getSubscibtion: failed to find subscription id=${id}`)
  }
  return r.rows[0].feed
}

export const disableSubscribtion = async (chat_id: string|number, url: string): Promise<number> => {
  const r1 = await db.query(`select id from subscriptions where user_id = $1 and feed = $2 and active`, [chat_id, url])
  if (r1.rowCount == 0) {
    throw Error(`db: no active subscription for chat_id=${chat_id}, url=${url}`)
  }
  const id = r1.rows[0].id
  const r2 = await db.query(`update subscriptions set active = false where id = $1`, [id])
  return id  
}

export const getFeedForItemUrl = async (url: string): Promise<string> => {
  const resp = await db.query(`select feed from feed_items where url = $1 limit 1`, [url])
  if (resp.rowCount > 0) {
    return resp.rows[0].feed
  }
  throw Error(`db: no feed found for item_url=${url}`)
}

export default db

