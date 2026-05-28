import type { Meta, StoryObj } from '@storybook/html'
import { renderTimeTracker } from './time-tracker.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Time Tracker',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

export const Idle: Story = {
  render: () => renderTimeTracker({ ...populatedState, runningTimer: null, timerElapsed: 0 }),
}

export const Running: Story = {
  render: () =>
    renderTimeTracker({
      ...populatedState,
      runningTimer: {
        id: 'te-running',
        taskId: 't1',
        startedAt: new Date(Date.now() - 3661000).toISOString(),
      },
      timerElapsed: 3661,
    }),
}

export const Empty: Story = {
  render: () => renderTimeTracker(emptyState),
}
