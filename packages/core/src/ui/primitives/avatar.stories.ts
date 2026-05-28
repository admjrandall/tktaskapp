import type { Meta, StoryObj } from '@storybook/html'
import { renderAvatar, renderAvatarGroup } from './avatar.js'

const meta: Meta = {
  title: 'Primitives/Avatar',
  tags: ['autodocs'],
  render: (args) => renderAvatar(args as Parameters<typeof renderAvatar>[0]),
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
  },
  args: { name: 'Joshua Randall', size: 'md' },
}

export default meta
type Story = StoryObj

export const Default: Story = { args: { name: 'Joshua Randall' } }
export const ExtraSmall: Story = { args: { name: 'Alice Chen', size: 'xs' } }
export const Small: Story = { args: { name: 'Bob Martinez', size: 'sm' } }
export const Large: Story = { args: { name: 'Carol White', size: 'lg' } }
export const ExtraLarge: Story = { args: { name: 'David Kim', size: 'xl' } }

export const NoName: Story = { args: { name: null } }

export const AllSizes: Story = {
  render: () =>
    ['xs', 'sm', 'md', 'lg', 'xl']
      .map((s) => renderAvatar({ name: 'Joshua Randall', size: s as never }))
      .join('&nbsp;'),
}

export const MultipleColors: Story = {
  render: () =>
    ['Alice Chen', 'Bob Martinez', 'Carol White', 'David Kim', 'Eve Johnson']
      .map((name) => renderAvatar({ name, size: 'md' }))
      .join('&nbsp;'),
}

export const AvatarGroup: Story = {
  render: () =>
    renderAvatarGroup([
      { name: 'Alice Chen' },
      { name: 'Bob Martinez' },
      { name: 'Carol White' },
      { name: 'David Kim' },
      { name: 'Eve Johnson' },
    ]),
}
