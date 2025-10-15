import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Screen from '../../components/layout/Screen';
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
        <View className="p-4">
          <Text className="text-base text-text-primary">
            First tab content with NativeWind styles
          </Text>
        </View>
      ),
    },
    {
      id: 'tab2',
      label: 'Second',
      content: (
        <View className="p-4">
          <Text className="text-base text-text-primary">
            Second tab content with NativeWind styles
          </Text>
        </View>
      ),
    },
    {
      id: 'tab3',
      label: 'Third',
      content: (
        <View className="p-4">
          <Text className="text-base text-text-primary">
            Third tab content with NativeWind styles
          </Text>
        </View>
      ),
    },
  ];

  return (
    <Screen scroll testID="screen-ds-preview">
      {/* Header */}
      <View className="mb-6">
        <Text className="text-2xl font-bold text-text-primary mb-2">Design System Gallery</Text>
        <Text className="text-base text-text-muted">
          NativeWind v2 + tailwind-variants components
        </Text>
      </View>

      {/* Buttons */}
      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Button</Text>
        <View className="gap-y-3">
          <Button label="Primary Button" variant="primary" onPress={() => console.log('Primary')} />
          <Button
            label="Secondary Button"
            variant="secondary"
            onPress={() => console.log('Secondary')}
          />
          <Button label="Outline Button" variant="outline" onPress={() => console.log('Outline')} />
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
        </View>
      </Card>

      {/* Icons */}
      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Icon</Text>
        <View className="flex-row gap-x-4 mb-4">
          <Icon name="Home" size="xs" />
          <Icon name="Search" size="sm" />
          <Icon name="Settings" size="md" />
          <Icon name="User" size="lg" />
          <Icon name="Bell" size="xl" />
        </View>
        <View className="flex-row gap-x-4">
          <Icon name="Heart" color="#EF4444" />
          <Icon name="Star" color="#F59E0B" />
          <Icon name="Check" color="#10B981" />
          <Icon name="AlertCircle" color="#3B82F6" />
        </View>
      </Card>

      {/* Input */}
      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Input</Text>
        <View className="gap-y-4">
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
        </View>
      </Card>

      {/* Textarea */}
      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Textarea</Text>
        <View className="gap-y-4">
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
        </View>
      </Card>

      {/* Badges */}
      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Badge</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          <Badge label="Primary" variant="primary" />
          <Badge label="Success" variant="success" />
          <Badge label="Warning" variant="warning" />
          <Badge label="Error" variant="error" />
          <Badge label="Info" variant="info" />
          <Badge label="Neutral" variant="neutral" />
        </View>
        <View className="flex-row flex-wrap gap-2 mb-4">
          <Badge label="Small" size="sm" />
          <Badge label="Medium" size="md" />
          <Badge label="Large" size="lg" />
        </View>
      </Card>

      {/* ListItem */}
      <Card padding="none" className="mb-6">
        <Text className="text-xl font-semibold text-text-primary px-4 pt-4 mb-2">ListItem</Text>
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

      {/* Tabs */}
      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Tabs (Default)</Text>
        <Tabs
          tabs={demoTabs}
          defaultTabId="tab1"
          onTabChange={(id) => console.log('Tab changed:', id)}
        />
      </Card>

      <Card className="mb-6">
        <Text className="text-xl font-semibold text-text-primary mb-4">Tabs (Pills)</Text>
        <Tabs
          tabs={demoTabs}
          variant="pills"
          defaultTabId="tab2"
          onTabChange={(id) => console.log('Pills tab:', id)}
        />
      </Card>
    </Screen>
  );
}
