# Contributing to Gremly

## Development Setup

1. **Prerequisites**
   - Node.js >= 20.19.4
   - npm or yarn
   - Expo CLI
   - iOS Simulator (Mac) or Android Emulator

2. **Installation**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Running the App**
   ```bash
   npm start      # Start Expo dev server
   npm run ios    # Run on iOS simulator
   npm run android # Run on Android emulator
   ```

## Code Quality

Before submitting a PR, ensure:

```bash
npm run lint      # Check code style
npm run typecheck # Check TypeScript types
npm run test      # Run tests
npm run ci        # Run all checks
```

## Commit Guidelines

We use Husky to run pre-commit checks. Your commits will automatically:
- Lint and format staged files
- Run type checks
- Ensure tests pass

## Pull Request Process

1. Create a feature branch from `dev`
2. Make your changes
3. Run `npm run ci` to ensure all checks pass
4. Push your branch and create a PR
5. Fill out the PR template completely
6. Wait for CI checks to pass
7. Request review from maintainers

## Coding Standards

- Use TypeScript for type safety
- Follow ESLint and Prettier configurations
- Write tests for new features
- Use NativeWind v2 for styling (Tailwind classes)
- Keep components small and focused

## Testing

- Unit tests in `__tests__/` directory
- Use React Native Testing Library
- Aim for meaningful test coverage

## Questions?

Open an issue or reach out to the maintainers.
