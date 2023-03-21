# G Reader

<img align="right" height=200 src="/cover.png" alt="G Reader" />

G Reader is a simple RSS feed reader bot for Telegram. Check it out here: **[@GReaderBot](https://t.me/GReaderBot)**. I have written [a blog post](https://nikstar.me/post/greader/) describing how it works.

G Reader consists of three components: 

* TypeScript Telegram bot written using [telegraf.js](https://telegraf.js.org/)
* Go RSS feed crawler
* Postgres database

The bot communicates with the crawler through a web server and retrieves updates from the database.

## Installation

1. Install `docker` and `docker-compose`.

2. Clone this repository.

3. Launch Postgres and restore backup:
  
    ```bash
    docker compose up -d postgres 
    ./scripts/load-backup.sh backup.sql
    ```

    or create tables:

    ```bash
    docker compose up -d postgres 
    ./scripts/create-tables.sh
    ```


4. Set environment variables in `.env.docker`: 
    ```bash
    cp .env.example .env.docker
    vim .env.docker
    ```

    You can get `BOT_TOKEN` from [@BotFather](https://t.me/BotFather).

    `OWNER_ID` refers to your Telegram user ID. The bot will respond to admin commands from this account.

5. Launch

    ```bash
    docker compose up -d
    docker compose ps
    docker compose logs -f
    ```

## License

MIT. Feel free to launch your own instance but please DO NOT name it "G Reader" to avoid confusion.

## Contributions

PRs are welcome.

