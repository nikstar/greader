# G Reader

<img align="right" height=200 src="/cover.png" alt="G Reader" />

G Reader is a simple RSS feed reader bot for Telegram. Check it out here: **[@GReaderBot](https://t.me/GReaderBot)**. 

G Reader was originally made a couple of years ago[^1]. A **mini web app** to easily manage feed subscriptions was added as part of **October 2023 contest**. This readme contains helpful information to get you started with your own Telegram web app. A guide to bring up G Reader with Docker is below.

[^1]: Release announcement on my blog: https://nikstar.me/post/greader/

## Overview

G Reader consists of five components: 

*   **Telegram bot**

    Written in TypeScript. Communicates with Telegram using [telegraf.js](https://telegraf.js.org/). Responds to user commands, reports new subscriptions to the crawler, periodically checks the database for feed updates and publishes them.

*   **Feed crawler**
    
    Monitors the database for outdated feeds and crawls them. Can also proactively try to fetch a feed in response to web request.

*   Postgres **database**

    Stores users, feeds, subscriptions, and feed update schedule.

*   Telegram **mini web app**

    Implemented in vanilla JavaScript. Shows info about current subscriptions, allows unsubscribing, filtering.

*   Web app **backend**

    Implemented with node.js and express.js.

## Mini app

**Opening the web app**. Telegram supports different ways of opening web apps: keyboard button, menu button, via inline mode, attachment menu, from a direct link. G Reader uses an *inline button* (aka *inline keyboard button*), which is a button attached to a chat message. Note that behavior for apps launched from the *menu button* will be largely the same.

Inline button is created [here][1]. User-specific token is fetched from the database and will be used for authorization. Note that wep app buttons are not available in groups or channels, and trying to send one will fail with `BUTTON_TYPE_INVALID`.

The button is then attached to responses to [help][2], [list][3], and [unsubscribe][4] commands. All commands are declared in [index.ts][5].

[1]: https://github.com/nikstar/greader/blob/main/bot/src/handlers/app.ts#L4
[2]: https://github.com/nikstar/greader/blob/main/bot/src/handlers/help.ts#L21
[3]: https://github.com/nikstar/greader/blob/main/bot/src/handlers/list.ts#L16
[4]: https://github.com/nikstar/greader/blob/main/bot/src/handlers/unsubscribe.ts#L58
[5]: https://github.com/nikstar/greader/blob/main/bot/src/index.ts

**Web app frontend**. G Reader web app has a simple three file structure: [index.html][6], [app.js][7], and [main.css][8].

HTML [links][9] the web app script that is provided by Telegram. It binds a custom object to `window.Telegram` and provides the user, current theme, and UI controls. Additionally we disallow search engine indexing with `robots.txt` and meta tag.

The app [script][7] loads info from the server and displays it, handles button events, and filters subscriptions. This is all normal web stuff. One thing of note here: we attempt to [show user profile picture][10] next to G Reader logo but it isn't available for web apps launched from inline button. This code will work when app is launched from attachment menu so I kept it for illustrational purposes.

[CSS][8] uses dynamic theme variables. They match the current app theme to provide a native experience.

[6]: https://github.com/nikstar/greader/blob/main/web/index.html
[7]: https://github.com/nikstar/greader/blob/main/web/app.js
[8]: https://github.com/nikstar/greader/blob/main/web/main.css
[9]: https://github.com/nikstar/greader/blob/main/web/index.html#L8
[10]: https://github.com/nikstar/greader/blob/main/web/app.js#L154

**Backend** is a straightforward [express.js app][11]. It [uses][12] the token from earlier to identify the current user and provide requested data. This authorization method is sufficient for this app but can be improved if needed in following ways:

- Expire old authorization tokens
- Verify user info provided in `window.Telegram.WebApp` as described [in the docs][13]. This would be necessary for apps launched for attachment menu or with direct link, when we are unable to provide custom data as URL parameters.

Note that web app button can't be forwarded from private chat with bot so authorization token is safe.

[11]: https://github.com/nikstar/greader/blob/main/api/app.js
[12]: https://github.com/nikstar/greader/blob/main/web/app.js#L19
[13]: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app


## Quick start

Follow these steps to run a custom instance. Remember to modify urls of your web app. Please do not name your project "G Reader" to avoid confusion.

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

    Get `BOT_TOKEN` from [@BotFather](https://t.me/BotFather). `OWNER_ID` refers to your Telegram user ID. The bot will respond to admin commands from that account.

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

