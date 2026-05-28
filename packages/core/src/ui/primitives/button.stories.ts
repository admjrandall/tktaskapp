import type { Meta, StoryObj } from '@storybook/html'
import { renderButton, renderIconButton } from './button.js'

const meta: Meta = {
  title: 'Primitives/Button',
  tags: ['autodocs'],
  render: (args) => renderButton(args as Parameters<typeof renderButton>[0]),
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'icon'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
  },
  args: {
    label: 'Button',
    variant: 'secondary',
    size: 'md',
    disabled: false,
  },
}

export default meta
type Story = StoryObj

export const Primary: Story = {
  args: { label: 'Save changes', variant: 'primary' },
}

export const Secondary: Story = {
  args: { label: 'Cancel', variant: 'secondary' },
}

export const Ghost: Story = {
  args: { label: 'Options', variant: 'ghost' },
}

export const Danger: Story = {
  args: { label: 'Delete record', variant: 'danger' },
}

export const SmallSize: Story = {
  args: { label: 'Apply', variant: 'primary', size: 'sm' },
}

export const LargeSize: Story = {
  args: { label: 'Get started', variant: 'primary', size: 'lg' },
}

export const Disabled: Story = {
  args: { label: 'Unavailable', variant: 'primary', disabled: true },
}

export const IconButton: Story = {
  render: () =>
    renderIconButton(
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      { ariaLabel: 'Add item' },
    ),
}

export const AllVariants: Story = {
  render: () =>
    ['primary', 'secondary', 'ghost', 'danger']
      .map((v) =>
        renderButton({ label: v.charAt(0).toUpperCase() + v.slice(1), variant: v as never }),
      )
      .join('&nbsp;'),
}
