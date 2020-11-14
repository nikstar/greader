import Ctx from '../shared/ctx'

const help = `
<b>Subscribing</b>
Send links to subscribe. No need to use any commands in private chat, but you can use /subscribe or /s in groups. G Reader can import OPML files from other RSS readers. 

<b>Unsubscribing</b>
To unsubscribe, <b>reply</b> /unsubscribe or /u to any message in the feed you want to unsubscribe from. Alternatively, provide a feed link direcly, e.g. /u example.com/feed.xml.

<b>Other</b>
/list shows all your subscriptions
/export exports an OPML file that can be imported in other readers

<b>Getting help</b>
G Reader is still in early days of development, and I'd love to keep improving it. Feel free to reach out <a href="https://t.me/nikstar">directly</a>, or <a href="https://github.com/nikstar/greader">create an issue</a>.
`


export const handleHelp = async (ctx: Ctx) => { 
  await ctx.reply(help, { parse_mode: 'HTML', disable_web_page_preview: true })
}
