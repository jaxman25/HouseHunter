# 🏠 House Hunter

A full-featured real estate app built with **React Native (Expo)**, **Firebase**, and **Google Maps** — browse listings, search with filters, chat with sellers in real time, save favorites, and publish your own properties.

> Works on **iOS, Android, and Web** from a single codebase (Expo + React Native Web).

---

## ✨ Features

### 🏡 Property Listings
- Create, edit, and delete property listings (Seller / Agent roles)
- Upload up to **10 images** per property
- **6 property types**: House, Apartment, Condo, Townhouse, Land, Commercial
- **Buy** or **Rent** listing types
- **20 amenities/features** (parking, pool, gym, pet-friendly, AC, etc.)
- View counts and inquiry tracking per listing

### 🔍 Explore & Search
- Browse listings in **list or grid** view with pull-to-refresh
- Filter by price range, bedrooms, bathrooms, property type, city, features, and listing type
- Sort by **newest, oldest, price (asc/desc), or popularity**
- Full-text search across title, address, city, state, and description
- Server-side pagination ("load more")

### 🗺️ Map View
- Google Maps with property price markers
- Tap a marker to preview the property card
- Auto fit-to-bounds for all visible listings
- Jump straight to the property detail page

### ❤️ Favorites
- One-tap heart on any property card
- Dedicated **Saved** tab, persisted to the user's Firestore profile

### 💬 Real-Time Chat
- Conversations between buyers, sellers, and agents — per property
- Live messaging with `onSnapshot` subscriptions
- Image sharing in chat
- Unread message counts + read receipts

### 🔔 Notifications
- Push notifications via Expo Notifications
- In-app notification center (messages, inquiries, price drops, new listings)

### 👤 Accounts & Profiles
- Email/password authentication (Google sign-in supported on native)
- Roles: **Buyer**, **Seller**, **Agent** (agents get a badge)
- Edit profile: name, phone, bio, photo
- Change password with re-authentication
- Stats card: listings, favorites, member since

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native via [Expo](https://expo.dev) (SDK 57) |
| Language | TypeScript |
| Backend | Firebase — Auth, Cloud Firestore, Storage |
| Maps | react-native-maps (native) + web-compatible map component |
| Chat | Firestore real-time listeners |
| Navigation | React Navigation (stack, bottom tabs, drawer) |
| Icons | MaterialCommunityIcons |
| Web support | React Native Web |

---

## 🚀 Quick Start

```bash
# 1. Install dependencies (use --legacy-peer-deps, required by this project)
npm install --legacy-peer-deps

# 2. Configure Firebase (see "Firebase Setup" below), then create .env:
cp .env.example .env

# 3. Deploy the Firestore indexes (⚠️ required — see below)
npx firebase login
npx firebase deploy --only firestore:indexes

# 4. Start the dev server
npx expo start
```

Press `w` for web, `a` for Android, `i` for iOS, or scan the QR code with **Expo Go**.

---

## 🔥 Firebase Setup

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. Note your **Project ID** (e.g. `househunter-f3ff3`)

### 2. Enable the services the app needs

| Service | What to do |
|---|---|
| **Authentication** | Enable the **Email/Password** provider (Google optional) |
| **Firestore Database** | Create a database — *test mode* is fine for development |
| **Storage** | Get started — *test mode* is fine for development |

### 3. Register a web app & grab the config

1. **Project settings** ⚙️ → **Your apps** → **Web** (`</>`)
2. Copy the `firebaseConfig` values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId)

### 4. Create your `.env` file

The app reads all Firebase and Maps config from environment variables (loaded by Expo — keys starting with `EXPO_PUBLIC_` are inlined into the app).

```bash
cp .env.example .env
```

Fill in every `EXPO_PUBLIC_*` value. The required ones:

