import { Client } from 'pg'

class Table {
  db: Client
  constructor(db: Client) {
    this.db = db
  }
}

class UsersTable extends Table {
  async insert(chat_id: string|number): Promise<boolean> {
    const r = await this.db.query(`
      INSERT INTO users (chat_id) 
      VALUES ($1) 
      ON CONFLICT DO NOTHING;`, 
      [chat_id]
    )
    return r.rowCount > 0
  }
}

class SubscriptionsTable extends Table {
  // TODO: use ids in the table itself
  async insertNewOrUpdateLastSent(chat_id: string|number, feed_id: number) {
    const r1 = await this.db.query(`
      SELECT url
      FROM feeds2
      WHERE id = $1`,
      [feed_id]
    )
    await this.db.query(`
      INSERT INTO subscriptions (user_id, feed, last_sent, active) 
      VALUES                    ($1,      $2,   now(),     true  ) 
      ON CONFLICT (user_id, feed) DO 
        UPDATE SET 
          last_sent = EXCLUDED.last_sent, 
          active = true`,
      [chat_id, r1.rows[0].url]
    )
  }

  async selectSubscriptionsForUser(id: string|number) {
    const res = await this.db.query(`
      SELECT url, title 
      FROM subscriptions as s 
        JOIN feeds2 AS f ON s.feed = f.url 
      WHERE s.user_id = $1 AND active 
      ORDER BY most_recent_item DESC;`, 
      [id]
    )
    return res
  }

  async selectURLForID(id: string|number) {
    const r = await this.db.query(`select feed from subscriptions where id = $1`, [id])
    if (r.rowCount == 0) {
      throw new Error(`db.getSubscibtion: failed to find subscription id=${id}`)
    }
    return r.rows[0].feed  
  }

  async updateLastSent(chat_id: string|number, feedURL: string, date: string) {
    await this.db.query(`
      UPDATE subscriptions 
      SET last_sent = $1 
      WHERE user_id = $2 AND feed = $3;`,
      [date, chat_id, feedURL]
    )
  }

  async updateInactive(chat_id: string|number, feed_id: string|number): Promise<number> {
    const r1 = await this.db.query(`
      SELECT s.id 
      FROM subscriptions AS s 
        JOIN feeds2 as f ON s.feed = f.url 
      WHERE user_id = $1 AND f.id = $2 AND active`, 
      [chat_id, feed_id])
    if (r1.rowCount == 0) {
      throw Error(`db: no active subscription for chat_id=${chat_id}, feed_id=${feed_id}`)
    }
    const id = r1.rows[0].id
    const r2 = await this.db.query(`update subscriptions set active = false where id = $1`, [id])
    return id  
  }
  
}

class FeedsTable extends Table {
  async selectFeedTitle(id: number): Promise<string> {
    const r1 = await this.db.query(`
      SELECT title 
      FROM feeds2 
      WHERE id = $1`, 
      [id])
    return r1.rows[0].title
  }
}

class FeedItemsTable extends Table {
  async selectUpdates() {
    const res = await this.db.query(`
      SELECT s.user_id AS chat_id,i.url AS item_url,i.title AS item_title,i.date as item_date,f.url AS feed_url,f.title AS feed_title 
      FROM subscriptions AS s 
        JOIN feeds2      AS f ON s.feed=f.url 
        JOIN feed_items2 AS i ON f.id = i.feed_id
      WHERE i.date>s.last_sent and s.active 
      ORDER BY i.date ASC;`
    )
    return res
  }

  async selectTenMostRecent(id: number) {
    const res = await this.db.query(`
      SELECT title, url 
      FROM feed_items2
      WHERE feed_id = $1
      ORDER BY date DESC 
      LIMIT 10`,
      [id])
    return res.rows 
  }

  async selectFeedForItemUrl(url: string): Promise<number|string> {
    const resp = await this.db.query(`select feed_id from feed_items2 where url = $1 limit 1`, [url])
    if (resp.rowCount > 0) {
      return resp.rows[0].feed_id
    }
    throw Error(`db: no feed found for item_url=${url}`)
  }  
}

class BadFeedsTable extends Table {
  async insert(chat_id: string|number, url: string, err: Error) {
    this.db.query(`
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
