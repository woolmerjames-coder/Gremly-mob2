# Phase 4 Development Login & Smoke Test

## Implementation Summary

Successfully added a development-only login screen and floating debug button for testing Phase 4 Supabase authentication and repository integration.

---

## Files Created

### 1. `app/(dev)/DevLogin.tsx` (NEW - 226 lines)
**Purpose**: Development login screen and Supabase smoke test

**Features**:
- Email + password authentication
- Magic link authentication (email only)
- Current auth state display (userId, email)
- "Create Test To-Do" button that:
  - Creates a todo: `{ type: 'todo', title: 'Phase 4 smoke', body: 'created from Dev Login', undefined_due: true }`
  - Uses `useRepo()` hook
  - Verifies creation with `getById()`
- Environment info display (repo backend, Supabase URL/key status)
- Result logging for all operations
- Fully typed TypeScript with NativeWind classes

**Components Used**:
- `useAuth()` - session management, signIn/signOut
- `useRepo()` - repository operations
- NativeWind/Tailwind classes for styling
- ScrollView for content overflow

---

## Files Modified

### 2. `navigation/RootNavigator.tsx` (MODIFIED)
**Changes**:
- Added import: `import DevLogin from '../app/(dev)/DevLogin'`
- Added `DevLogin: undefined` to `RootStackParamList` type
- Added Stack.Screen conditionally with `__DEV__` guard:
  ```tsx
  {__DEV__ && (
    <Stack.Screen
      name="DevLogin"
      component={DevLogin}
      options={{
        title: 'Dev Login & Smoke Test',
        presentation: 'modal',
        headerShown: true,
      }}
    />
  )}
  ```
- Screen only exists in development builds

### 3. `components/OverlayHost.tsx` (MODIFIED)
**Changes**:
- Added navigation imports:
  ```tsx
  import { useNavigation } from '@react-navigation/native';
  import { NativeStackNavigationProp } from '@react-navigation/native-stack';
  import type { RootStackParamList } from '../navigation/RootNavigator';
  ```
- Replaced empty component with floating debug button:
  ```tsx
  export const OverlayHost = () => {
    if (!__DEV__) return null;
    
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    
    return (
      <Pressable
        className="absolute bottom-6 right-6 w-12 h-12 rounded-full items-center justify-center bg-black/60"
        onPress={() => navigation.navigate('DevLogin')}
      >
        <Text className="text-white text-xs font-bold">DEV</Text>
      </Pressable>
    );
  };
  ```
- Button position: **bottom-right corner** (24px from edges)
- Button appearance: Semi-transparent black circle with "DEV" label
- Button behavior: Navigates to DevLogin modal
- **Guarded with `__DEV__`**: Will not appear in production builds

### 4. `lib/supabase/client.ts` (MODIFIED)
**Changes**:
- Added defensive logging after environment variable reads:
  ```tsx
  if (__DEV__) {
    console.log('[Supabase Client] Initializing...');
    console.log('[Supabase Client] URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
    console.log('[Supabase Client] Anon Key:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
    console.log('[Supabase Client] Repo Backend:', process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory (default)');
  }
  ```
- Logs only appear in development mode
- Helps debug environment variable loading issues

---

## How to Use

### Accessing Dev Login Screen

1. **Run the app in development mode**:
   ```bash
   npm start
   ```

2. **Look for the floating "DEV" button**:
   - Located at **bottom-right corner** of the screen
   - Semi-transparent black circle with white "DEV" text
   - Only visible in `__DEV__` builds

3. **Tap the DEV button**:
   - Opens DevLogin screen as a modal
   - Can dismiss by swiping down or using back button

### Testing Authentication

#### With Memory Backend (Default)
1. No Supabase setup required
2. Auth operations will work with mock data
3. Repo operations use in-memory storage

