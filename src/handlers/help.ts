import Ctx from '../ctx'

export const handleHelp = async (ctx: Ctx) => { 
  let str = `Send me links and I will follow them. No need to use any commands for this.\n\nTo unsubscribe, reply /unsubscribe to any message in the feed you want to unsubscribe from.\n\nUse /list to should all your subscriptions and /export to export a list of subscriptions for other programs. /help will show this message.`
  await ctx.reply(str)
}
