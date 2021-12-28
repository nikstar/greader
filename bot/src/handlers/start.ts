import Ctx from '../ctx'

export const handleStart = async (ctx: Ctx) => { 
  let str = `Welcome`
  if (ctx.from.first_name && ctx.from.first_name.length > 1) {
    str += `, ${ctx.from.first_name}`
  }
  str += `!\n\nSend me links and I will follow them for you.`
  if (ctx.chat?.type == 'private') {
    str += ` No need to use any commands.`
  }
  await ctx.reply(str)
}