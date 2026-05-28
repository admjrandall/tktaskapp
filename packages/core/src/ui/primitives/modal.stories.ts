import type { Meta, StoryObj } from '@storybook/html'
import { renderModal } from './modal.js'
import { renderButton } from './button.js'

const meta: Meta = {
  title: 'Primitives/Modal',
  tags: ['autodocs'],
  render: (args) => renderModal(args as Parameters<typeof renderModal>[0]),
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
    },
  },
  args: {
    id: 'demo-modal',
    title: 'Modal title',
    body: '<p>Modal body content goes here.</p>',
    size: 'md',
  },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  args: {
    id: 'default-modal',
    title: 'Confirm action',
    body: '<p>Are you sure you want to proceed? This cannot be undone.</p>',
  },
}

export const Small: Story = {
  args: {
    id: 'sm-modal',
    title: 'Quick note',
    body: '<p>A compact modal for brief confirmations.</p>',
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    id: 'lg-modal',
    title: 'Edit record',
    body: '<p style="height:200px">Larger modal with more content space.</p>',
    size: 'lg',
  },
}

export const WithFooter: Story = {
  args: {
    id: 'footer-modal',
    title: 'Delete client',
    body: '<p>This will permanently delete <strong>Acme Corp</strong> and all associated records. This cannot be undone.</p>',
    footer:
      renderButton({ label: 'Cancel', variant: 'ghost' }) +
      '&nbsp;' +
      renderButton({ label: 'Delete', variant: 'danger' }),
  },
}

export const FullWidth: Story = {
  args: {
    id: 'full-modal',
    title: 'Record detail',
    body: '<p>Full-width modal for complex forms or record views.</p>',
    size: 'full',
  },
}
