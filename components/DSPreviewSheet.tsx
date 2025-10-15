import React from 'react';
import { ScrollView } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import DSPreview from '../app/(dev)/DSPreview';

export default function DSPreviewSheet() {
  return (
    <ActionSheet id="ds-preview-sheet" containerStyle={{ flex: 1, backgroundColor: '#FFF7EA' }}>
      <ScrollView style={{ flex: 1 }}>
        <DSPreview />
      </ScrollView>
    </ActionSheet>
  );
}
