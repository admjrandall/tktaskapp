import type { Meta, StoryObj } from '@storybook/html'
import { renderRecordModal } from './record-modal.js'

/**
 * Record modal calls dbGetById/dbGetAll internally (storage layer).
 * In Storybook these return empty/null — stories show the empty-create form.
 * To preview an edit form, seed IDB in a real browser session instead.
 */
const meta: Meta = {
  title: 'Views/Record Modal',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

export const NewClient: Story = {
  render: () => renderRecordModal({ store: 'clients', id: null }),
}

export const NewTask: Story = {
  render: () =>
    renderRecordModal({
      store: 'tasks',
      id: null,
      defaults: { status: 'Todo', priority: 'Medium' },
    }),
}

export const NewProject: Story = {
  render: () => renderRecordModal({ store: 'projects', id: null }),
}

export const NewPerson: Story = {
  render: () => renderRecordModal({ store: 'people', id: null }),
}
