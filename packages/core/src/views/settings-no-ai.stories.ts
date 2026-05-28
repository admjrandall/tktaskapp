import type { Meta, StoryObj } from '@storybook/html'
import { renderSettings } from './settings-no-ai.js'
import { populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Settings (No-AI Profile)',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => renderSettings(populatedState),
}
