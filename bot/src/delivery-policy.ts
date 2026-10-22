export const MAX_ATTEMPTS = 3

export function classifyDeliveryError(error: any): { kind: 'migrate'|'pause'|'retry'|'skip', reason: string, delay?: number, chatId?: string, flood?: boolean } {
  const response = error?.response
  const code = Number(response?.error_code)
  // Store bounded descriptions only, never error.request/payload or token URLs.
  const reason = String(response?.description || error?.code || error?.name || 'Unknown delivery error')
    .replace(/https?:\/\/\S+/g, '[url]').slice(0, 240)
  const migration = response?.parameters?.migrate_to_chat_id
  if (Number.isSafeInteger(migration) && migration < 0) return { kind: 'migrate', reason, chatId: String(migration) }
  if (code === 403 || (code === 400 && /chat not found|not enough rights|chat_write_forbidden/i.test(reason))) return { kind: 'pause', reason }
  if (code === 429) {
    const after = Number(response?.parameters?.retry_after)
    return { kind: 'retry', reason, delay: Number.isFinite(after) && after > 0 ? after : 30, flood: true }
  }
  if (code >= 500 && code <= 599) return { kind: 'retry', reason }
  // These failures occur before a request is accepted. Other transport failures
  // (timeouts, resets, aborted requests) are ambiguous, so do not resend them.
  if (['ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(error?.code)) return { kind: 'retry', reason }
  return { kind: 'skip', reason }
}

export function deliveryText(row: { item_title: string, feed_title: string, item_url: string }): string {
  const url = row.item_url.slice(0, 2000)
  const title = `${row.item_title} — ${row.feed_title}`
  // Plain text avoids malformed feed HTML causing permanent Telegram errors.
  return `${title.slice(0, 4094 - url.length)}\n\n${url}`
}
