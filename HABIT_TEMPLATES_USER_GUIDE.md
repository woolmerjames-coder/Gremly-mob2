# Habit Templates - Quick Start Guide

## What are Habit Templates?

Habit templates allow you to attach a reusable checklist to a habit. The checklist automatically resets every day, giving you a fresh start without manual recreation.

---

## Creating a Template

### Option 1: From an Existing Habit Checklist

1. Open a habit that has a checklist
2. Scroll to the template actions section
3. Tap **"Save as template"**
4. Enter a template name (e.g., "Morning Routine")
5. Template is saved and ready to use

### Option 2: From Any Note/Todo with a Checklist

1. Open any note or todo with a checklist
2. Tap **"Save as template"**
3. Choose scope: `habit`, `note`, `todo`, or `any`
4. Template can now be used by habits (if scope is `habit` or `any`)

---

## Attaching a Template to a Habit

1. Open a habit in the overlay
2. Tap **"+ Add checklist"** if habit doesn't have one
3. Tap **"🔗 Attach template"** button
4. Select a template from the picker
5. Checklist is seeded from template (if habit was empty)

✅ **Habit now has template attached!**

---

## How Daily Reset Works

### Automatic Reset
- Every morning when you open the **Today** screen
- Habit's checklist reloads from the template
- All items reset to unchecked (fresh start)
- Previous day's progress is replaced

### What Gets Reset
- ✅ All checklist items
- ✅ All checkboxes set to unchecked
- ✅ Fresh UUIDs generated for items

### What Doesn't Get Reset
- ❌ Habit name/title
- ❌ Habit frequency/settings
- ❌ Habit tags/categories
- ❌ Template linkage (stays attached)

---

## Example: Morning Routine Habit

### 1. Create Template
```
Template Name: "Morning Routine"
Items:
- [ ] Meditate 10 minutes
- [ ] Cold shower
- [ ] Protein smoothie
- [ ] Review daily goals
```

### 2. Attach to Habit
```
Habit: "Complete morning routine"
Frequency: Daily
Template: "Morning Routine" (attached)
```

### 3. Daily Usage
**Monday Morning:**
- [ ] Meditate 10 minutes
- [ ] Cold shower
- [ ] Protein smoothie
- [ ] Review daily goals

*User completes items throughout the day:*
- [x] Meditate 10 minutes
- [x] Cold shower
- [ ] Protein smoothie (skipped)
- [x] Review daily goals

**Tuesday Morning:**
*Checklist automatically resets:*
- [ ] Meditate 10 minutes
- [ ] Cold shower
- [ ] Protein smoothie
- [ ] Review daily goals

---

## Changing or Removing Templates

### Change Template
1. Open habit in overlay
2. Tap **"🔗 Change template"**
3. Select a different template
4. Checklist updates immediately

### Remove Template Linkage
1. Open habit in overlay
2. Use repo.update to set `list_template_id: null`
3. Checklist becomes static (no more auto-reset)
4. Current items are preserved

### Update Template Items
1. Find a habit/note/todo using that template
2. Edit the checklist
3. Tap **"Save as template"** with same name
4. Confirm overwrite
5. All habits using this template will reset from updated version next day

---

## Template Management

### View Templates
Currently, templates are managed through the overlay. To see your templates:
1. Create or open any entity with a checklist
2. Tap **"Apply template"** to see available templates

### Delete Template
1. Use repo.deleteListTemplate(templateId)
2. Habits using this template:
   - Lose template linkage (list_template_id → NULL)
   - Keep current checklist items
   - No longer auto-reset daily

---

## Advanced Tips

### Share Templates Across Multiple Habits

**Example: Workout Routine**
```
Template: "Gym Workout"
- [ ] Warm-up 5 min
- [ ] Push-ups x20
- [ ] Squats x30
- [ ] Cool-down

Habits Using This Template:
- "Morning gym"
- "Lunch break workout"
- "Evening fitness"

All three habits reset from same template daily!
```

### Scope-Specific Templates

When creating a template, choose the right scope:
- **`habit`** - Only available for habits
- **`note`** - Only available for notes
- **`todo`** - Only available for todos
- **`any`** - Available for all entity types

### Template vs. Manual Checklist

| Feature | Template-Linked | Manual Checklist |
|---------|----------------|------------------|
| Daily reset | ✅ Automatic | ❌ Manual recreation |
| Centralized updates | ✅ Yes | ❌ No |
| Reusable | ✅ Yes | ❌ No |
| Flexibility | 🟡 Template-driven | ✅ Full control |

---

## Troubleshooting

### Checklist Not Resetting
**Problem:** Habit has template but checklist doesn't reset

**Solutions:**
1. Check `list_template_id` is set (not NULL)
2. Verify template still exists (not deleted)
3. Ensure `last_reset_date` is from previous day
4. Open Today screen to trigger reset logic

### Template Not Found
**Problem:** "Attach template" shows no templates

**Solutions:**
1. Create a template first (via "Save as template")
2. Ensure template scope is `habit` or `any`
3. Check template belongs to your user account

### Items Not Unchecking
**Problem:** After reset, some items stay checked

**Solutions:**
1. This shouldn't happen - reset uses replace mode
2. Check template items are all `checked: false`
3. Verify reset logic ran (check logs)

---

## Database Queries (Debug)

### Find Habits Using Templates
```sql
SELECT h.id, h.name, lt.name as template_name
FROM habits h
JOIN list_templates lt ON h.list_template_id = lt.id
WHERE h.owner_id = '<your-user-id>';
```

### Check Last Reset Date
```sql
SELECT id, name, list_template_id, last_reset_date
FROM habits
WHERE owner_id = '<your-user-id>'
  AND list_template_id IS NOT NULL;
```

### Count Template Usage
```sql
SELECT lt.name, COUNT(h.id) as habit_count
FROM list_templates lt
LEFT JOIN habits h ON h.list_template_id = lt.id
WHERE lt.owner_id = '<your-user-id>'
GROUP BY lt.id, lt.name
HAVING COUNT(h.id) > 0;
```

---

## API Reference

### Attach Template to Habit
```typescript
await repo.update({
  id: habitId,
  patch: {
    list_template_id: templateId,
    has_list: true,
    list_items: seedItems, // Initial items from template
  },
});
```

### Remove Template Linkage
```typescript
await repo.update({
  id: habitId,
  patch: {
    list_template_id: null,
    // list_items preserved
  },
});
```

### Check if Reset Needed
```typescript
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const lastResetDay = habit.last_reset_date?.split('T')[0];
const needsReset = lastResetDay !== today;
```

---

## Summary

Habit templates provide a powerful way to manage recurring checklists:

✅ **Create once, use many times**  
✅ **Automatic daily reset**  
✅ **Centralized template management**  
✅ **No manual recreation needed**  

Perfect for morning routines, workout plans, bedtime rituals, and any recurring task lists!
