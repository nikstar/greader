import { Client } from 'pg'

class Table {
  db: Client
  constructor(db: Client) {
    this.db = db
  }
}

class UsersTable extends Table {
  async insert(chat_id: string|number) {
    await dbClient.query(`
      INSERT INTO users (chat_id) 
      VALUES ($1) 
      ON CONFLICT DO NOTHING;`, 
      [chat_id]
    )
  }
}

class SubscriptionsTable extends Table {
  async insertNewOrUpdateLastSent(chat_id: string|number, url: string) {
    console.log(`feeds.insertNewOrUpdateMostRecent url=${url}`)
    await dbClient.query(`
      INSERT INTO subscriptions (user_id, feed, last_sent, active) 
      VALUES                    ($1,      $2,   now(),     true  ) 
      ON CONFLICT (user_id, feed) DO 
        UPDATE SET 
          last_sent = EXCLUDED.last_sent, 
          active = true`,
      [chat_id, url]
    )
  }

  async selectSubscriptionsForUser(id: string|number) {
    const res = await dbClient.query(`
      SELECT url, title 
      FROM subscriptions as s 
        JOIN feeds AS f ON s.feed = f.url 
      WHERE s.user_id = $1 AND active 
      ORDER BY most_recent_item DESC;`, 
      [id]
    )
    return res
  }

  async selectURLForID(id: string|number) {
    const r = await dbClient.query(`select feed from subscriptions where id = $1`, [id])
    if (r.rowCount == 0) {
      throw new Error(`db.getSubscibtion: failed to find subscription id=${id}`)
    }
    return r.rows[0].feed  
  }

  async updateLastSent(chat_id: string|number, feedURL: string, date: string) {
    await dbClient.query(`
      UPDATE subscriptions 
      SET last_sent = $1 
      WHERE user_id = $2 AND feed = $3;`,
      [date, chat_id, feedURL]
    )
  }

  async updateInactive(chat_id: string|number, url: string): Promise<number> {
    const r1 = await dbClient.query(`select id from subscriptions where user_id = $1 and feed = $2 and active`, [chat_id, url])
    if (r1.rowCount == 0) {
      throw Error(`db: no active subscription for chat_id=${chat_id}, url=${url}`)
    }
    const id = r1.rows[0].id
    const r2 = await dbClient.query(`update subscriptions set active = false where id = $1`, [id])
    return id  
  }
  
}

class FeedsTable extends Table {
  async insertNewOrUpdateMostRecent(url: string, title: string, mostRecentItemDate: string) {
    console.log(`feeds.insertNewOrUpdateMostRecent url=${url}`)
    await dbClient.query(`
      INSERT INTO feeds (url, title, last_update_time, next_update_time,             most_recent_item) 
      VALUES            ($1,  $2,    now(),            now() + interval '5 minutes', $3              ) 
      ON CONFLICT (url) DO 
        UPDATE SET 
          title = EXCLUDED.title, 
          last_update_time = EXCLUDED.last_update_time, 
          next_update_time = EXCLUDED.next_update_time, 
          most_recent_item = EXCLUDED.most_recent_item;`, 
      [url, title, mostRecentItemDate]
    )
  }

  async selectOutdated() {
    const res = await dbClient.query(
      `SELECT DISTINCT feeds.url FROM subscriptions JOIN feeds ON feed = feeds.url WHERE next_update_time < now();`
    )
    return res
  }
}

class FeedItemsTable extends Table {
  async insertNewOrIgnore(id: string, title: string, itemURL: string, date: string, feedURL: string) {
    await dbClient.query(`
      INSERT INTO feed_items (guid, title, url, date, feed) 
      VALUES                 ($1,   $2,    $3,  $4,   $5) 
      ON CONFLICT DO NOTHING;`,
      [id, title, itemURL, date, feedURL]
    )
  }

  async selectUpdates() {
    const res = await dbClient.query(`
      SELECT s.user_id AS chat_id,i.url AS item_url,i.title AS item_title,i.date as item_date,f.url AS feed_url,f.title AS feed_title 
      FROM subscriptions AS s 
        JOIN feeds AS f ON s.feed=f.url 
        JOIN feed_items AS i ON s.feed=i.feed 
      WHERE i.date>s.last_sent and s.active 
      ORDER BY i.date ASC;`
    )
    return res
  }

  async selectFeedForItemUrl(url: string): Promise<string> {
    const resp = await dbClient.query(`select feed from feed_items where url = $1 limit 1`, [url])
    if (resp.rowCount > 0) {
      return resp.rows[0].feed
    }
    throw Error(`db: no feed found for item_url=${url}`)
  }  
}

class BadFeedsTable extends Table {
  async insert(chat_id: string|number, url: string, err: Error) {
    dbClient.query(`
      INSERT INTO bad_feeds (user_id, url, comment) 
      VALUES                ($1,      $2,  $3);`,
      [chat_id, url, err.toString()]
    )
  }
}

const dbClient = new Client()
dbClient.connect()
export const users = new UsersTable(dbClient)
export const feeds = new FeedsTable(dbClient)
export const feedItems = new FeedItemsTable(dbClient)
export const subscriptions = new SubscriptionsTable(dbClient)
export const badFeeds = new BadFeedsTable(dbClient)
