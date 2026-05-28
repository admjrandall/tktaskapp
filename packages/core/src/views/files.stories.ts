import type { Meta, StoryObj } from '@storybook/html'
import { renderFilesView } from './files.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Files',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Empty: Story = {
  render: () => renderFilesView(emptyState),
}

export const WithData: Story = {
  render: () => {
    const state = {
      ...populatedState,
      files: [
        {
          id: 'f1',
          name: 'project-brief.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 204800,
          relatedStore: 'projects',
          relatedId: 'p1',
          createdAt: '2026-05-10T00:00:00Z',
        },
        {
          id: 'f2',
          name: 'design-mockup.png',
          mimeType: 'image/png',
          sizeBytes: 1048576,
          relatedStore: 'projects',
          relatedId: 'p1',
          createdAt: '2026-05-15T00:00:00Z',
        },
      ] as never,
    }
    return renderFilesView(state)
  },
}
