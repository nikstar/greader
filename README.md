# G Reader

<img align="right" height=200 src="/cover.png" alt="G Reader" />

G Reader is a simple RSS feed reader bot for Telegram. Check it out here: **[@GReaderBot](https://t.me/GReaderBot)**. I've written [a blog post](https://nikstar.me/post/greader/) describing how it works.

G Reader contains three components: TypeScript Telegram bot using [telegraf.js](https://telegraf.js.org/), Go RSS feed crawler, and Postgres database (not part of this repo). Bot talks to the crawler using a webserver and gets updates from the database.

Bot expects `BOT_TOKEN` and `CRAWLER_HOST` (default localhost) environment variables, and both components support full set of Postgres variables.

## Local development

**Bot**

*Set environment variables in bot/.env*

```bash
cd bot
npm start
```

**Crawler**

```bash
cd crawler
go build
env $(cat .env) ./crawler
```

## Docker

Docker can be used with Postges running on host machine. For this behavior set `PGHOST=host` in `.env.docker`.

```bash
docker-compose up -d
```


