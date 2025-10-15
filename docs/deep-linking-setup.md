# Deep Linking Setup for Magic Link Authentication

## Changes Summary

Successfully configured deep linking to support Supabase magic link authentication with custom URL scheme.

---

## Files Modified (4 files)

### 1. `app.json` (MODIFIED)
**Changes**:
- Added `"scheme": "gremly"` to enable deep linking
- Added `"bundleIdentifier": "com.gremly.mob2"` to iOS config
- Added `"package": "com.gremly.mob2"` to Android config

**Result**:
```json
{
  "expo": {
    "scheme": "gremly",
    "ios": {
      "bundleIdentifier": "com.gremly.mob2"
    },
    "android": {
      "package": "com.gremly.mob2"
    }
  }
}
```

### 2. `providers/AuthProvider.tsx` (MODIFIED)
**Changes**:
- Updated magic link branch to include deep link redirect options
- Added `shouldCreateUser: true` to auto-create users
- Added `emailRedirectTo: 'gremly://auth-callback'` for deep linking

**Code**:
```tsx
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,
    emailRedirectTo: 'gremly://auth-callback',
  },
});
```

### 3. `App.tsx` (MODIFIED)
**Changes**:
- Added imports: `useEffect`, `Linking`, `supabase`
- Added deep linking listener with `Linking.addEventListener('url', ...)`
- Logs incoming URLs in development mode
- Automatically calls `supabase.auth.getSession()` after magic link callback
- Logs session establishment status in development

**Code**:
```tsx
useEffect(() => {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (__DEV__) {
      console.log('[Deep Link] Received URL:', url);
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (__DEV__) {
        if (error) console.error('[Deep Link] Session error:', error);
        else if (session) console.log('[Deep Link] Session established:', session.user.email);
        else console.log('[Deep Link] No session found');
      }
    });
  });

  return () => subscription.remove();
}, []);
```

### 4. `PHASE4_NOTES.md` (MODIFIED)
**Changes**:
- Added "Supabase Dashboard Configuration" section
- Documented Site URL requirement (non-localhost)
- Documented Redirect URLs setup (`gremly://auth-callback`)
- Explained password vs magic link authentication differences
- Added deep linking testing instructions

---

## How It Works

### Magic Link Flow

1. **User requests magic link**:
   - Enters email in Dev Login screen
   - Taps "Sign In (Magic Link)"
   - AuthProvider calls `signInWithOtp()` with redirect URL

2. **Supabase sends email**:
   - Email contains magic link with authentication token
   - Link URL: `gremly://auth-callback#access_token=...&refresh_token=...`

3. **User taps link**:
   - Mobile OS recognizes `gremly://` scheme
   - Opens app automatically

4. **App handles deep link**:
   - Linking listener detects URL
   - Logs URL in development mode
   - Calls `supabase.auth.getSession()` to establish session
   - AuthProvider's `onAuthStateChange` listener updates user state

5. **User is authenticated**:
   - Dev Login screen shows user email and ID
   - Repo operations now work with authenticated user

---

## Supabase Dashboard Setup

### Required Configuration

1. **Navigate to Authentication > URL Configuration**

2. **Site URL**: Set to a valid URL (not localhost)
   ```
   https://gremly.app
   ```
   or use a placeholder during development:
   ```
   https://placeholder.com
   ```

3. **Redirect URLs**: Add the custom scheme
   ```
   gremly://auth-callback
   ```

4. **Save changes**

### Why This Matters

- **Password authentication**: Works without any redirect configuration
- **Magic link authentication**: Requires redirect URL to bring user back to app
- **Deep linking**: Allows mobile OS to open your app from email links

---

## Testing Instructions

### 1. Configure Supabase
- Set Site URL in dashboard
- Add `gremly://auth-callback` to Redirect URLs

### 2. Configure Local Environment
Update `.env.local`:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_REPO_BACKEND=supabase
```

### 3. Test Magic Link Flow
1. Start the app: `npm start`
2. Tap the floating "DEV" button
3. Enter your email
4. Tap "Sign In (Magic Link)"
5. Check your email for the magic link
6. Tap the link in email
7. App should open and authenticate automatically
8. Dev Login screen should show your email and user ID

### 4. Check Console Logs (Dev Mode)
You should see:
```
[Deep Link] Received URL: gremly://auth-callback#access_token=...
[Deep Link] Session established: your@email.com
```

---

## Differences: Password vs Magic Link

### Password Authentication
✅ No redirect needed  
✅ No email required  
✅ Immediate authentication  
✅ Works offline (after first login)  
❌ User must remember password  

### Magic Link Authentication
✅ No password to remember  
✅ More secure (unique link per login)  
✅ Auto-creates users (`shouldCreateUser: true`)  
❌ Requires email access  
❌ Requires redirect URL configuration  
❌ Requires internet connection  

---

## Troubleshooting

### Magic Link Doesn't Open App
- **Check app.json**: Ensure `"scheme": "gremly"` is present
- **Check Supabase dashboard**: Ensure `gremly://auth-callback` is in Redirect URLs
- **Rebuild app**: Deep link schemes require native rebuild after changes
- **Check email**: Link might have expired (default: 1 hour)

### Session Not Established
- **Check console logs**: Look for `[Deep Link]` messages
- **Check Supabase dashboard**: Verify Site URL is not localhost
- **Check network**: Ensure device has internet connection
- **Check AuthProvider**: Verify `onAuthStateChange` is working

### Link Opens Browser Instead of App
- **iOS**: May need to long-press link and choose "Open in Gremly"
- **Android**: Ensure app is installed (Expo Go or development build)
- **Development**: Custom schemes work in development builds, not always in Expo Go

---

## Production Considerations

### Before Release
1. Set production Site URL in Supabase dashboard
2. Add production redirect URLs if using web app
3. Update bundle identifiers in `app.json` to match App Store/Play Store
4. Test magic link flow on physical devices
5. Consider adding universal links (iOS) or App Links (Android) for better UX

### Security
- Magic links expire after 1 hour by default
- Each link is single-use
- Tokens are passed via URL fragment (not logged by servers)
- Sessions stored securely in AsyncStorage

---

## Summary

✅ Deep linking configured with `gremly://` scheme  
✅ Magic link authentication redirects to app  
✅ Automatic session refresh on deep link  
✅ Development logging for debugging  
✅ Password authentication works without changes  
✅ Documentation updated with Supabase setup instructions  

**All changes are backward compatible** - password authentication continues to work as before, and magic links now properly redirect back to the app! 🎉
