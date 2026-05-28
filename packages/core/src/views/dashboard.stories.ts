import type { Meta, StoryObj } from '@storybook/html'
import { renderDashboard } from './dashboard.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Dashboard',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => renderDashboard(emptyState),
}

export const WithData: Story = {
  render: () => renderDashboard(populatedState),
}
