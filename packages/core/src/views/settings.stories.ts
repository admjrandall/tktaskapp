import type { Meta, StoryObj } from '@storybook/html'
import { renderSettings } from './settings.js'
import { populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Settings',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => renderSettings(populatedState),
}

export const StrictLockdown: Story = {
  render: () => renderSettings({ ...populatedState, lockdownLevel: 'strict' }),
}
