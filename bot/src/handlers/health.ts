import Ctx from '../ctx'
import * as DB from '../db'

export const handleHealth = async (ctx: Ctx) => { 
  const users = await DB.users.count();
  const subscriptions = await DB.subscriptions.activeCount();
  const feedItems = await DB.feedItems.count();
  const totalSize = await DB.feedItems.totalSize();   
  
  let report = `
  Users: <b>${users}</b>
Subscriptions: <b>${subscriptions}</b>
Feed items: <b>${feedItems}</b>
Database size: <b>${totalSize}</b>`
  try {
    const resp = await fetch(`http://${process.env.CRAWLER_HOST}:9090/crawl?url=https://xkcd.com/atom.xml`)
    if (resp.status != 200) {
      report += `\n\nCrawler is responding (code=${resp.status})`
    } else {
      report += `\n\nCrawler is responding`
    }
  } catch (err) {
    report += `\n\nCrawler is not responding (err=${err})`
  }

  await ctx.reply(report, { parse_mode: 'HTML', disable_web_page_preview: true })

  const stats = await DB.subscriptions.getStats();
  var statsString = `User stats (top 40):

`
  stats.slice(0, 40).forEach(stat => {
    statsString += `${stat.username == "<null>" ? "" : "@"}${stat.username} (${stat.first_name}): ${stat.total_subscriptions} (${stat.active_subscriptions})
`
  });
  await ctx.reply(statsString, { disable_web_page_preview: true })
}
