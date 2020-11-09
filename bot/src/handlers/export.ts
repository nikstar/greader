import Ctx from '../shared/ctx'
import * as DB from '../shared/db'

const head = 
`<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>Export from @GReaderBot</title>
  </head>
  <body>
`

const tail = 
`  </body>
</opml>
`

function generateOMPL(feeds: DB.Feed[]): string {
  let ompl = head
  feeds.forEach(feed => {
    ompl += `    <outline type="rss" text="" title="${feed.title}" xmlUrl="${feed.url}"/>\n` // htmlUrl="..."
  })
  ompl += tail 
  return ompl
}

function date(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .split("T")[0];
}
           
export const handleExport = async (ctx: Ctx) => { 
  console.log('handler: export: ' + ctx.message.text) 
  const feeds = await DB.subscriptions.selectSubscriptionsForUser(ctx.chat.id)
  if (feeds.length == 0) {
    await ctx.reply(`You don't have any subscriptions. Send me links to subscribe.`)
    return
  }
  let ompl = generateOMPL(feeds)
  await ctx.replyWithDocument({
    filename: `greader-export-${date()}.ompl`,
    source: Buffer.from(ompl)
  })
}