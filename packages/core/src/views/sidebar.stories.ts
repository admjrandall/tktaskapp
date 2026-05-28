import type { Meta, StoryObj } from '@storybook/html'
import { renderSidebar, renderBottomTabs } from './sidebar.js'
import { emptyState, populatedState } from './__storybook-mock-state.js'

const meta: Meta = {
  title: 'Views/Sidebar',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

export const Expanded: Story = {
  render: () => renderSidebar({ ...populatedState, sidebarCollapsed: false }),
}

export const Collapsed: Story = {
  render: () => renderSidebar({ ...populatedState, sidebarCollapsed: true }),
}

export const Empty: Story = {
  render: () => renderSidebar(emptyState),
}

export const BottomTabs: Story = {
  render: () => renderBottomTabs(populatedState),
}