| Variable | Where to get it |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase → Project settings → Your apps |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase → Project settings |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase → Project settings |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase → Project settings |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase → Project settings |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase → Project settings |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase → Project settings |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` / `..._ANDROID_API_KEY` | Google Cloud Console (native builds only) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `..._IOS_CLIENT_ID` / `..._ANDROID_CLIENT_ID` | Firebase → Authentication → Google (native sign-in) |

### 5. Deploy Firestore indexes (⚠️ don't skip)

The app queries Firestore with combined `where` + `orderBy` clauses (sorted listings, filters, "my listings", chat list), which **require composite indexes**.

- All required indexes are already defined in **`firestore.indexes.json`** (and wired up via `firebase.json`).
- Deploy them to your Firebase project **once**:

```bash
npx firebase login
npx firebase deploy --only firestore:indexes
```

**Without this step you'll see errors like `FirebaseError: The query requires an index` in the console, and property lists / chat will fail to load.** Each such error also prints a one-click link to create the individual index in the Firebase console.

### 6. Deploy Firestore security rules

For development, the repo ships permissive rules (`firestore.rules`). Deploy them:

```bash
npx firebase deploy --only firestore:rules
```

> ⚠️ **Production:** tighten these rules so users can only read/write their own data.

### 7. Storage CORS (only needed for web uploads)

If you upload property/chat images from the **web** build, your Storage bucket needs CORS rules. A ready-made config is in `cors.json` — deploy it with the `gsutil` CLI:

```bash
gsutil cors set cors.json gs://YOUR-PROJECT.firebasestorage.app
```

---

## 🗺️ Google Maps Setup (native builds)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create/select a billing-enabled project
2. **APIs & Services** → **Credentials** → **Create Credentials** → **API Key**
3. Restrict the key: enable **Maps SDK for Android** / **Maps SDK for iOS**, and restrict by package name / SHA-1 / bundle ID
4. Set the keys as `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` in `.env` — they're injected automatically via `app.config.js`

> Web builds use a web-compatible map component, so Maps keys are only needed for iOS/Android builds.

---

## ▶️ Running the App

| Command | Description |
|---|---|
| `npx expo start` | Start the dev server (QR code for Expo Go) |
| `npx expo start --web` | Open in the browser (`w`) |
| `npx expo start --android` | Launch Android emulator |
| `npx expo start --ios` | Launch iOS simulator (macOS) |
| `npx expo start --clear` | Start with a cleared Metro cache |
| `npx tsc --noEmit` | Type-check the project |
| `npm run lint` | Run ESLint |

> **Installing dependencies:** always use `npm install --legacy-peer-deps` — the project's React Native / React peer versions require it.

---

## 📁 Project Structure

```
HouseHunter/
├── App.tsx                      # Root component (providers + navigation)
├── app.json / app.config.js     # Expo config (+ env-injected Maps keys)
├── firebase.json                # Firebase CLI config (rules + indexes)
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json       # Required composite indexes
├── cors.json                    # Storage CORS rules for web uploads
└── src/
    ├── config/
    │   ├── firebase.ts          # Firebase init (reads .env)
    │   └── theme.ts             # Colors, spacing, shadows, constants
    ├── context/                 # AuthContext, ThemeContext
    ├── types/                   # TypeScript interfaces
    ├── utils/                   # Constants, helpers, validators, formatters
    │   ├── network/             # retry, timeout, circuit breaker, health check
    │   ├── cache/               # AsyncStorage TTL cache + invalidation
    │   ├── errors/              # ErrorBoundary + themed fallbacks
    │   └── performance/         # debounce + throttle (+ hooks)
    ├── services/                # Auth, property, chat, storage, notifications
    ├── navigation/              # Root, Auth, and Main tab navigators
    ├── components/              # common / property / chat components
    └── screens/                 # auth / main / property / search / chat / settings
```

---

## ❓ Troubleshooting

**`FirebaseError: The query requires an index`**
You haven't deployed the composite indexes yet. Run `npx firebase deploy --only firestore:indexes` (or click the index link in the error message and hit **Create index**). See [Firebase Setup → Step 5](#5-deploy-firestore-indexes--dont-skip).

**`npm install` fails with peer dependency errors**
```bash
npm install --legacy-peer-deps
```

**App crashes on startup with Firebase errors**
Verify every `EXPO_PUBLIC_*` value in `.env` is filled in (no placeholder text), and that Authentication, Firestore, and Storage are enabled in the Firebase project.

**Firestore permission denied errors**
Your deployed rules are too strict for development — deploy the permissive `firestore.rules`, or check the specific operation against your rules.

**Map screen is blank**
Web builds don't need Maps keys; native builds do. Verify `EXPO_PUBLIC_GOOGLE_MAPS_*_API_KEY` in `.env` and that Maps SDK is enabled in Google Cloud Console.

**"Unable to resolve module" errors**
```bash
npx expo start --clear
```

**Images won't upload from the web**
Storage CORS isn't configured — see [Firebase Setup → Step 7](#7-storage-cors-only-needed-for-web-uploads).

---

## 📜 Scripts

All commands run from the project root. See [Running the App](#-running-the-app) for the full list.