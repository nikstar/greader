import Ctx from '../ctx'
import * as DB from '../db'
import fetch from 'node-fetch'

export const handleHealth = async (ctx: Ctx) => { 
  const users = await DB.users.count();
  const subscriptions = await DB.subscriptions.activeCount();
  const feedItems = await DB.feedItems.count();
  const totalSize = await DB.feedItems.totalSize();   
  
  let report = `
  There are <b>${users}</b> users with <b>${subscriptions}</b> subscriptions. Database contains <b>${feedItems}</b> feed items and takes up <b>${totalSize}</b>.`
  try {
    const resp = await fetch(`http://${process.env.CRAWLER_HOST}:9090/crawl?url=https://xkcd.com/atom.xml`)
    if (resp.status != 200) {
      report += ` Crawler is responding (code=${resp.status}).`
    } else {
      report += ` Crawler is responding.`
    }
  } catch (err) {
    report += ` Crawler is not responding (err=${err}).`
  }

  await ctx.reply(report, { parse_mode: 'HTML', disable_web_page_preview: true })
}
