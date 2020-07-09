import * as DB from '../db'
import Ctx from '../ctx'

export const handleStart = async (ctx: Ctx) => { 
  let str = `Welcome`
  if (ctx.from.first_name && ctx.from.first_name.length > 1) {
    str += `, ${ctx.from.first_name}`
  }
  str += `!\n\nSend me links and I will follow them for you.`
  await ctx.reply(str)
  await DB.users.insert(ctx.chat.id)
}