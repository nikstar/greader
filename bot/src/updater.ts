
import * as DB from './shared/db'
import Telegraf, { Telegram } from 'telegraf'
import sanitize from './shared/sanitize'

export const updateAll = async (t: Telegram) => {
  const res = await DB.feedItems.selectUpdates()
  res.rows.forEach(async row => {
    try {
      const str = `${sanitize(row.item_title)} — ${sanitize(row.feed_title)}\n\n${row.item_url}`
      await DB.subscriptions.updateLastSent(row.chat_id, row.feed_id, row.item_date)
      await t.sendMessage(row.chat_id, str, { parse_mode: 'HTML' })
    } catch (e) {
      console.log(`updater: update failed: ${e}`)
    }
  })
}
