import { Telegram } from 'telegraf'
import { deliveryStore, DeliveryStore } from './delivery-store'
import { classifyDeliveryError, deliveryText } from './delivery-policy'

let updateInProgress = false

export const updateAll = async (telegram: Telegram, store: DeliveryStore = deliveryStore) => {
  if (updateInProgress) return
  updateInProgress = true
  try {
    await store.withBatch(async batch => {
      await batch.prepare()
      const started = Date.now()
      for (let n = 0; n < 20 && Date.now() - started < 5000; n++) {
        const row = await batch.claim()
        if (!row) break
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        let message
        try {
          message = await telegram.callApi('sendMessage', { chat_id: row.chat_id, text: deliveryText(row) }, { signal: controller.signal as any })
        } catch (error) {
          const failure = classifyDeliveryError(error)
          console.log(`delivery: ${failure.kind} item=${row.id} chat=${row.chat_id} attempt=${row.attempts} reason=${failure.reason}`)
          if (failure.kind === 'migrate') await batch.migrate(row, failure.chatId)
          else if (failure.kind === 'pause') await batch.pause(row, failure.reason)
          else if (failure.kind === 'retry') await batch.retry(row, failure.reason, failure.delay, failure.flood)
          else await batch.skipped(row, failure.reason)
          continue
        } finally {
          clearTimeout(timeout)
        }
        // A receipt/storage failure is not a Telegram send failure. Recovery
        // skips the durable 'sending' attempt instead of resending it.
        await batch.sent(row, message)
      }
    })
  } finally {
    updateInProgress = false
  }
}
