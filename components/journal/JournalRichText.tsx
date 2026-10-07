/**
 * A journal card's words shown to read, looking exactly as they did in the
 * editor.
 */
import React from 'react';
import { EnrichedText } from 'react-native-enriched-html';
import { JOURNAL_HTML_STYLE, JOURNAL_TEXT } from './JournalEditor';

export function JournalRichText({
  html,
  numberOfLines,
  fontFamily,
  testID,
}: {
  html: string;
  numberOfLines?: number;
  fontFamily?: string;
  testID?: string;
}) {
  return (
    <EnrichedText
      htmlStyle={JOURNAL_HTML_STYLE}
      style={{ ...JOURNAL_TEXT, ...(fontFamily ? { fontFamily } : null) }}
      numberOfLines={numberOfLines}
      testID={testID}
    >
      {html}
    </EnrichedText>
  );
}
