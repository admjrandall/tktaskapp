import type { Meta, StoryObj } from '@storybook/html'
import { renderLibrary, renderFileViewer } from './library.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Library',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => renderLibrary(emptyState),
}

export const WithData: Story = {
  render: () => renderLibrary(populatedState),
}

export const FileViewer: Story = {
  render: () => renderFileViewer(null),
}
