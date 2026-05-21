import { metrics } from '@opentelemetry/api'

const _meter = metrics.getMeter('crm-server')

export const requestCounter = _meter.createCounter('crm.requests.total', {
  description: 'Total number of CRM API requests',
})

export const requestDuration = _meter.createHistogram('crm.requests.duration_ms', {
  description: 'CRM API request duration in milliseconds',
  unit: 'ms',
})

export const activeConnections = _meter.createObservableGauge('crm.connections.active', {
  description: 'Number of active HTTP connections',
})

let _activeCount = 0

export function incrementActiveConnections(): void {
  _activeCount++
}

export function decrementActiveConnections(): void {
  _activeCount = Math.max(0, _activeCount - 1)
}

activeConnections.addCallback((result) => {
  result.observe(_activeCount)
})

export function recordRequest(
  method: string,
  route: string,
  status: number,
  durationMs: number,
): void {
  const labels = { method, route, status: String(status) }
  requestCounter.add(1, labels)
  requestDuration.record(durationMs, { method, route })
}
