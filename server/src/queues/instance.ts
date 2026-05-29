import { Queue, QueueEvents } from 'bullmq'
import type { CrmJobData, CrmJobResult } from './types.js'
import { QUEUE_NAME, DLQ_NAME, JOB_RETRY_CONFIG } from './types.js'
import { getBullRedis } from './redis.js'
import { otel } from '../observability/otel.js'

let _queue: Queue<CrmJobData, CrmJobResult> | null = null
let _dlq: Queue<CrmJobData, CrmJobResult> | null = null
let _events: QueueEvents | null = null

export async function getCrmQueue(): Promise<Queue<CrmJobData, CrmJobResult>> {
  if (!_queue) {
    const connection = await getBullRedis()
    _queue = new Queue<CrmJobData, CrmJobResult>(QUEUE_NAME, { connection })
  }
  return _queue
}

export async function getCrmDlq(): Promise<Queue<CrmJobData, CrmJobResult>> {
  if (!_dlq) {
    const connection = await getBullRedis()
    _dlq = new Queue<CrmJobData, CrmJobResult>(DLQ_NAME, { connection })
  }
  return _dlq
}

export async function getCrmQueueEvents(): Promise<QueueEvents> {
  if (!_events) {
    const connection = await getBullRedis()
    _events = new QueueEvents(QUEUE_NAME, { connection })
  }
  return _events
}

/**
 * Enqueue a CRM job with type-appropriate retry config and idempotency key.
 * Returns the BullMQ Job ID.
 */
export async function enqueueJob(
  data: CrmJobData,
  opts?: { jobId?: string; delay?: number },
): Promise<string> {
  const queue = await getCrmQueue()
  const retryConfig = JOB_RETRY_CONFIG[data.type]
  const job = await queue.add(data.type, data, {
    ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    ...(opts?.delay ? { delay: opts.delay } : {}),
    attempts: retryConfig.attempts,
    backoff: { type: 'exponential', delay: retryConfig.delayMs },
    removeOnComplete: { count: 500, age: 24 * 60 * 60 },
    removeOnFail: false, // keep failed jobs for DLQ inspection
  })
  otel.log({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'tktaskapp-server',
    tenantId: data.tenantId,
    requestId: job.id ?? 'unknown',
    message: `enqueued job ${data.type}`,
    extra: { jobType: data.type, jobId: job.id ?? 'unknown' },
  })
  return job.id ?? ''
}

export async function closeQueues(): Promise<void> {
  await Promise.all([_queue?.close(), _dlq?.close(), _events?.close()])
  _queue = null
  _dlq = null
  _events = null
}
