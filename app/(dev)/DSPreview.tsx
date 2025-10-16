import React, { useState } from 'react';
import { Screen, Box, Text } from '../../ui';
import {
  Button,
  Icon,
  Input,
  Textarea,
  Card,
  Badge,
  ListItem,
  Tabs,
  type Tab,
} from '../../design-system';

export default function DSPreview() {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');

  const demoTabs: Tab[] = [
    {
      id: 'tab1',
      label: 'First',
      content: (
        <Box p={4}>
          <Text variant="body">First tab content with DS primitives</Text>
        </Box>
      ),
    },
    {
      id: 'tab2',
      label: 'Second',
      content: (
        <Box p={4}>
          <Text variant="body">Second tab content with DS primitives</Text>
        </Box>
      ),
    },
    {
      id: 'tab3',
      label: 'Third',
      content: (
        <Box p={4}>
          <Text variant="body">Third tab content with DS primitives</Text>
        </Box>
      ),
    },
  ];

  return (
    <Screen scroll testID="screen-ds-preview">
      {/* Header */}
      <Box mb={6}>
        <Box mb={2}>
          <Text variant="display">Design System Gallery</Text>
        </Box>
        <Text variant="subtle">DS primitives with design tokens</Text>
      </Box>

      {/* Buttons */}
      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Button</Text>
          </Box>
          <Box gap={3}>
            <Button
              label="Primary Button"
              variant="primary"
              onPress={() => console.log('Primary')}
            />
            <Button
              label="Secondary Button"
              variant="secondary"
              onPress={() => console.log('Secondary')}
            />
            <Button
              label="Outline Button"
              variant="outline"
              onPress={() => console.log('Outline')}
            />
            <Button label="Ghost Button" variant="ghost" onPress={() => console.log('Ghost')} />
            <Button label="Small Button" size="sm" onPress={() => console.log('Small')} />
            <Button label="Large Button" size="lg" onPress={() => console.log('Large')} />
            <Button
              label="With Left Icon"
              leftIcon={<Icon name="Heart" size="sm" color="#FFF" />}
              onPress={() => console.log('Left Icon')}
            />
            <Button
              label="With Right Icon"
              rightIcon={<Icon name="ArrowRight" size="sm" color="#FFF" />}
              onPress={() => console.log('Right Icon')}
            />
            <Button label="Loading..." isLoading onPress={() => console.log('Loading')} />
            <Button label="Disabled" disabled onPress={() => console.log('Disabled')} />
          </Box>
        </Card>
      </Box>

      {/* Icons */}
      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Icon</Text>
          </Box>
          <Box row gap={4} mb={4}>
            <Icon name="Home" size="xs" />
            <Icon name="Search" size="sm" />
            <Icon name="Settings" size="md" />
            <Icon name="User" size="lg" />
            <Icon name="Bell" size="xl" />
          </Box>
          <Box row gap={4}>
            <Icon name="Heart" color="#EF4444" />
            <Icon name="Star" color="#F59E0B" />
            <Icon name="Check" color="#10B981" />
            <Icon name="AlertCircle" color="#3B82F6" />
          </Box>
        </Card>
      </Box>

      {/* Input */}
      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Input</Text>
          </Box>
          <Box gap={4}>
            <Input
              label="Default Input"
              placeholder="Enter text..."
              value={inputValue}
              onChangeText={setInputValue}
            />
            <Input
              label="With Helper"
              placeholder="Email"
              helperText="We'll never share your email"
            />
            <Input label="With Error" placeholder="Username" error="Username is required" />
            <Input
              label="With Left Icon"
              placeholder="Search..."
              leftIcon={<Icon name="Search" size="sm" color="#6B7280" />}
            />
            <Input label="Filled Variant" placeholder="Filled input" variant="filled" />
          </Box>
        </Card>
      </Box>

      {/* Textarea */}
      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Textarea</Text>
          </Box>
          <Box gap={4}>
            <Textarea
              label="Default Textarea"
              placeholder="Enter your message..."
              value={textareaValue}
              onChangeText={setTextareaValue}
              rows={4}
            />
            <Textarea
              label="With Character Count"
              placeholder="Max 200 characters"
              maxLength={200}
              helperText="Share your thoughts"
            />
          </Box>
        </Card>
      </Box>

      {/* Badges */}
      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Badge</Text>
          </Box>
          <Box row gap={2} mb={4} style={{ flexWrap: 'wrap' }}>
            <Badge label="Primary" variant="primary" />
            <Badge label="Success" variant="success" />
            <Badge label="Warning" variant="warning" />
            <Badge label="Error" variant="error" />
            <Badge label="Info" variant="info" />
            <Badge label="Neutral" variant="neutral" />
          </Box>
          <Box row gap={2} style={{ flexWrap: 'wrap' }}>
            <Badge label="Small" size="sm" />
            <Badge label="Medium" size="md" />
            <Badge label="Large" size="lg" />
          </Box>
        </Card>
      </Box>

      {/* ListItem */}
      <Box mb={6}>
        <Card padding="none">
          <Box px={4} pt={4} mb={2}>
            <Text variant="title">ListItem</Text>
          </Box>
          <ListItem
            title="Simple Item"
            onPress={() => console.log('Simple')}
            rightIcon={<Icon name="ChevronRight" size="sm" color="#6B7280" />}
          />
          <ListItem
            title="With Subtitle"
            subtitle="Additional information goes here"
            onPress={() => console.log('Subtitle')}
            rightIcon={<Icon name="ChevronRight" size="sm" color="#6B7280" />}
            variant="bordered"
          />
          <ListItem
            title="With Left Icon"
            subtitle="Icon on the left side"
            leftIcon={<Icon name="User" size="md" color="#0F4C5C" />}
            onPress={() => console.log('Left Icon')}
            variant="bordered"
          />
        </Card>
      </Box>

      {/* Tabs */}
      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Tabs (Default)</Text>
          </Box>
          <Tabs
            tabs={demoTabs}
            defaultTabId="tab1"
            onTabChange={(id) => console.log('Tab changed:', id)}
          />
        </Card>
      </Box>

      <Box mb={6}>
        <Card>
          <Box mb={4}>
            <Text variant="title">Tabs (Pills)</Text>
          </Box>
          <Tabs
            tabs={demoTabs}
            variant="pills"
            defaultTabId="tab2"
            onTabChange={(id) => console.log('Pills tab:', id)}
          />
        </Card>
      </Box>
    </Screen>
  );
}
