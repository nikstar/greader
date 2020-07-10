
import * as DB from './db'
import Telegraf, { Telegram } from 'telegraf'

export const updateAll = async (t: Telegram) => {
  console.log('Updater: updateAll')
  const res = await DB.feedItems.selectUpdates()
  console.log('Updater: sending ' + res.rowCount + ' updates')
  res.rows.forEach(async row => {
    try {
      const str = '' + row.item_title + ' — '  + row.feed_title + '\n\n' + row.item_url
      await DB.subscriptions.updateLastSent(row.chat_id, row.feed_url, row.item_date)
      await t.sendMessage(row.chat_id, str, { parse_mode: 'HTML' })
    } catch (e) {
      console.log(`updater: update failed: ${e}`)
    }
  })
}
