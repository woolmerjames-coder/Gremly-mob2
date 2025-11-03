# Brand Fonts Setup (Plus Jakarta Sans + Inter)

Typography references already map to `PlusJakartaSans-Bold` for headers and `Inter-Regular` / `Inter-Medium` for body copy and labels.

Install and load the font families in your entry module (e.g., `App.tsx`) if they are not already linked:

```bash
expo install expo-font @expo-google-fonts/inter @expo-google-fonts/plus-jakarta-sans
```

Example usage:

```ts
import { useFonts, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
```

Fallbacks: iOS SF Pro, Android Roboto.
