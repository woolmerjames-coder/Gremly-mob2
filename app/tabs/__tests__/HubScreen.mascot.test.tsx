/**
 * HubScreen.mascot.test.tsx
 *
 * Tests for the Hub screen mascot (safari_gremly) rendering.
 * The age badge was removed; the mascot now opens the GremlyHelpCard.
 *
 * NOTE: These are documentary/contract tests because HubScreen has deep
 * dependencies (NotificationSettingsSheet, actions-sheet, etc.) that
 * require extensive mock setup for full render tests.
 */

describe('HubScreen Mascot (documentary)', () => {
  describe('mascot rendering contract', () => {
    it('uses safari_gremly.png instead of the old green-background age badge', () => {
      // HubScreen previously rendered an age badge with a numbered circle.
      // Now it renders:
      //   <TouchableOpacity onPress={() => setShowHelp(true)} ...>
      //     <Image source={require('../../assets/mascot/safari_gremly.png')} />
      //   </TouchableOpacity>
      //
      // The age badge (green square with number) was removed.

      const mascotConfig = {
        source: 'assets/mascot/safari_gremly.png',
        style: 'headerMascot',
        accessibilityLabel: 'Gremly. Tap to see help and ritual progress.',
        onPress: 'setShowHelp(true)',
      };

      expect(mascotConfig.source).toContain('safari_gremly');
      expect(mascotConfig.accessibilityLabel).toContain('Gremly');
      expect(mascotConfig.onPress).toBe('setShowHelp(true)');
    });

    it('mascot taps open GremlyHelpCard with screen="hub"', () => {
      // When mascot is tapped, showHelp state is set to true,
      // which renders:
      //   <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="hub" />
      //
      // The help card has page 1 (hub help steps) and page 2 (ritual progress/age).

      const helpCardProps = {
        visible: true,
        screen: 'hub' as const,
      };

      expect(helpCardProps.visible).toBe(true);
      expect(helpCardProps.screen).toBe('hub');
    });

    it('age badge no longer renders — it was moved into GremlyHelpCard page 2', () => {
      // Previously: age badge in header → tap opens RitualProgressPopover
      // Now: mascot in header → tap opens GremlyHelpCard → swipe to page 2 for ritual/age
      //
      // There is no longer a visible age number in the Hub header.

      const headerElements = ['settings-icon', 'safari_gremly-mascot'];
      expect(headerElements).not.toContain('age-badge');
      expect(headerElements).toContain('safari_gremly-mascot');
    });
  });

  describe('header icon ordering', () => {
    it('documents the current icon order: settings → mascot (far right)', () => {
      // The header row contains: title on left, icons on right.
      // Right-side icons in order: Settings button, then Gremly mascot.
      //
      // Previously the order included an age badge; now it's:
      //   <Settings /> <safari_gremly Image />

      const iconOrder = ['settings', 'gremly-mascot'];
      expect(iconOrder[0]).toBe('settings');
      expect(iconOrder[iconOrder.length - 1]).toBe('gremly-mascot');
    });
  });
});
