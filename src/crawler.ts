import { db } from './db'
import Parser from 'rss-parser'

export const fetchFeed = async (url: string) => {
  const parser = new Parser({
    customFields: { 
      item: [ 'id', 'url', 'link' ] 
    }
  })
  const feed = await parser.parseURL(url)
  
  const most_recent_item = feed.items.map(item => item.isoDate).reduce((prev, cur) => cur > prev ? cur : prev)
  const res = await db.query(
    'INSERT INTO feeds (url, title, last_update_time, next_update_time, most_recent_item) VALUES ($1, $2, now(), now() + interval \'10 minutes\', $3) ON CONFLICT ("url") DO UPDATE SET title = EXCLUDED.title, last_update_time = EXCLUDED.last_update_time, next_update_time = EXCLUDED.next_update_time, most_recent_item = EXCLUDED.most_recent_item;', 
    [url, feed.title, most_recent_item] 
  )
  console.log('Crawler: crawlFeed: ' + url + ' updating items: ' + feed.items.length)
  feed.items.slice(0, 10).forEach(async item => {
    await db.query(
      'INSERT INTO feed_items (guid, title, url, date, feed) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING;',
      [item.guid || item.id || item.url, item.title, item.link || item.url, item.isoDate, url]
    )
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

