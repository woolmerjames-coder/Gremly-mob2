/**
 * Tests for TodoFields component
 * Validates required fields (name + due date), optional fields, and "Add details" toggle
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { TodoFields, type TodoDetailsState } from '../components/overlay/fields/TodoFields';

describe('TodoFields', () => {
  const mockOnNameChange = jest.fn();
  const mockOnDueDateChange = jest.fn();
  const mockOnDueTimeChange = jest.fn();
  const mockOnDetailsChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Required Fields', () => {
    it('renders name input with testID', () => {
      render(
        <TodoFields
          name=""
          onNameChange={mockOnNameChange}
          dueDate={null}
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      const nameInput = screen.getByTestId('todo-name');
      expect(nameInput).toBeTruthy();
    });

    it('renders due date input with testID', () => {
      render(
        <TodoFields
          name=""
          onNameChange={mockOnNameChange}
          dueDate={null}
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      const dueDateInput = screen.getByTestId('todo-due-date');
      expect(dueDateInput).toBeTruthy();
    });

    it('calls onNameChange when name is edited', () => {
      render(
        <TodoFields
          name=""
          onNameChange={mockOnNameChange}
          dueDate={null}
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      const nameInput = screen.getByTestId('todo-name');
      fireEvent.changeText(nameInput, 'Buy groceries');
      expect(mockOnNameChange).toHaveBeenCalledWith('Buy groceries');
    });

    it('calls onDueDateChange when due date is edited', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate={null}
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      const dueDateInput = screen.getByTestId('todo-due-date');
      fireEvent.changeText(dueDateInput, '2025-06-15');
      expect(mockOnDueDateChange).toHaveBeenCalledWith('2025-06-15');
    });

    it('shows label text "Name *" for name field', () => {
      render(
        <TodoFields
          name=""
          onNameChange={mockOnNameChange}
          dueDate={null}
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      expect(screen.getByText('Name *')).toBeTruthy();
    });

    it('shows label text "Due date *" for due date field', () => {
      render(
        <TodoFields
          name=""
          onNameChange={mockOnNameChange}
          dueDate={null}
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      expect(screen.getByText('Due date *')).toBeTruthy();
    });
  });

  describe('Optional Fields', () => {
    it('renders due time input when onDueTimeChange is provided', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          dueTime={null}
          onDueTimeChange={mockOnDueTimeChange}
        />,
      );

      const dueTimeInput = screen.getByTestId('todo-due-time');
      expect(dueTimeInput).toBeTruthy();
    });

    it('calls onDueTimeChange when time is edited', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          dueTime={null}
          onDueTimeChange={mockOnDueTimeChange}
        />,
      );

      const dueTimeInput = screen.getByTestId('todo-due-time');
      fireEvent.changeText(dueTimeInput, '14:30');
      expect(mockOnDueTimeChange).toHaveBeenCalledWith('14:30');
    });

    it('does NOT render due time input when onDueTimeChange is omitted', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      expect(screen.queryByTestId('todo-due-time')).toBeNull();
    });

    it('renders RemindersList when details.reminders is provided', () => {
      const details: TodoDetailsState = {
        reminders: [],
      };

      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={details}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      // RemindersList should render with testID 'reminders-add'
      expect(screen.getByTestId('reminders-add')).toBeTruthy();
    });
  });

  describe('Add Details Toggle', () => {
    it('shows "Add details ▾" toggle when onDetailsChange is provided', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      expect(screen.getByText('Add details ▾')).toBeTruthy();
    });

    it('toggles to "Hide details ▴" when pressed', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      const toggle = screen.getByTestId('add-details-toggle');
      fireEvent.press(toggle);

      expect(screen.getByText('Hide details ▴')).toBeTruthy();
    });

    it('shows details section when toggle is pressed', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      const toggle = screen.getByTestId('add-details-toggle');
      fireEvent.press(toggle);

      // Details section should now be visible
      expect(screen.getByTestId('todo-notes')).toBeTruthy();
      expect(screen.getByTestId('todo-space')).toBeTruthy();
      expect(screen.getByTestId('todo-tag-input')).toBeTruthy();
    });

    it('hides details section when toggle is pressed twice', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      const toggle = screen.getByTestId('add-details-toggle');
      fireEvent.press(toggle); // Show
      fireEvent.press(toggle); // Hide

      expect(screen.queryByTestId('todo-notes')).toBeNull();
      expect(screen.queryByTestId('todo-space')).toBeNull();
      expect(screen.queryByTestId('todo-tag-input')).toBeNull();
    });

    it('does NOT show toggle when onDetailsChange is omitted', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      expect(screen.queryByTestId('add-details-toggle')).toBeNull();
    });
  });

  describe('Details Section - Notes', () => {
    it('renders notes textarea in details section', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ notes: null }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      expect(screen.getByTestId('todo-notes')).toBeTruthy();
    });

    it('calls onDetailsChange when notes are edited', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ notes: null }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const notesInput = screen.getByTestId('todo-notes');
      fireEvent.changeText(notesInput, 'Remember to buy milk');

      expect(mockOnDetailsChange).toHaveBeenCalledWith({
        notes: 'Remember to buy milk',
      });
    });
  });

  describe('Details Section - Space', () => {
    it('renders space selector in details section', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ spaceId: null }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      expect(screen.getByTestId('todo-space')).toBeTruthy();
    });

    it('calls onDetailsChange when space is changed', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ spaceId: null }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const spaceInput = screen.getByTestId('todo-space');
      fireEvent.changeText(spaceInput, 'space-123');

      expect(mockOnDetailsChange).toHaveBeenCalledWith({
        spaceId: 'space-123',
      });
    });
  });

  describe('Details Section - Tags', () => {
    it('renders tag input and add button in details section', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ tags: [] }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      expect(screen.getByTestId('todo-tag-input')).toBeTruthy();
      expect(screen.getByTestId('todo-tag-add')).toBeTruthy();
    });

    it('adds a tag when add button is pressed', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ tags: [] }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const tagInput = screen.getByTestId('todo-tag-input');
      const addButton = screen.getByTestId('todo-tag-add');

      fireEvent.changeText(tagInput, 'Work');
      fireEvent.press(addButton);

      expect(mockOnDetailsChange).toHaveBeenCalledWith({
        tags: ['Work'],
      });
    });

    it('does NOT add empty tags', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ tags: [] }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const tagInput = screen.getByTestId('todo-tag-input');
      const addButton = screen.getByTestId('todo-tag-add');

      fireEvent.changeText(tagInput, '   '); // Whitespace only
      fireEvent.press(addButton);

      expect(mockOnDetailsChange).not.toHaveBeenCalled();
    });

    it('does NOT add duplicate tags', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ tags: ['Work'] }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const tagInput = screen.getByTestId('todo-tag-input');
      const addButton = screen.getByTestId('todo-tag-add');

      fireEvent.changeText(tagInput, 'Work');
      fireEvent.press(addButton);

      expect(mockOnDetailsChange).not.toHaveBeenCalled();
    });

    it('renders tag chips for existing tags', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ tags: ['Work', 'Urgent'] }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      expect(screen.getByTestId('todo-tag-chip-Work')).toBeTruthy();
      expect(screen.getByTestId('todo-tag-chip-Urgent')).toBeTruthy();
    });

    it('removes a tag when chip is pressed', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          details={{ tags: ['Work', 'Urgent'] }}
          onDetailsChange={mockOnDetailsChange}
        />,
      );

      fireEvent.press(screen.getByTestId('add-details-toggle'));
      const workChip = screen.getByTestId('todo-tag-chip-Work');
      fireEvent.press(workChip);

      expect(mockOnDetailsChange).toHaveBeenCalledWith({
        tags: ['Urgent'],
      });
    });
  });

  describe('Disabled State', () => {
    it('disables name input when disabled prop is true', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          disabled={true}
        />,
      );

      const nameInput = screen.getByTestId('todo-name');
      expect(nameInput.props.editable).toBe(false);
    });

    it('disables due date input when disabled prop is true', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
          disabled={true}
        />,
      );

      const dueDateInput = screen.getByTestId('todo-due-date');
      expect(dueDateInput.props.editable).toBe(false);
    });
  });

  describe('NO Subtype Chips', () => {
    it('does NOT render any subtype chips (AI-only feature)', () => {
      render(
        <TodoFields
          name="Test"
          onNameChange={mockOnNameChange}
          dueDate="2025-06-15"
          onDueDateChange={mockOnDueDateChange}
        />,
      );

      // Verify NO subtype pills exist
      expect(screen.queryByTestId('subtype-pill-reminder')).toBeNull();
      expect(screen.queryByTestId('subtype-pill-microproject')).toBeNull();
    });
  });
});
