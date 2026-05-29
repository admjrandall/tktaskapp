export { enqueueJob, getCrmQueue, getCrmDlq } from './instance.js'
export type {
  CrmJobData,
  CrmJobResult,
  DataExportJobData,
  AiComputeJobData,
  GdprEraseJobData,
  NotificationDispatchJobData,
} from './types.js'
export { startWorker, stopWorker } from './worker.js'
export { closeQueues } from './instance.js'
export { closeBullRedis } from './redis.js'

// ── Bootstrap: start queues + worker ─────────────────────────────────────────

let _started = false

export async function startQueues(): Promise<void> {
  if (_started) return
  _started = true
  // Queue instances are lazy-initialised on first use.
  // Worker is started eagerly so jobs are processed immediately.
  const { startWorker } = await import('./worker.js')
  await startWorker()
}

export async function stopQueues(): Promise<void> {
  _started = false
  const { stopWorker } = await import('./worker.js')
  const { closeQueues } = await import('./instance.js')
  const { closeBullRedis } = await import('./redis.js')
  await stopWorker()
  await closeQueues()
  await closeBullRedis()
}
