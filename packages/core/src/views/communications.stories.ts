import type { Meta, StoryObj } from '@storybook/html'
import { renderCommunications } from './communications.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'
import type { AppState } from '../state.js'

const meta: Meta = {
  title: 'Views/Communications',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => renderCommunications(emptyState),
}

export const WithData: Story = {
  render: () => {
    const state: AppState = {
      ...populatedState,
      communications: [
        {
          id: 'comm1',
          type: 'Email',
          subject: 'Project kickoff',
          body: 'Let us schedule the kickoff call.',
          occurredAt: '2026-05-20T10:00:00Z',
          personId: 'u1',
          clientId: 'c1',
          durationMinutes: null,
          createdAt: '2026-05-20T10:00:00Z',
          updatedAt: '2026-05-20T10:00:00Z',
        } as never,
        {
          id: 'comm2',
          type: 'Call',
          subject: 'Status update',
          body: 'Discussed timeline adjustments.',
          occurredAt: '2026-05-24T14:30:00Z',
          personId: 'u2',
          clientId: 'c2',
          durationMinutes: 30,
          createdAt: '2026-05-24T14:30:00Z',
          updatedAt: '2026-05-24T14:30:00Z',
        } as never,
        {
          id: 'comm3',
          type: 'Meeting',
          subject: 'Design review',
          body: null,
          occurredAt: '2026-05-27T09:00:00Z',
          personId: 'u1',
          clientId: 'c1',
          durationMinutes: 60,
          createdAt: '2026-05-27T09:00:00Z',
          updatedAt: '2026-05-27T09:00:00Z',
        } as never,
      ] as never,
    }
    return renderCommunications(state)
  },
}
