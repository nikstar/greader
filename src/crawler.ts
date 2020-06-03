import { db } from './db'
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
  const res = await db.query(
    'INSERT INTO feeds (url, title, last_update_time, next_update_time, most_recent_item) VALUES ($1, $2, now(), now() + interval \'5 minutes\', $3) ON CONFLICT ("url") DO UPDATE SET title = EXCLUDED.title, last_update_time = EXCLUDED.last_update_time, next_update_time = EXCLUDED.next_update_time, most_recent_item = EXCLUDED.most_recent_item;', 
    [feedURL, feed.title, mostRecentItemDate] 
  )
  console.log(`feedURL = ${feedURL} count = ${res.rowCount}`)
  console.log(`Crawler: crawlFeed: ${feedURL} updating items: ${feed.items.length}`)
  feed.items.slice(0, 10).forEach(async item => {
    if (feedURL == '/') {
      throw Error("crawler: feedURL is '/'");
    }
    const res = await db.query(
      'INSERT INTO feed_items (guid, title, url, date, feed) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING;',
      [item.guid || item.id || item.url, item.title, item.link || item.url, item.isoDate, feedURL]
    )
    if (res.rowCount > 0) {
      console.log(`Crawler: found new item: ${feedURL} ${item.link || item.url}`)
    }
  })
  return feed;
}

export const fetchAll = async () => {
  console.log('Crawler: crawlAll')
  const res = await db.query(
    'SELECT url FROM feeds WHERE next_update_time < now();'
  ) 
  res.rows.forEach(row => {
    fetchFeed(row.url)
      .catch(err => console.log('Crawler: error fetching ' + row.url, err))
  })
}

