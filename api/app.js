
const port = 14000

import express from "express"
import morgan from "morgan"
const app = express()
app.use(morgan("dev")) // "dev"
app.disable('etag')

import pg from "pg"
const pool = process.env.PGHOST ? new pg.Pool() : new pg.Pool({
    host: '172.21.0.2', // edit as needed
    user: 'docker',     
    database: 'greader',
    password: 'docker', 
    port: 5432,         
})

const getId = async (hash) => {
    const client = await pool.connect()
    const result = await client.query('SELECT chat_id FROM api WHERE hash = $1 LIMIT 1;', [hash])
    client.release()
    if (result.rowCount) {
        const chat_id = result.rows[0].chat_id
        if (chat_id?.length > 0) {
            return  chat_id;
        }
    }

    throw `no chat for hash ${hash}`
}

app.get('/api/:hash/subscriptions/count', async (request, response) => {
    try {
        const { hash } = request.params
        const id = await getId(hash)
        const client = await pool.connect()
        const result = await client.query('SELECT count(*) FROM subscriptions WHERE chat_id = $1 AND active = true;', [id])
        response.json({ count: result.rows[0].count })
        client.release()
    } catch (error) {
        response.status(500).json({ error })
    }
})

app.get('/api/:hash/subscriptions/active', async (request, response) => {
    try {
        const { hash } = request.params
        const id = await getId(hash)
        const client = await pool.connect()
        const result = await client.query(`
            SELECT subscriptions.id as id, chat_id, last_sent, active, feed_id, url, title, last_update_time, next_update_time, most_recent_item 
            FROM subscriptions JOIN feeds ON subscriptions.feed_id = feeds.id 
            WHERE chat_id = $1 AND active = true
            ORDER BY last_sent DESC;
        `, [id])
        response.json({ subscriptions: result.rows })
        client.release()
    } catch (error) {
        response.status(500).json({ error })
    }
})

app.get('/api/:hash/unsubscribe/:id', async (request, response) => {
    try {
        const { hash, id } = request.params
        const chat_id = await getId(hash)
        const client = await pool.connect()
        const result = await client.query(`
            UPDATE subscriptions 
            SET active = false 
            WHERE chat_id = $1 AND id = $2
            RETURNING id
        `, [chat_id, id])
        response.json({ subscriptions: result.rows })
        client.release()
    } catch (error) {
        response.status(500).json({ error })
    }
})

app.get('/api/:hash/resubscribe/:id', async (request, response) => {
    try {
        const { hash, id } = request.params
        const chat_id = await getId(hash)
        const client = await pool.connect()
        const result = await client.query(`
            UPDATE subscriptions 
            SET active = true 
            WHERE chat_id = $1 AND id = $2
            RETURNING id
        `, [chat_id, id])
        response.json({ subscriptions: result.rows })
        client.release()
    } catch (error) {
        response.status(500).json({ error })
    }
})

app.listen(port, () => {
    console.log(`Server is running at port ${port}`)
})
