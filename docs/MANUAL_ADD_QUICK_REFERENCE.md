# Manual Add Quick Reference

## Opening the Manual Add Sheet

```typescript
import { openManualAdd, closeManualAdd } from '../components/ManualAddSheet';

// Basic usage (opens to Habit tab)
openManualAdd();

// Open to specific tab
openManualAdd({ defaultTab: 'habit' });
openManualAdd({ defaultTab: 'todo' });
openManualAdd({ defaultTab: 'journal' });
openManualAdd({ defaultTab: 'catchall' });

// With Space context (links items to a Space)
openManualAdd({ spaceId: 'space_123' });

// Both options together
openManualAdd({ 
  defaultTab: 'journal', 
  spaceId: 'space_456' 
});

// Close programmatically
closeManualAdd();
```

## Using the FAB

```typescript
import PlusFAB from '../components/PlusFAB';
import { openManualAdd } from '../components/ManualAddSheet';

// Simple usage
<PlusFAB onPress={() => openManualAdd()} />

// With Space context
<PlusFAB onPress={() => openManualAdd({ spaceId: id })} />

// Custom testID
<PlusFAB 
  onPress={() => openManualAdd()} 
  testID="custom-fab-id"
/>
```

## Form Fields by Tab

### Habit
- **Name** (required, max 120 chars)
- **Frequency** (required, max 60 chars)
  - Preset buttons: daily, weekly, monthly
  - Or custom text input

### To-Do
- **Name** (required, max 120 chars)
- **Due Date** (optional, YYYY-MM-DD format)

### Journal
- **Title** (optional, max 120 chars)
- **Entry** (required, multiline)
- **Inspiration Prompts** (auto-rotating)

### Catch-All
- **Note** (required, multiline)

## testID Reference

For testing:
- Tabs: `tab-habit`, `tab-todo`, `tab-journal`, `tab-catchall`
- Inputs: `input-name`, `input-frequency`, `input-dueDate`, `input-title`, `input-body`
- Frequency buttons: `frequency-daily`, `frequency-weekly`, `frequency-monthly`
- Save button: `button-save`
- FAB: `plus-fab` (or custom)

## Validation Errors

All errors appear inline below the relevant input:

```typescript
// Habit
"Name is required"
"Name too long (max 120 chars)"
"Frequency is required"
"Frequency too long"

// To-Do
"Name is required"
"Name too long (max 120 chars)"
"Date must be YYYY-MM-DD format"

// Journal
"Title too long (max 120 chars)"
"Journal entry cannot be empty"

// Catch-All
"Note cannot be empty"
```

## Success Messages

After successful save, an Alert is shown:
- Habit: "Habit saved to the Hub"
- To-Do: "To-Do saved to the Hub"
- Journal: "Journal entry saved to the Hub"
- Catch-All: "Note saved to the Hub"

## Accessibility

All interactive elements have:
- `accessibilityRole="button"` (or appropriate role)
- `accessibilityLabel` with descriptive text
- `accessibilityState` for active/selected states
- Minimum 48pt touch targets

## Example: Full Integration

```typescript
import React from 'react';
import { View } from 'react-native';
import PlusFAB from '../components/PlusFAB';
import { openManualAdd } from '../components/ManualAddSheet';

export default function MyScreen({ spaceId }: { spaceId?: string }) {
  return (
    <View style={{ flex: 1 }}>
      {/* Your screen content */}
      
      {/* FAB positioned bottom-right */}
      <PlusFAB 
        onPress={() => openManualAdd({ 
          spaceId,
          defaultTab: 'habit' 
        })} 
      />
    </View>
  );
}
```

## Testing Example

```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ManualAddSheet, { openManualAdd } from './ManualAddSheet';

// Mock repo
const mockCreate = jest.fn();
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({ create: mockCreate }),
}));

test('creates habit with spaceId', async () => {
  openManualAdd({ spaceId: 'space_123' });
  
  const { getByTestId } = render(<ManualAddSheet />);
  
  fireEvent.changeText(getByTestId('input-name'), 'Morning run');
  fireEvent.changeText(getByTestId('input-frequency'), 'daily');
  fireEvent.press(getByTestId('button-save'));
  
  await waitFor(() => {
    expect(mockCreate).toHaveBeenCalledWith({
      type: 'habit',
      title: 'Morning run',
      frequency: 'daily',
      space_id: 'space_123',
      ai_placed: false,
    });
  });
});
```
