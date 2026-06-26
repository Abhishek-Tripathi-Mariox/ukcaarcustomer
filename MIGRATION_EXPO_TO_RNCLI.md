# Expo → React Native CLI migration notes

This project was migrated from Expo (SDK 50) to plain React Native CLI (RN 0.73.6).
Below is what changed, what you still need to do before the first `npx react-native run-android`, and what to watch out for.

## Finish the migration (required steps)

1. **Nuke old installs and reinstall**
   ```
   rm -rf node_modules package-lock.json
   rm -rf android/build android/app/build android/.gradle
   rm -rf .expo dist dist-export
   npm install
   ```

2. **Drop Inter font files into `assets/fonts/`**

   The Expo project pulled Inter from `@expo-google-fonts/inter`. On RN CLI you ship `.ttf`
   files with the app. Download from https://fonts.google.com/specimen/Inter and place these
   six files in `assets/fonts/` with these exact filenames (they match the `FontFamily` map
   in `src/theme/typography.ts`):

   - `Inter-Light.ttf`
   - `Inter-Regular.ttf`
   - `Inter-Medium.ttf`
   - `Inter-SemiBold.ttf`
   - `Inter-Bold.ttf`
   - `Inter-ExtraBold.ttf`

   Then link them:
   ```
   npx react-native-asset
   ```
   (installs to `android/app/src/main/assets/fonts/` and `ios/<project>/Info.plist`).

3. **Google Maps API key**

   `android/app/src/main/AndroidManifest.xml` has a placeholder `YOUR_GOOGLE_MAPS_API_KEY`.
   Replace it with a real key from Google Cloud Console (Maps SDK for Android enabled).

4. **(Optional) Firebase for push notifications**

   The app now uses `@react-native-firebase/messaging` instead of `expo-notifications`.
   If you want push to work, add `google-services.json` at `android/app/google-services.json`
   and apply the Google Services Gradle plugin in `android/app/build.gradle`:
   ```groovy
   apply plugin: "com.google.gms.google-services"
   ```
   and in `android/build.gradle` buildscript deps:
   ```groovy
   classpath("com.google.gms:google-services:4.4.1")
   ```
   If you don't need push yet, you can remove `@react-native-firebase/*` from `package.json`
   and skip this step.

5. **First build**
   ```
   npx react-native start --reset-cache
   npx react-native run-android
   ```

## What was replaced

| Expo package                  | RN CLI replacement                          |
| ----------------------------- | ------------------------------------------- |
| `expo`                        | removed                                     |
| `expo-status-bar`             | `StatusBar` from `react-native`             |
| `expo-dev-client`             | removed (use standard RN dev menu)          |
| `expo-font` + `@expo-google-fonts/inter` | .ttf files in `assets/fonts/` via `react-native-asset` |
| `expo-location`               | `react-native-permissions` for perms; use native geolocation if/when you need coordinates (`@react-native-community/geolocation`) |
| `expo-camera`                 | `react-native-permissions` for perm checks  |
| `expo-image-picker`           | `react-native-image-picker`                 |
| `expo-media-library`          | `react-native-permissions` + `@react-native-camera-roll/camera-roll` if you need saving |
| `expo-notifications`          | `@react-native-firebase/messaging` (+ local notifications via `notifee` if you need them) |
| `expo-linear-gradient`        | `react-native-linear-gradient` (not currently imported anywhere in `src/`, so only installed if you later need it — safe to remove from `package.json` if unused) |
| `@expo/vector-icons`          | `react-native-vector-icons` (default export per family) |

Auto-linking handles every native library above on Android — no manual `ReactPackage`
additions needed.

## Files changed

- `package.json` — removed all `expo-*`, added RN CLI deps
- `App.tsx` — removed `useFonts` hook and `expo-status-bar`
- `index.js` — new RN entrypoint
- `app.json` — now only `{name, displayName}`
- `babel.config.js` — uses `module:@react-native/babel-preset` instead of `babel-preset-expo`
- `metro.config.js` — uses `@react-native/metro-config`
- `tsconfig.json` — extends `@react-native/typescript-config`
- `react-native.config.js` — declares `assets/fonts/` for `react-native-asset`
- `android/build.gradle` — standard RN CLI root build file
- `android/settings.gradle` — removed `useExpoModules()`
- `android/app/build.gradle` — removed Expo autolinking + `cliFile`, added vector-icons fonts.gradle
- `android/app/src/main/java/com/ukcaar/customer/MainActivity.kt` — removed `ReactActivityDelegateWrapper`, `expo-splash-screen` setTheme
- `android/app/src/main/java/com/ukcaar/customer/MainApplication.kt` — removed `ReactNativeHostWrapper`, `ApplicationLifecycleDispatcher`, `ReactFeatureFlags` tweaks
- `android/app/src/main/AndroidManifest.xml` — removed `expo.modules.*` meta-data, `exp+ukcaar` scheme, added Google Maps API key placeholder
- `android/app/src/main/res/values/strings.xml` — removed `expo_splash_screen_*`
- `android/gradle.properties` — removed `expo.*` flags, `EX_DEV_CLIENT_*`

### JS/TS source rewrites

- `src/utils/permissions.ts` — rewritten against `react-native-permissions`
- `src/hooks/usePermissions.ts` — unchanged (uses the wrapper above)
- `src/screens/auth/EnableLocationScreen.tsx` — uses `react-native-permissions` directly
- `src/screens/profile/SettingsScreen.tsx` — notification toggle uses `react-native-permissions`
- `src/screens/auth/CompleteProfileScreen.tsx` — `expo-image-picker` → `react-native-image-picker`
- `src/screens/profile/EditProfileScreen.tsx` — same
- All 25 files that imported `@expo/vector-icons` — now use `react-native-vector-icons/<Family>`

## Things that were NOT handled (intentionally)

- **iOS native project**: the existing project was Android-only (`ios/` doesn't exist). If
  you later need iOS, run `npx @react-native-community/cli init TempProj --version 0.73.6`,
  copy `ios/` from the temp project to this one, set the bundle ID to `com.ukcaar.customer`,
  add Info.plist usage descriptions (camera, photo library, location), and run `pod install`.
- **Splash screen image**: Expo used `expo-splash-screen`. The project's `Theme.App.SplashScreen`
  drawable is a plain color (`#0F0F1A`) — good enough as a stub. For a branded splash, add
  `react-native-bootsplash` later.
- **Removed artifacts**: `dist/`, `dist-export/`, `dist-export.zip`, `eas.json`, `.expo/` are
  leftover from Expo builds. Safe to delete when convenient.
- **Expo build cache**: `android/build` and `android/app/build` will be regenerated on the
  next Gradle build — delete them before the first `run-android` to avoid stale Expo
  artifacts being linked.

## Known risks / sanity checks

- **Axios crypto shim** — the `postinstall` script in `package.json` rewrites axios's main
  entry, and `metro.config.js` also redirects at resolve time. Both are preserved.
- **react-native-razorpay** — already an RN-native module, no change needed. Test credentials
  live in your memory / `.env`.
- **react-native-reanimated** — keeps the same babel plugin; babel config preserved.
- **Component name** — `MainActivity.getMainComponentName()` returns `"UKCAAR"`, which must
  match both `app.json`'s `name` field and the string passed to `AppRegistry.registerComponent`
  in `index.js`. All three are aligned.
- If Metro fails to find `index.js`, check that `MainApplication.kt`'s `getJSMainModuleName()`
  returns `"index"` (it does in the new file).
