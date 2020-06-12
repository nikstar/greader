import * as DB from './db'
import Parser from 'rss-parser'

export const fetchFeed = async (feedURL: string) => {
  const parser = new Parser({
    customFields: { 
      item: [ 'id', 'url', 'link' ] 
    },
    requestOptions: {
      rejectUnauthorized: false
    }
  })
  const feed = await parser.parseURL(feedURL)
  
  const mostRecentItemDate = feed.items.map(item => item.isoDate).reduce((prev, cur) => cur > prev ? cur : prev)
  await DB.feeds.insertNewOrUpdateMostRecent(feedURL, feed.title, mostRecentItemDate)
  console.log(`feedURL = ${feedURL}`)
  console.log(`Crawler: crawlFeed: ${feedURL} updating items: ${feed.items.length}`)
  feed.items.slice(0, 10).forEach(async item => {
    if (feedURL == '/') {
      throw Error("crawler: feedURL is '/'");
    }
    await DB.feedItems.insertNewOrIgnore(item.guid || item.id || item.url, item.title, item.link || item.url, item.isoDate, feedURL)
    console.log(`Crawler: found new item: ${feedURL} ${item.link || item.url}`)
  })
  return feed;
}

export const fetchAll = async () => {
  console.log('Crawler: crawlAll')
  const res = await DB.feeds.selectOutdated();
  res.rows.forEach(row => {
    fetchFeed(row.url)
      .catch(err => console.log('Crawler: error fetching ' + row.url, err))
  })
}

