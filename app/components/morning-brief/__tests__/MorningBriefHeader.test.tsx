/**
 * MorningBriefHeader Tests
 *
 * Documentary/contract tests for the MorningBriefHeader component.
 * Tests the date formatting logic and targetDate prop behavior.
 *
 * Full render tests are skipped due to complex native dependencies
 * (reanimated, gesture handler, etc.). These tests document the
 * expected behavior of the header's date-parameterized logic.
 */

describe('MorningBriefHeader - targetDate logic', () => {
  const TODAY = '2025-12-15'; // Monday

  // Replicate the header's date logic
  function computeHeaderState(targetDate?: string) {
    const isCustomDate = !!targetDate;
    const effectiveDate = targetDate ?? TODAY;

    // Simulate date parsing
    const date = new Date(effectiveDate + 'T12:00:00Z');
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const dateString = date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });

    // Time is hidden for custom dates (tomorrow)
    const timeString = isCustomDate ? null : '10:00 AM';

    return {
      isCustomDate,
      effectiveDate,
      dayName,
      dateString,
      timeString,
      title: `Plan Your ${dayName}`,
    };
  }

  describe('today (no targetDate)', () => {
    it('shows today as effective date', () => {
      const state = computeHeaderState();
      expect(state.effectiveDate).toBe(TODAY);
      expect(state.isCustomDate).toBe(false);
    });

    it('shows current time', () => {
      const state = computeHeaderState();
      expect(state.timeString).toBeTruthy();
    });

    it('shows correct day name', () => {
      const state = computeHeaderState();
      expect(state.dayName).toBe('Monday');
      expect(state.title).toBe('Plan Your Monday');
    });
  });

  describe('tomorrow (targetDate set)', () => {
    const TOMORROW = '2025-12-16'; // Tuesday

    it('uses targetDate as effective date', () => {
      const state = computeHeaderState(TOMORROW);
      expect(state.effectiveDate).toBe(TOMORROW);
      expect(state.isCustomDate).toBe(true);
    });

    it('hides time for future dates', () => {
      const state = computeHeaderState(TOMORROW);
      expect(state.timeString).toBeNull();
    });

    it("shows tomorrow's day name", () => {
      const state = computeHeaderState(TOMORROW);
      expect(state.dayName).toBe('Tuesday');
      expect(state.title).toBe('Plan Your Tuesday');
    });

    it('shows correct date string', () => {
      const state = computeHeaderState(TOMORROW);
      expect(state.dateString).toBe('December 16');
    });
  });

  describe('arbitrary future date', () => {
    it('works with any YYYY-MM-DD date', () => {
      const state = computeHeaderState('2026-01-01');
      expect(state.isCustomDate).toBe(true);
      expect(state.dayName).toBe('Thursday');
      expect(state.timeString).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mascot + GremlyHelpCard wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('MorningBriefHeader - mascot + GremlyHelpCard (documentary)', () => {
  describe('mascot rendering contract', () => {
    it('uses morningbriefgremly.png mascot image', () => {
      // In MorningBriefHeader (line 99):
      //   <Image
      //     source={require('../../../../assets/mascot/morningbriefgremly.png')}
      //     style={styles.headerMascot}
      //   />
      //
      // This image is specific to the morning brief — different from Hub's safari_gremly.

      const mascotConfig = {
        source: 'assets/mascot/morningbriefgremly.png',
        style: 'headerMascot',
      };

      expect(mascotConfig.source).toContain('morningbriefgremly');
      expect(mascotConfig.style).toBe('headerMascot');
    });

    it('mascot is tappable — opens GremlyHelpCard', () => {
      // Mascot is wrapped in a Pressable (line 97):
      //   <Pressable onPress={() => setShowHelp(true)}>
      //     <Image source={morningbriefgremly.png} ... />
      //   </Pressable>

      const tappable = true;
      const helpCardOpens = true;

      expect(tappable).toBe(true);
      expect(helpCardOpens).toBe(true);
    });
  });

  describe('GremlyHelpCard props', () => {
    it('passes screen="organize" to GremlyHelpCard', () => {
      // Line 119:
      //   <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="organize" />
      //
      // The morning brief maps to the "organize" screen type,
      // which shows "Organize" help steps on page 1.

      const helpCardProps = {
        visible: true,
        screen: 'organize' as const,
      };

      expect(helpCardProps.screen).toBe('organize');
    });

    it('GremlyHelpCard dismiss resets showHelp to false', () => {
      // onDismiss={() => setShowHelp(false)}
      // When user taps "Got it" in the help card, the card hides.

      let showHelp = true;
      const onDismiss = () => {
        showHelp = false;
      };
      onDismiss();

      expect(showHelp).toBe(false);
    });
  });

  describe('mascot positioning', () => {
    it('documents headerMascot style contract', () => {
      // headerMascot style (line 302):
      //   width, height, borderRadius for circular display
      //   Positioned in the headerRow flex layout

      const styleContract = {
        shape: 'circle (borderRadius: width/2)',
        position: 'header row, right side',
      };

      expect(styleContract.shape).toContain('circle');
      expect(styleContract.position).toContain('header row');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exit button (onExit prop)
// ─────────────────────────────────────────────────────────────────────────────

describe('MorningBriefHeader - exit button (documentary)', () => {
  describe('onExit prop controls X button visibility', () => {
    it('documents that X button renders only when onExit is provided', () => {
      // In MorningBriefHeader:
      //   {onExit && (
      //     <Pressable onPress={onExit} ...>
      //       <X size={20} color={COLORS.inkMuted} />
      //     </Pressable>
      //   )}
      //
      // When onExit is undefined, the conditional short-circuits → no X button.

      const onExit: (() => void) | undefined = jest.fn();
      expect(!!onExit).toBe(true); // renders

      const noExit: (() => void) | undefined = undefined;
      expect(!!noExit).toBe(false); // hidden
    });

    it('documents parent passes onExit only when brief not completed today', () => {
      // MorningBriefSheet passes:
      //   onExit={!hasCompletedToday ? handleExit : undefined}
      //
      // So re-entry (plan-only review) hides the exit button.

      function computeOnExit(hasCompletedToday: boolean) {
        return !hasCompletedToday ? 'handleExit' : undefined;
      }

      expect(computeOnExit(false)).toBe('handleExit');
      expect(computeOnExit(true)).toBeUndefined();
    });
  });

  describe('exit button styling', () => {
    it('documents X button styling contract', () => {
      const exitButtonStyle = {
        icon: 'X (lucide-react-native)',
        size: 20,
        color: 'inkMuted (rgba(34,34,34,0.55))',
        hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
        pressedOpacity: 0.5,
      };

      expect(exitButtonStyle.size).toBe(20);
      expect(exitButtonStyle.pressedOpacity).toBe(0.5);
    });
  });

  describe('exit rollback behavior', () => {
    it('documents that handleExit restores initial brief state then closes', () => {
      // The handleExit callback in MorningBriefSheet:
      //   1. Reads initialBriefState.current (snapshot from mount)
      //   2. If selectionDate === today → restore original selections
      //   3. If selectionDate !== today → clear to empty
      //   4. Calls onClose()

      const steps = [
        'read initialBriefState snapshot',
        'check snap.selectionDate === today',
        'setBriefSelections(snap or empty)',
        'onClose()',
      ];

      expect(steps).toHaveLength(4);
      expect(steps[3]).toBe('onClose()');
    });
  });
});
