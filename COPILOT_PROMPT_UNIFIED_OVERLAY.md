# Copilot Chat Prompt for UnifiedOverlayV2.tsx Integration

**Instructions: Open `components/overlay/UnifiedOverlayV2.tsx` in VS Code, then paste this EXACTLY into Copilot Chat:**

---

You are updating the tag extraction logic to use the new deterministic extractor.

Instructions:
1. Import extractMeaningfulTags from ../../lib/tags/extractTags
2. Replace ALL AI-based tag suggestions and token-level extraction with extractMeaningfulTags(currentText, subtype)
3. For subtype parameter, determine from context:
   - Use 'journal' for logs with journal subtype or reflective text
   - Use 'list' for list-like text
   - Use 'idea' for ideation text  
   - Pass undefined for other cases
4. Ensure these still work correctly:
   - normalizeTag is still applied to results
   - stickyTags + tombstones still work (tags_meta preservation)
   - habit tag filtering (single-word limit via filterHabitTags) still applies
   - emotion tags still go to journal logs only (via mergeLogTags)
   - list/journal/idea subtype detection still works
5. Do NOT overwrite:
   - user-edited tags (respect tagsDirty flag)
   - manually added tags
   - tombstoned tags
6. Ensure Mind Drop → Todo/Habit mappings still apply the filterHabitTags rules
7. Make the smallest possible change - only replace tag extraction logic, don't refactor other code
8. After updating, existing tag tests should still pass

Key functions to preserve:
- mergeLogTags() - for log/journal emotion tag prioritization
- filterHabitTags() - for habit single-word limit
- filterAndNormalizeTags() - for tag cleanup
- Tag dirty tracking logic

Replace token-based extraction and AI calls with deterministic extractMeaningfulTags.

---

**After Copilot makes changes:**
1. Review the diff carefully
2. Ensure no breaking changes to tag metadata (sticky/tombstones)
3. Test with: `npm test -- tag.quality`
4. Test Mind Drop flows manually
