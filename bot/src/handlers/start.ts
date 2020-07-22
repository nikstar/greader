import Ctx from '../shared/ctx'
import * as DB from '../shared/db'

export const handleStart = async (ctx: Ctx) => { 
  let str = `Welcome`
  if (ctx.from.first_name && ctx.from.first_name.length > 1) {
    str += `, ${ctx.from.first_name}`
  }
  str += `!\n\nSend me links and I will follow them for you.`
  await ctx.reply(str)
}