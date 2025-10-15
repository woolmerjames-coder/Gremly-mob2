# Phase 4 Implementation Notes

## Installation Commands

Run these commands to install required dependencies:

```bash
# Phase 4 dependencies
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill

# Data validation and date utilities
npm install zod date-fns
```

## Implementation Status

- [x] Supabase client singleton
- [x] Repository types and interfaces
- [x] Memory repository implementation
- [x] Supabase repository implementation
- [x] Repository provider with backend switching
- [x] Auth provider
- [x] Environment configuration
- [x] Tests for Supabase repo (mocked)
- [x] Tests for Memory repo
- [x] App.tsx integration
- [x] URL polyfill for React Native
- [x] Deep linking for magic link authentication
- [x] Insert vs Row schemas (DB handles timestamps/owner_id)

## Database Schema Patterns

### Insert vs Row Schemas

The implementation uses two types of Zod schemas:

**Row Schemas** (`habitZ`, `todoZ`, `noteZ`):
- Validate complete records returned from the database
- Include all fields: `id`, `owner_id`, `created_at`, `updated_at`, etc.
- Used when parsing data from Supabase queries

**Insert Schemas** (`habitInsertSchema`, `todoInsertSchema`, `noteInsertSchema`):
- Validate data before inserting into database
- Exclude auto-generated fields: `id`, `owner_id`, `created_at`, `updated_at`
- Database handles these fields via:
  - `id`: UUID default (`uuid_generate_v4()`)
  - `owner_id`: Row Level Security (RLS) sets from `auth.uid()`
  - `created_at`, `updated_at`: Default `NOW()` or triggers

### Why This Matters

❌ **Wrong** - Sending timestamps causes errors:
```typescript
repo.create({
  type: 'todo',
  title: 'Test',
  created_at: '2025-10-15T12:00:00Z',  // ❌ Error: invalid datetime
  owner_id: userId,                     // ❌ RLS should handle this
});
```

✅ **Correct** - Let database handle auto-fields:
```typescript
repo.create({
  type: 'todo',
  title: 'Test',
  body: 'Description',
  undefined_due: true,
  ai_placed: false,
  // Database auto-generates: id, owner_id, created_at, updated_at
});
```

### Memory vs Supabase Repos

Both repos now follow the same pattern:

- **Memory Repo**: Generates id/timestamps in code, uses constructor `userId` for owner_id
- **Supabase Repo**: Relies on database defaults and RLS for all auto-fields
- **Create Input**: `owner_id` is optional - repos handle it internally

## Supabase Dashboard Configuration

To use magic link authentication with deep linking, configure your Supabase project:

### Authentication Settings

1. Go to **Authentication > URL Configuration** in your Supabase dashboard

2. **Site URL**: Set to a non-localhost value (e.g., your production domain or a placeholder)
   ```
   https://your-app-domain.com
   ```
   Note: This can be a placeholder during development, but must be a valid URL format.

3. **Redirect URLs**: Add the custom scheme for deep linking
   ```
   gremly://auth-callback
   ```
   This allows the magic link to redirect back to your app after authentication.

### Authentication Methods

- **Password Sign-In**: Works without redirect configuration
  - User provides email + password
  - Immediate authentication, no email required
  
- **Magic Link Sign-In**: Requires deep linking setup
  - User provides email only
  - Receives email with magic link
  - Tapping link opens app via `gremly://auth-callback` scheme
  - App detects deep link and refreshes session

### Deep Linking Setup

The app is configured with:
- **Scheme**: `gremly` (defined in `app.json`)
- **Redirect URL**: `gremly://auth-callback`
- **Linking listener**: Automatically refreshes session when magic link is opened

### Testing Magic Links

1. Set `EXPO_PUBLIC_REPO_BACKEND=supabase` in `.env.local`
2. Configure Supabase dashboard as described above
3. Use Dev Login screen to send magic link
4. Check email and tap the link
5. App should open and authenticate automatically

