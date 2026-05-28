import type { Meta, StoryObj } from '@storybook/html'
import { renderAdminConsole } from './admin-console.js'
import { populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Admin Console',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => renderAdminConsole(populatedState),
}

export const StrictLockdown: Story = {
  render: () => renderAdminConsole({ ...populatedState, lockdownLevel: 'strict' }),
}
