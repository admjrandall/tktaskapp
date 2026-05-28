import type { Meta, StoryObj } from '@storybook/html'
import { renderCalendar } from './calendar.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Calendar',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => renderCalendar(emptyState),
}

export const WithData: Story = {
  render: () => renderCalendar(populatedState),
}
