import { ContextMessageUpdate } from 'telegraf'
import * as DB from '../db'

export const handleExport = async (ctx: ContextMessageUpdate) => { 
  console.log('handler: export: ' + ctx.message.text) 
  const res = await DB.subscriptions.selectSubscriptionsForUser(ctx.chat.id)
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