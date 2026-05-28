import type { Meta, StoryObj } from '@storybook/html'
import {
  renderListView,
  renderGridView,
  renderKanbanView,
  renderSpatialCanvas,
} from './list-grid-kanban-spatial.js'
import { populatedState } from './__storybook-mock-state.js'

const SAMPLE_RECORDS = populatedState.tasks as unknown as Parameters<typeof renderListView>[1]
const noop = () => {}

const meta: Meta = {
  title: 'Views/List-Grid-Kanban',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const List: Story = {
  render: () => renderListView('tasks', SAMPLE_RECORDS, noop, 'title', 'asc', noop),
}

export const Grid: Story = {
  render: () => renderGridView('tasks', SAMPLE_RECORDS, noop),
}

export const Kanban: Story = {
  render: () => renderKanbanView('tasks', SAMPLE_RECORDS, noop),
}

export const SpatialCanvas: Story = {
  render: () => renderSpatialCanvas('tasks', SAMPLE_RECORDS, noop),
}

export const ListEmpty: Story = {
  render: () => renderListView('tasks', [], noop, 'title', 'asc', noop),
}
