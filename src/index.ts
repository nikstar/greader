
import Telegraf, { Markup, Extra } from 'telegraf'
import { job, CronJob } from 'cron'
import { db } from './db'
import { handleExport, handleList, handleStart, handleSubscribe, handleUnsubscribe } from './handlers'
import { fetchAll } from './crawler'
import { updateAll } from './updater'
import PostgreSQLSession from 'telegraf-session-postgresql'
import Ctx from './ctx'
import { handleResubscribe } from './handlers/subscribe'

const bot = new Telegraf(process.env.BOT_TOKEN)

const session = new PostgreSQLSession()

const crawlerJob = job('0 * * * * *', fetchAll)
fetchAll()
crawlerJob.start()

const updaterJob = job('30 * * * * *', () => updateAll(bot.telegram))
updateAll(bot.telegram)
updaterJob.start()

bot.use(Telegraf.log())
bot.use(session)

bot.start(handleStart)
bot.command('export', handleExport)
bot.command('list', handleList)
bot.command('subscribe', handleSubscribe)
bot.action(/^resubscribe:(.+)/, handleResubscribe)

bot.command('unsubscribe', handleUnsubscribe)
bot.command('u', handleUnsubscribe)

bot.on('text', handleSubscribe)

bot.launch()

