import Telegraf from 'telegraf'
import TelegrafI18n from 'telegraf-i18n'
import { handleExport, handleList, handleStart, handleSubscribe, handleUnsubscribe, handleHelp, handleResubscribe } from './handlers'
import { updateAll } from './updater'
import UserSession from 'telegraf-session-postgresql'
import loggerMiddleware from './middleware/logger'
import userInfoMiddleware from './middleware/user_info'
import { pathToFileURL } from 'url'

const bot = new Telegraf(process.env.BOT_TOKEN)
const sessionMiddleware = new UserSession()
const i18nMiddleware = TelegrafI18n({
  defaultLacale: 'en',
  useSession: true,
  defautlLanguageOnMissing: true,
  directory: path.resolve(__dirname.resolve('locale'))
})


bot.use(Telegraf.log())
bot.use(userInfoMiddleware)
bot.use(sessionMiddleware)
bot.use(loggerMiddleware)
bot.use(i18nMiddleware)

bot.start(handleStart)
bot.command('help', handleHelp)
bot.command('export', handleExport)
bot.command('list', handleList)
bot.command('subscribe', handleSubscribe)
bot.command('s', handleSubscribe)
bot.action(/^resubscribe:(.+)/, handleResubscribe)
bot.command('unsubscribe', handleUnsubscribe)
bot.command('u', handleUnsubscribe)
bot.on('text', handleSubscribe)

updateAll(bot.telegram)
setInterval(() => updateAll(bot.telegram), 30 * 1000)

bot.launch()
