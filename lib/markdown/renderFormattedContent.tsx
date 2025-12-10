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

export function renderFormattedContent(text: string, options: RenderOptions = {}) {
  const {
    textColor = lightTokens.colors.charcoalInk,
    fontSize = 16,
    lineHeight = 22,
    boldFontFamily = lightTokens.typography.fontFamily.bold,
  } = options;

  const lines = text.split('\n');

  return lines.map((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (trimmed === '') {
      return <View key={index} style={{ height: 8 }} />;
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
            <Text key={`${keyPrefix}-norm-${lastIndex}`} style={{ color: textColor }}>
              {content.slice(lastIndex, match.index)}
            </Text>,
          );
        }
        parts.push(
          <Text
            key={`${keyPrefix}-bold-${match.index}`}
            style={{ fontFamily: boldFontFamily, color: textColor }}
          >
            {match[1]}
          </Text>,
        );
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < content.length) {
        parts.push(
          <Text key={`${keyPrefix}-tail-${lastIndex}`} style={{ color: textColor }}>
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
        <View key={index} style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Text style={{ marginRight: 6, color: textColor }}>•</Text>
          <Text style={{ flex: 1, color: textColor, fontSize, lineHeight }}>
            {parseBold(bulletContent, `bullet-${index}`)}
          </Text>
        </View>
      );
    }

    // Numbered list (e.g. "1. Do this")
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      return (
        <View key={index} style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Text style={{ marginRight: 6, color: textColor }}>{numberedMatch[1]}.</Text>
          <Text style={{ flex: 1, color: textColor, fontSize, lineHeight }}>
            {parseBold(numberedMatch[2], `num-${index}`)}
          </Text>
        </View>
      );
    }

    // Regular paragraph
    return (
      <View key={index} style={{ marginBottom: 4 }}>
        <Text style={{ color: textColor, fontSize, lineHeight }}>
          {parseBold(trimmed, `para-${index}`)}
        </Text>
      </View>
    );
  });
}