#### With Supabase Backend
1. Set up `.env.local`:
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_REPO_BACKEND=supabase
   ```

2. Create Supabase account and tables (see `docs/phase4-supabase-implementation.md`)

3. **Test Password Login**:
   - Enter email and password
   - Tap "Sign In (Password)"
   - Should see user email and userId displayed

4. **Test Magic Link Login**:
   - Enter email only
   - Tap "Sign In (Magic Link)"
   - Check email for magic link
   - Tap link to authenticate

5. **Test Smoke Test**:
   - After signing in, tap "Create Test To-Do"
   - Should see success message with todo ID
   - Verifies: create operation, getById operation, Supabase connection

### Environment Info Display

The screen shows:
- **Repo Backend**: `memory` or `supabase`
- **Supabase URL**: ✅ Set or ❌ Not set
- **Supabase Key**: ✅ Set or ❌ Not set

This helps verify environment variables are loading correctly.

---

## Navigation Architecture

**Stack Hierarchy**:
```
RootNavigator (Stack)
├── Tabs (TabNavigator)
└── DevLogin (Modal) [DEV-ONLY]
    └── Accessible via floating DEV button
```

**Type Safety**:
```tsx
export type RootStackParamList = {
  Tabs: undefined;
  DSPreview: undefined;
  DevLogin: undefined; // Added for dev screen
};
```

**Production Safety**:
- `__DEV__` guard in RootNavigator prevents screen registration in production
- `__DEV__` guard in OverlayHost prevents button rendering in production
- Zero production bundle size impact

---

## Code Quality

✅ **TypeScript**: Fully typed with proper React Navigation types  
✅ **Error Handling**: Try-catch blocks with user-friendly error messages  
✅ **Loading States**: `isCreating` flag prevents duplicate requests  
✅ **Input Validation**: Checks for empty email/password before submission  
✅ **Defensive Coding**: Checks `userId` before repo operations  
✅ **NativeWind**: Consistent styling with Tailwind classes  
✅ **Production Safe**: All dev code guarded with `__DEV__`  
✅ **Comments**: Clear JSDoc comments explaining purpose  

---

## Testing Checklist

- [ ] Floating DEV button appears in bottom-right corner
- [ ] Tapping DEV button opens DevLogin modal
- [ ] Email input accepts text
- [ ] Password input accepts text (masked)
- [ ] "Sign In (Password)" requires both email and password
- [ ] "Sign In (Magic Link)" requires only email
- [ ] Auth state shows "Not signed in" initially
- [ ] After sign-in, shows user email and userId
- [ ] "Create Test To-Do" button disabled when not signed in
- [ ] "Create Test To-Do" creates todo and shows success message
- [ ] Environment info displays correct backend and URL/key status
- [ ] Console logs show Supabase client initialization (dev only)
- [ ] Sign Out button clears auth state
- [ ] Modal can be dismissed with swipe or back button

---

## Assumptions

1. **Navigation**: Using React Navigation with Stack Navigator (confirmed)
2. **Styling**: NativeWind/Tailwind CSS is configured and working
3. **Providers**: AuthProvider and RepoProvider are properly set up in App.tsx
4. **Environment Variables**: Expo reads from `.env.local` or `.env`
5. **Dev Mode**: `__DEV__` constant is available (standard in React Native)

---

## Next Steps

### Immediate Testing
1. Start the dev server: `npm start`
2. Tap the floating DEV button
3. Test authentication flows
4. Run smoke test to verify repo operations

### Optional: Full Supabase Test
1. Create Supabase project
2. Run database schema (see docs)
3. Configure `.env.local` with credentials
4. Set `EXPO_PUBLIC_REPO_BACKEND=supabase`
5. Restart app and test full flow

### Future Enhancements
- Add "List My Todos" button to verify list operations
- Add "Search" test to verify search functionality
- Add "Update/Delete" tests for full CRUD coverage
- Add network request logging/debugging panel

---

## Summary

✅ **Minimal & Non-Invasive**: Floating button, only in dev mode  
✅ **Complete Smoke Test**: Auth + repo operations in one screen  
✅ **Production Safe**: Zero impact on production builds  
✅ **Well Documented**: Clear comments and type safety  
✅ **Easy to Use**: One tap to access, simple UI  

The dev login screen is ready for Phase 4 verification! 🚀
