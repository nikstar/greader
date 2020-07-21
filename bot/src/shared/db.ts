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
    await this.db.query(`
      INSERT INTO subscriptions (user_id, feed_id, last_sent, active) 
      VALUES                    ($1,      $2,       now(),     true  ) 
      ON CONFLICT (user_id, feed_id) DO 
        UPDATE SET 
          last_sent = EXCLUDED.last_sent, 
          active = true`,
      [chat_id, feed_id]
    )
  }

  async selectSubscriptionsForUser(id: string|number) {
    const res = await this.db.query(`
      SELECT url, title 
      FROM subscriptions AS s 
      JOIN feeds AS f ON 
        s.feed_id = f.id 
      WHERE s.user_id = $1 AND active 
      ORDER BY most_recent_item DESC;`, 
      [id]
    )
    return res
  }

  async selectURLForID(id: string|number) {
    const r = await this.db.query(`
      SELECT feeds.url 
      FROM subscriptions
      JOIN feeds on feed_id = feeds.id 
      where subscriptions.id = $1`, [id])
    if (r.rowCount == 0) {
      throw new Error(`db.getSubscibtion: failed to find subscription id=${id}`)
    }
    return r.rows[0].url  
  }

  async updateLastSent(chat_id: string|number, feed_id: number, date: string) {
    await this.db.query(`
      UPDATE subscriptions 
      SET last_sent = $1 
      WHERE user_id = $2 AND feed_id = $3;`,
      [date, chat_id, feed_id]
    )
  }

  async updateInactive(chat_id: string|number, feed_id: string|number): Promise<number> {
    const r = await this.db.query(`
      UPDATE subscriptions 
      SET active = false 
      WHERE user_id = $1 AND feed_id = $2
      RETURNING id
      `, [chat_id, feed_id])
    if (r.rowCount == 0) {
      throw Error(`db: no active subscription for chat_id=${chat_id}, feed_id=${feed_id}`)
    }
    return r.rows[0].id  
  }
  
}

class FeedsTable extends Table {
  async selectFeedTitle(id: number): Promise<string> {
    const r1 = await this.db.query(`
      SELECT title 
      FROM feeds 
      WHERE id = $1`, 
      [id])
    return r1.rows[0].title
  }
}

class FeedItemsTable extends Table {
  async selectUpdates() {
    const res = await this.db.query(`
      SELECT s.user_id AS chat_id,i.url AS item_url,i.title AS item_title,i.date as item_date,f.id AS feed_id,f.title AS feed_title 
      FROM subscriptions AS s 
        JOIN feeds      AS f ON s.feed_id = f.id 
        JOIN feed_items AS i ON f.id = i.feed_id
      WHERE i.date>s.last_sent and s.active 
      ORDER BY i.date ASC;`
    )
    return res
  }

  async selectTenMostRecent(id: number) {
    const res = await this.db.query(`
      SELECT title, url 
      FROM feed_items
      WHERE feed_id = $1
      ORDER BY date DESC 
      LIMIT 10`,
      [id])
    return res.rows 
  }
  
  async selectFeedForItemUrl(url: string): Promise<number|string> {
    const resp = await this.db.query(`select feed_id from feed_items where url = $1 limit 1`, [url])
    if (resp.rowCount > 0) {
      return resp.rows[0].feed_id
    }
    throw Error(`db: no feeds found for item_url=${url}`)
  }  
}

class BadFeedsTable extends Table {
  async insert(chat_id: string|number, url: string, err: Error) {
    await this.db.query(`
      INSERT INTO bad_feeds (user_id, url, comment) 
      VALUES                ($1,      $2,  $3);`,
      [chat_id, url, err.toString()]
    )
  }
}

class MessageLog extends Table {
  async insert(chat_id: string|number, text: string, responseTime: number) {
    await this.db.query(`
      INSERT INTO message_log (chat_id, message, dt,    response_time)
      VALUES                  ($1,      $2,      now(), $3           )`,
      [chat_id, text, responseTime]
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
export const messageLog = new MessageLog(dbClient)
  