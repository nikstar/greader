import { ContextMessageUpdate } from 'telegraf'
import * as DB from '../db'

export const handleStart = async (ctx: ContextMessageUpdate) => { 

  const msg = await ctx.reply('Welcome!')
  const res = await DB.users.select(ctx.chat.id)
  if (res.rowCount == 0) {
    const str = 'Welcome, ' + ctx.from.first_name + '!\n\nSend me links to RSS feeds and I will follow them.'
    ctx.tg.editMessageText(ctx.chat.id, msg.message_id, null, str)
    await DB.users.insert(ctx.chat.id)
  } else {
    const str = 'Welcome back, ' + ctx.from.first_name + '!\n\nSend me links to RSS feeds and I will follow them.'
    ctx.tg.editMessageText(ctx.chat.id, msg.message_id, null, str)
  }

}