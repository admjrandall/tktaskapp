import type { Meta, StoryObj } from '@storybook/html'
import { renderReports } from './reports.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Reports',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => renderReports(emptyState),
}

export const WithData: Story = {
  render: () => renderReports(populatedState),
}
