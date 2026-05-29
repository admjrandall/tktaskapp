import type IORedis from 'ioredis'

let _bullRedis: IORedis | null = null

export async function getBullRedis(): Promise<IORedis> {
  if (_bullRedis) return _bullRedis
  const url =
    process.env['BULL_REDIS_URL'] ?? process.env['AUTH_STATE_REDIS_URL'] ?? 'redis://127.0.0.1:6379'
  const { default: Redis } = (await import('ioredis')) as unknown as {
    default: new (url: string, options: Record<string, unknown>) => IORedis
  }
  _bullRedis = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ — disables ioredis retries on blocked commands
    enableReadyCheck: false,
  })
  return _bullRedis
}

export async function closeBullRedis(): Promise<void> {
  if (_bullRedis) {
    await _bullRedis.quit()
    _bullRedis = null
  }
}
