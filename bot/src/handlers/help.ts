import Ctx from '../shared/ctx'

const help = `Send me links and I will follow them. No need to use any commands in private chat with bot but you can use /subscribe or /s in groups.

To unsubscribe, <b>reply</b> /unsubscribe or /u to any message in the feed you want to unsubscribe from, or provide a feed link direcly.

/list shows all your subscriptions
/export exports an OMPL file that can be imported in other readers
/help shows this message`

export const handleHelp = async (ctx: Ctx) => { 
  await ctx.reply(help, { parse_mode: 'HTML' })
}
