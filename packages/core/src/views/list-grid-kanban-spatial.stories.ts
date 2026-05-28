import type { Meta, StoryObj } from '@storybook/html'
import {
  renderListView,
  renderGridView,
  renderKanbanView,
  renderSpatialCanvas,
} from './list-grid-kanban-spatial.js'
import { populatedState } from './__storybook-mock-state.js'

const SAMPLE_RECORDS = populatedState.tasks as unknown as Record<string, unknown>[]
const SAMPLE_COLUMNS = ['status', 'priority', 'title', 'dueDate']

const meta: Meta = {
  title: 'Views/List-Grid-Kanban',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const List: Story = {
  render: () => renderListView(SAMPLE_RECORDS, 'tasks', SAMPLE_COLUMNS),
}

export const Grid: Story = {
  render: () => renderGridView(SAMPLE_RECORDS, 'tasks'),
}

export const Kanban: Story = {
  render: () =>
    renderKanbanView(SAMPLE_RECORDS, 'tasks', ['Todo', 'In Progress', 'Blocked', 'Done'], 'status'),
}

export const SpatialCanvas: Story = {
  render: () => renderSpatialCanvas(SAMPLE_RECORDS, 'tasks', populatedState),
}

export const ListEmpty: Story = {
  render: () => renderListView([], 'tasks', SAMPLE_COLUMNS),
}
