import type { Meta, StoryObj } from '@storybook/html'
import { renderInput, renderTextarea, renderSelect } from './input.js'

const meta: Meta = {
  title: 'Primitives/Input',
  tags: ['autodocs'],
  render: (args) => renderInput(args),
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'tel', 'url', 'date'],
    },
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
  args: {
    id: 'demo-input',
    label: 'Field label',
    placeholder: 'Enter value…',
    type: 'text',
    size: 'md',
  },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  args: { label: 'Name', placeholder: 'Enter name…' },
}

export const WithValue: Story = {
  args: { label: 'Email', type: 'email', value: 'user@example.com' },
}

export const WithError: Story = {
  args: {
    label: 'Email',
    type: 'email',
    value: 'not-an-email',
    error: 'Enter a valid email address',
  },
}

export const WithHint: Story = {
  args: { label: 'Password', type: 'password', hint: 'Must be at least 12 characters' },
}

export const Required: Story = {
  args: { label: 'Name', required: true, placeholder: 'Required field' },
}

export const Disabled: Story = {
  args: { label: 'Read-only field', value: 'Cannot edit this', disabled: true },
}

export const SmallSize: Story = {
  args: { label: 'Search', type: 'search', size: 'sm', placeholder: 'Search…' },
}

export const DateInput: Story = {
  args: { label: 'Due date', type: 'date', id: 'due-date' },
}

export const Textarea: Story = {
  render: () =>
    renderTextarea({
      id: 'description',
      label: 'Description',
      placeholder: 'Add a description…',
      rows: 4,
    }),
}

export const TextareaWithError: Story = {
  render: () =>
    renderTextarea({
      id: 'notes',
      label: 'Notes',
      value: 'Some content here',
      error: 'Notes cannot exceed 10,000 characters',
    }),
}

export const SelectInput: Story = {
  render: () =>
    renderSelect({
      id: 'status',
      label: 'Status',
      emptyLabel: 'Select status…',
      options: [
        { value: 'Todo', label: 'Todo' },
        { value: 'In Progress', label: 'In Progress' },
        { value: 'Blocked', label: 'Blocked' },
        { value: 'Done', label: 'Done' },
      ],
    }),
}

export const SelectWithValue: Story = {
  render: () =>
    renderSelect({
      id: 'priority',
      label: 'Priority',
      value: 'High',
      options: [
        { value: 'Low', label: 'Low' },
        { value: 'Medium', label: 'Medium' },
        { value: 'High', label: 'High' },
        { value: 'Critical', label: 'Critical' },
      ],
    }),
}
