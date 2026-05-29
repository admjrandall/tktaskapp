import { Worker } from 'bullmq'
import type { Job } from 'bullmq'
import { trace, SpanStatusCode } from '@opentelemetry/api'
import type { CrmJobData, CrmJobResult } from './types.js'
import { QUEUE_NAME } from './types.js'
import { getBullRedis } from './redis.js'
import { processJob } from './processors.js'
import { getCrmDlq } from './instance.js'
import { otel } from '../observability/otel.js'

const tracer = trace.getTracer('crm-job-worker', '1.0.0')

let _worker: Worker<CrmJobData, CrmJobResult> | null = null

async function processWithSpan(job: Job<CrmJobData, CrmJobResult>): Promise<CrmJobResult> {
  return tracer.startActiveSpan(`job.${job.data.type}`, async (span) => {
    span.setAttributes({
      'job.id': job.id ?? 'unknown',
      'job.type': job.data.type,
      'crm.tenant_id': job.data.tenantId,
      'job.attempt': job.attemptsMade + 1,
    })
    try {
      const result = await processJob(job)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      throw err
    } finally {
      span.end()
    }
  })
}

export async function startWorker(): Promise<Worker<CrmJobData, CrmJobResult>> {
  if (_worker) return _worker

  const connection = await getBullRedis()
  const concurrency = Number(process.env['QUEUE_WORKER_CONCURRENCY'] ?? 5)

  _worker = new Worker<CrmJobData, CrmJobResult>(QUEUE_NAME, processWithSpan, {
    connection,
    concurrency,
    limiter: { max: 50, duration: 1_000 }, // max 50 jobs/second across all workers
  })

  _worker.on('completed', (job, result) => {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'tktaskapp-server',
      tenantId: job.data.tenantId,
      requestId: job.id ?? 'unknown',
      message: `job completed: ${job.data.type}`,
      extra: { jobType: job.data.type, success: result.success },
    })
  })

  _worker.on('failed', (job, err) => {
    if (!job) return
    const maxAttempts = job.opts.attempts ?? 1
    const isLastAttempt = job.attemptsMade >= maxAttempts

    otel.log({
      timestamp: new Date().toISOString(),
      level: isLastAttempt ? 'error' : 'warn',
      service: 'tktaskapp-server',
      tenantId: job.data.tenantId,
      requestId: job.id ?? 'unknown',
      message: `job failed: ${job.data.type} (attempt ${job.attemptsMade}/${maxAttempts})`,
      extra: { jobType: job.data.type, error: String(err), isLastAttempt },
    })

    if (isLastAttempt) {
      // Move to dead-letter queue for inspection / manual requeue
      void moveToDlq(job, err)
    }
  })

  _worker.on('error', (err) => {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId: 'system',
      requestId: 'worker',
      message: 'BullMQ worker error',
      extra: { error: String(err) },
    })
  })

  otel.log({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'tktaskapp-server',
    tenantId: 'system',
    requestId: 'startup',
    message: `CRM job worker started (concurrency: ${concurrency})`,
  })

  return _worker
}

async function moveToDlq(job: Job<CrmJobData, CrmJobResult>, err: Error): Promise<void> {
  try {
    const dlq = await getCrmDlq()
    await dlq.add(job.data.type, job.data, {
      jobId: `dlq:${job.id ?? Date.now()}`,
      removeOnFail: false,
      removeOnComplete: { count: 1_000, age: 7 * 24 * 60 * 60 }, // keep 7 days
    })
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'tktaskapp-server',
      tenantId: job.data.tenantId,
      requestId: job.id ?? 'unknown',
      message: `moved to DLQ: ${job.data.type}`,
      extra: { originalError: String(err) },
    })
  } catch (dlqErr) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId: job.data.tenantId,
      requestId: job.id ?? 'unknown',
      message: 'failed to move job to DLQ',
      extra: { error: String(dlqErr) },
    })
  }
}

export async function stopWorker(timeoutMs = 30_000): Promise<void> {
  if (!_worker) return
  otel.log({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'tktaskapp-server',
    tenantId: 'system',
    requestId: 'shutdown',
    message: `closing job worker (waiting up to ${timeoutMs}ms for in-flight jobs)`,
  })
  // close(true) = force-close; close() = graceful (waits for current jobs)
  await Promise.race([
    _worker.close(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
  _worker = null
}
