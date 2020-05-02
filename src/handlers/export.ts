import { ContextMessageUpdate } from 'telegraf'
import { db } from '../db'

export const handleExport = async (ctx: ContextMessageUpdate) => { 
  console.log('handler: export: ' + ctx.message.text) 
  const res = await db.query(`select url, title from subscriptions as s join feeds as f on s.feed = f.url where s.user_id = $1 and active order by most_recent_item desc;`, [ctx.chat.id])
  if (res.rowCount == 0) {
    await ctx.reply(`You don't have any subscriptions. Send me links to subscribe.`)
    return
  }
  let msg = ``
  res.rows.forEach(row => {
    msg += `${row.url}\n`
  })
  await ctx.reply(msg)
}