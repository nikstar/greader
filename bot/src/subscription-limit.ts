export const subscriptionLimitMessage = 'This chat has reached the limit of 100 active subscriptions. Unsubscribe from a feed before adding another. You can save your subscriptions with /export.'

export function isSubscriptionLimitError(error: any): boolean {
  return error?.code === 'P0001' && error?.message === 'SUBSCRIPTION_LIMIT_REACHED'
}

export function subscriptionLimitError(): Error {
  return Object.assign(new Error('SUBSCRIPTION_LIMIT_REACHED'), { code: 'P0001' })
}
