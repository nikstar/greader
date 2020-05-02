import { ContextMessageUpdate } from 'telegraf'
import { db } from '../db'

export const handleStart = async (ctx: ContextMessageUpdate) => { 

  const msg = await ctx.reply('Welcome!')
  const res = await db.query('select * from users where chat_id = $1', [ctx.chat.id])
  if (res.rowCount == 0) {
    const str = 'Welcome, ' + ctx.from.first_name + '!\n\nSend me links to RSS feeds and I will follow them.'
    ctx.tg.editMessageText(ctx.chat.id, msg.message_id, null, str)
    await db.query('INSERT INTO users (chat_id) VALUES ($1);', [ctx.chat.id])
  } else {
    const str = 'Welcome back, ' + ctx.from.first_name + '!\n\nSend me links to RSS feeds and I will follow them.'
    ctx.tg.editMessageText(ctx.chat.id, msg.message_id, null, str)
  }

}