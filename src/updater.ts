
import { db } from './db'
import Telegraf, { Telegram } from 'telegraf'

export const updateAll = async (t: Telegram) => {
  console.log('Updater: updateAll')
  const res = await db.query(`SELECT s.user_id AS chat_id,i.url AS item_url,i.title AS item_title,i.date as item_date,f.url AS feed_url,f.title AS feed_title FROM subscriptions AS s JOIN feeds AS f ON s.feed=f.url JOIN feed_items AS i ON s.feed=i.feed WHERE i.date>s.last_sent and s.active ORDER BY i.date ASC;`)
  console.log('Updater: sending ' + res.rowCount + ' updates')
  res.rows.forEach(async row => {
    const str = '' + row.item_title + ' — '  + row.feed_title + '\n\n' + row.item_url
    db.query(
      'update subscriptions as s set last_sent = $1 where s.user_id = $2 AND s.feed = $3;',
      [row.item_date, row.chat_id, row.feed_url]
    )
    t.sendMessage(row.chat_id, str, { parse_mode: 'HTML' })
  })
}
