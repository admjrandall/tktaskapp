import type { Meta, StoryObj } from '@storybook/html'
import { renderProjectCanvas } from './project-canvas.js'

const meta: Meta = {
  title: 'Views/Project Canvas',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => renderProjectCanvas(),
}
