import { Client } from 'pg'

export const db = new Client()
db.connect()

export const deleteSubscribtion = async (chat_id: string|number, url: string) => {
  const resp = await db.query(`delete from subscriptions where "user" = $1 and feed = $2`, [chat_id, url])
  if (resp.rowCount == 0) {
    throw Error(`db: no subscription for chat_id=${chat_id}, url=${url}`)
  }
}

export const getFeedForItemUrl = async (url: string): Promise<string> => {
  const resp = await db.query(`select feed from feed_items where url = $1 limit 1`, [url])
  if (resp.rowCount > 0) {
    return resp.rows[0].feed
  }
  throw Error(`db: no feed found for item_url=${url}`)
}

export default db

