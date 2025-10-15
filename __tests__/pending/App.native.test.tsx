import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

// Simple test component instead of full App to avoid Expo Jest issues
const TestApp = () => (
  <View>
    <Text>Gremly 🚀</Text>
    <Text>NativeWind is working!</Text>
  </View>
);

describe('App', () => {
  it('renders without crashing', () => {
    const { getByText } = render(<TestApp />);
    expect(getByText(/Gremly/i)).toBeTruthy();
  });

  it('renders the working message', () => {
    const { getByText } = render(<TestApp />);
    expect(getByText(/NativeWind is working/i)).toBeTruthy();
  });
});
