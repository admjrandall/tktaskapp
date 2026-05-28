import type { Meta, StoryObj } from '@storybook/html'
import { renderDocuments, renderDocumentEditor, renderDocModal } from './documents.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Documents',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const ListEmpty: Story = {
  render: () => renderDocuments(emptyState),
}

export const ListWithData: Story = {
  render: () => {
    const state = {
      ...populatedState,
      documents: [
        {
          id: 'doc1',
          title: 'Project Brief',
          body: '# Overview\nThis document...',
          pinned: true,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-27T00:00:00Z',
        },
        {
          id: 'doc2',
          title: 'Technical Spec',
          body: 'API endpoints...',
          pinned: false,
          createdAt: '2026-05-10T00:00:00Z',
          updatedAt: '2026-05-20T00:00:00Z',
        },
      ] as never,
    }
    return renderDocuments(state)
  },
}

export const DocumentEditor: Story = {
  render: () => renderDocumentEditor(populatedState),
}

export const DocumentModal: Story = {
  render: () => renderDocModal({ ...populatedState, docModal: true }),
}
