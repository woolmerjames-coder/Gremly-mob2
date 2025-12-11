/**
 * Shared markdown renderer for chat bubbles and overlays
 * Supports: **bold**, bullets (• or -), numbered lists (1. 2. 3.)
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';

interface RenderOptions {
  textColor?: string;
  fontSize?: number;
  lineHeight?: number;
  boldFontFamily?: string;
}

// Markdown style constants
const MARKDOWN_STYLES = {
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: '#2D2D2D',
    letterSpacing: -0.2,
  },
  paragraph: {
    marginBottom: 12, // Space between paragraphs
  },
  strong: {
    fontWeight: '600' as const, // Medium, not bold
    color: '#1D1D1D',
  },
  list: {
    marginVertical: 4,
  },
  listItem: {
    marginBottom: 8, // Increased bullet spacing
  },
  bullet: {
    fontSize: 13, // 85% of 15 - smaller bullet
    lineHeight: 21,
    marginRight: 6, // Reduced indent
    color: '#888', // Subtle bullet color
  },
  emptyLine: {
    height: 10, // Slightly more breathing room
  },
} as const;

export function renderFormattedContent(text: string, options: RenderOptions = {}) {
  const {
    textColor = MARKDOWN_STYLES.body.color,
    fontSize = MARKDOWN_STYLES.body.fontSize,
    lineHeight = MARKDOWN_STYLES.body.lineHeight,
    boldFontFamily = lightTokens.typography.fontFamily.bold,
  } = options;

  const lines = text.split('\n');

  return lines.map((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (trimmed === '') {
      return <View key={index} style={{ height: MARKDOWN_STYLES.emptyLine.height }} />;
    }

    // Helper to parse bold syntax within text
    const parseBold = (content: string, keyPrefix: string) => {
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          parts.push(
            <Text
              key={`${keyPrefix}-norm-${lastIndex}`}
              style={{ color: textColor, letterSpacing: MARKDOWN_STYLES.body.letterSpacing }}
            >
              {content.slice(lastIndex, match.index)}
            </Text>,
          );
        }
        parts.push(
          <Text
            key={`${keyPrefix}-bold-${match.index}`}
            style={{
              fontFamily: boldFontFamily,
              fontWeight: MARKDOWN_STYLES.strong.fontWeight,
              color: MARKDOWN_STYLES.strong.color,
              letterSpacing: MARKDOWN_STYLES.body.letterSpacing,
            }}
          >
            {match[1]}
          </Text>,
        );
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < content.length) {
        parts.push(
          <Text
            key={`${keyPrefix}-tail-${lastIndex}`}
            style={{ color: textColor, letterSpacing: MARKDOWN_STYLES.body.letterSpacing }}
          >
            {content.slice(lastIndex)}
          </Text>,
        );
      }

      return parts.length > 0 ? parts : content;
    };

    // Bullet line (• or -)
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      const bulletContent = trimmed.slice(2);
      return (
        <View
          key={index}
          style={{ flexDirection: 'row', marginBottom: MARKDOWN_STYLES.listItem.marginBottom }}
        >
          <Text
            style={{
              marginRight: MARKDOWN_STYLES.bullet.marginRight,
              color: MARKDOWN_STYLES.bullet.color,
              fontSize: MARKDOWN_STYLES.bullet.fontSize,
              lineHeight: MARKDOWN_STYLES.bullet.lineHeight,
            }}
          >
            •
          </Text>
          <Text
            style={{
              flex: 1,
              color: textColor,
              fontSize,
              lineHeight,
              letterSpacing: MARKDOWN_STYLES.body.letterSpacing,
            }}
          >
            {parseBold(bulletContent, `bullet-${index}`)}
          </Text>
        </View>
      );
    }

    // Numbered list (e.g. "1. Do this")
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      return (
        <View
          key={index}
          style={{ flexDirection: 'row', marginBottom: MARKDOWN_STYLES.listItem.marginBottom }}
        >
          <Text
            style={{
              marginRight: MARKDOWN_STYLES.bullet.marginRight,
              color: MARKDOWN_STYLES.bullet.color,
              fontSize: MARKDOWN_STYLES.bullet.fontSize,
              lineHeight: MARKDOWN_STYLES.bullet.lineHeight,
            }}
          >
            {numberedMatch[1]}.
          </Text>
          <Text
            style={{
              flex: 1,
              color: textColor,
              fontSize,
              lineHeight,
              letterSpacing: MARKDOWN_STYLES.body.letterSpacing,
            }}
          >
            {parseBold(numberedMatch[2], `num-${index}`)}
          </Text>
        </View>
      );
    }

    // Regular paragraph
    return (
      <View key={index} style={{ marginBottom: MARKDOWN_STYLES.paragraph.marginBottom }}>
        <Text
          style={{
            color: textColor,
            fontSize,
            lineHeight,
            letterSpacing: MARKDOWN_STYLES.body.letterSpacing,
          }}
        >
          {parseBold(trimmed, `para-${index}`)}
        </Text>
      </View>
    );
  });
}
