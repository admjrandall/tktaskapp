import type { Meta, StoryObj } from '@storybook/html'
import { renderOnboarding } from './onboarding.js'

const meta: Meta = {
  title: 'Views/Onboarding',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => renderOnboarding(),
}
