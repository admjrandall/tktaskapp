import type { Meta, StoryObj } from '@storybook/html'
import { renderBadge, renderPriorityBadge, renderStatusBadge, renderDueBadge } from './badge.js'

const meta: Meta = {
  title: 'Primitives/Badge',
  tags: ['autodocs'],
  render: (args) => renderBadge(args as Parameters<typeof renderBadge>[0]),
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'danger', 'info', 'ai', 'slate'],
    },
    size: { control: 'select', options: ['sm', 'md'] },
    dot: { control: 'boolean' },
  },
  args: { label: 'Badge', variant: 'default', dot: false },
}

export default meta
type Story = StoryObj

export const Default: Story = { args: { label: 'Default' } }
export const Primary: Story = { args: { label: 'Primary', variant: 'primary' } }
export const Success: Story = { args: { label: 'Active', variant: 'success' } }
export const Warning: Story = { args: { label: 'On Hold', variant: 'warning' } }
export const Danger: Story = { args: { label: 'Blocked', variant: 'danger' } }
export const Info: Story = { args: { label: 'Lead', variant: 'info' } }
export const AI: Story = { args: { label: 'AI', variant: 'ai' } }

export const WithDot: Story = {
  args: { label: 'In Progress', variant: 'primary', dot: true },
}

export const AllVariants: Story = {
  render: () =>
    ['default', 'primary', 'success', 'warning', 'danger', 'info', 'ai', 'slate']
      .map((v) => renderBadge({ label: v, variant: v as never }))
      .join('&nbsp;'),
}

export const PriorityBadges: Story = {
  render: () =>
    ['Low', 'Medium', 'High', 'Critical'].map((p) => renderPriorityBadge(p)).join('&nbsp;'),
}

export const StatusBadges: Story = {
  render: () =>
    ['Todo', 'In Progress', 'Blocked', 'Done', 'Active', 'Lead', 'On Hold', 'Cancelled']
      .map((s) => renderStatusBadge(s))
      .join('&nbsp;'),
}

export const DueBadgeOverdue: Story = {
  render: () => renderDueBadge('2024-01-01'),
}

export const DueBadgeToday: Story = {
  render: () => {
    const today = new Date().toISOString().slice(0, 10)
    return renderDueBadge(today)
  },
}

export const DueBadgeSoon: Story = {
  render: () => {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    return renderDueBadge(d.toISOString().slice(0, 10))
  },
}
