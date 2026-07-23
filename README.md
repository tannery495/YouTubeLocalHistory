# ![YT re:Watch](./src/icon48.png) YT re:Watch

[![Tests](https://github.com/EdinUser/YouTubeLocalHistory/actions/workflows/ci.yml/badge.svg)](https://github.com/EdinUser/YouTubeLocalHistory/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/EdinUser/YouTubeLocalHistory)](https://github.com/EdinUser/YouTubeLocalHistory/releases)
[![Telegram Channel](https://img.shields.io/badge/Community-Telegram-2AABEE?logo=telegram&logoColor=white)](https://t.me/+eFftKWGVvSpiZjZk)

**Private local YouTube history, progress tracking, local subscriptions, and a full YouTube-style feed inside your browser.**

YT re:Watch keeps your watch progress on your device so you can switch YouTube accounts, use YouTube logged out, import your data, and browse a local feed without relying on Google account history.

📚 **[New user? Start with the guide](./docs/index.md)**

<div align="center">
  <strong>Local history • Local subscriptions • In-extension feed • No Google login required</strong>
  <br>
  <em><a href="./docs/faq.md">FAQ</a> | <a href="./docs/detailed_guide.md">Complete Guide</a> | <a href="./docs/technical.md">Developer Docs</a></em>
</div>

---

<div align="center">
  <img src="./src/icon128.png" alt="YT re:Watch YouTube History Extension" width="96" height="96">
  
  [![Chrome Web Store](https://img.shields.io/badge/Get_it_on-Chrome_Web_Store-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/local-youtube-video-histo/pebiokefjgdbfnkolmblaaladkmpilba)
  [![Firefox Add-ons](https://img.shields.io/badge/Get_it_on-Firefox_Add--ons-FF7139?logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/firefox/addon/yt-rewatch/)
  
  *YouTube progress tracking without account limitations. Your viewing history stays local.*
</div>

<div align="center">
  <img src="./docs/images/hero.jpg" alt="YT re:Watch Extension Interface" width="800" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  <br>
  <em>Full feed interface for local recommendations, subscriptions, search, history, playlists, analytics, and settings</em>
</div>

---

## What It Does

YT re:Watch gives YouTube a local history layer that works independently from your Google account.

- **Track progress locally** across YouTube accounts, private sessions, or logged-out browsing
- **Show watched labels** and progress bars inside the extension feed
- **Resume videos** from your saved local timestamp
- **Subscribe to channels locally** and browse their videos inside the extension feed
- **Manage local channels, subscriptions, playlists, history, and settings** from one full-page extension interface
- **Search YouTube from the extension**, with grouped channel results and in-extension channel pages
- **Import YouTube history and channels** from Google Takeout / CSV files
- **Back up and restore all local data** as a JSON file
- **Analyze your watching patterns** without sending your history to an app server

### Privacy Transparency

YT re:Watch stores your history, subscriptions, playlists, settings, and analytics locally in your browser.

It does not provide network anonymity. YouTube can still see normal YouTube page requests, cookies, IP address, and browser fingerprinting signals. For stronger privacy, combine this extension with browser privacy settings, content blockers, VPN/Tor-style tools, and logged-out browsing.

## 🚀 Get Started in 30 Seconds

### Step 1: Install the Extension
**Chrome Users:** [Get it from Chrome Web Store →](https://chromewebstore.google.com/detail/local-youtube-video-histo/pebiokefjgdbfnkolmblaaladkmpilba)

**Firefox Users:** [Get it from Firefox Add-ons →](https://addons.mozilla.org/firefox/addon/yt-rewatch/)

### Step 2: That's It!
- Go to YouTube and start watching videos
- The extension works automatically in the background
- Click the extension icon to continue watching, open Watch Later, or launch the full feed page
- Use the feed page to search YouTube, subscribe locally, browse channels, manage playlists, view history, and back up your data

## Perfect For

### 🔄 **Multi-Account Users** (#1 Use Case!)
- "I have work and personal YouTube accounts - hate losing progress when switching"
- "My family shares this computer and we need separate YouTube histories"
- "I manage multiple YouTube channels and need consistent tracking"
- "I want to use YouTube without staying logged in"

### 🔒 **Privacy-Focused Users**
- "I want YouTube history without Google tracking my viewing habits"
- "I need to research topics without affecting my recommendations"
- "I want to browse YouTube anonymously but still track what I watch"
- "I need a private alternative to YouTube's built-in history"

### 👨‍🎓 **Students & Content Creators**
- "I watch educational content across different devices and accounts"
- "I need to track my viewing progress without Google profiling"
- "I want consistent YouTube history for research projects"
- "I need to analyze my viewing patterns privately"

### 📺 **Local Feed Users**
- "I want a subscriptions feed without using a Google account subscription list"
- "I want to import channels and browse them locally"
- "I want a YouTube-like feed that I can back up and move between browsers"

---

## 📱 What You'll See

### 🏷️ **Viewed Indicators**
The extension adds smart visual indicators inside YT re:Watch:
- **"Viewed" labels** - Customizable text showing watched videos
- **Progress bars** - Visual completion percentage on video cards
- **Custom colors** - Choose from blue, red, green, purple, or orange
- **Adjustable size** - Small, medium, large, or extra-large labels
- **Works across feed views** - Home, subscriptions, playlists, search, and history

Additionally, the history list now shows the video’s channel name beneath the title for quicker scanning.

### 🎛️ **Extension Interface**
The popup now focuses on quick actions:
- **Continue watching** - Quickly resume recently watched videos
- **Watch Later** - Open videos you saved for later
- **Open Feed** - Launch the full local YouTube-style interface

The full feed page contains the larger sections:
- **Home** - Local recommendations from your subscribed channels
- **Shorts** - Dedicated Shorts view
- **Subscriptions** - Latest videos from locally subscribed channels in date order
- **Channels** - All locally subscribed channels, with open/unsubscribe actions
- **Playlists** - Local playlists you create and manage
- **History** - Watched videos, progress, and date watched
- **Analytics** - Watch-time and completion statistics
- **Settings** - Theme, history/feed, import/export, and cleanup controls

The feed page also includes extension search with YouTube results, grouped channel matches, and in-extension channel pages where you can subscribe locally and browse a channel's videos without using YouTube's account subscriptions.

---

## 🗂️ Key Features

### 🔄 **Multi-Account & Privacy**
- **Account Independence**: Same YouTube history across all accounts (or no account)
- **Local Storage**: All data stored securely on your device only
- **Local Progress Tracking**: Use your own browser history instead of relying on YouTube account history
- **Backup/Restore**: Backup and restore your full local YT re:Watch data anytime
- **Robust Deletion System**: Deleted videos stay deleted across all devices with tombstone-based protection

### 🎯 **Progress Tracking**
- **Viewed indicators**: Customizable "viewed" labels and progress bars on YouTube thumbnails and inside YT re:Watch
- **Auto-save**: Tracks video position every 5 seconds
- **YouTube Shorts**: Separate tracking for short-form content
- **Playlist Discovery**: Track and organize YouTube playlists

### 🏠 **Local YouTube-Style Feed**
- **Local subscriptions**: Subscribe to channels locally without needing a Google account
- **Home page**: Randomized local recommendations from subscribed channels, balanced with freshness and channel diversity
- **Subscriptions page**: Latest videos from subscribed channels in date order
- **Channels page**: View, open, and unsubscribe from local channels
- **Extension search**: Search YouTube from the feed page, with channel matches grouped above video results
- **In-extension channel pages**: Open a channel inside YT re:Watch to subscribe locally and browse that channel's videos
- **Local playlists**: Create playlists, add videos from the feed, view saved videos, and remove items
- **Local history page**: Review watched videos, watch progress, and watched date
- **Cleaner full-page UI**: Larger YouTube-like interface for browsing feed, history, analytics, playlists, and settings

### 📊 **Analytics & Insights**
- **Interactive Charts**: Viewing patterns by hour and day
- **Longest Unfinished Videos**: Quickly resume long videos you haven't finished (shows channel, time left, and link)
- **Top Watched Channels**: See your top 5 channels by videos watched (with links)
- **Top Skipped Channels**: See your top 5 channels where you most often skip long videos (with links)
- **Completion Bar Chart**: Visualize your completion rate for long videos (skipped, partial, completed) with a bar chart and legend
- **Weekly Activity**: Visualize your YouTube usage patterns

Analytics now prefer locally persisted, privacy-preserving statistics for better accuracy and performance.

### 🔄 **Data Portability & Local Storage**
- **Unlimited local storage**: GB-scale capacity with IndexedDB + localStorage hybrid system
- **Full backup/restore**: Export and restore history, subscriptions, playlists, watch later, settings, stats, preferences, and local caches via JSON files
- **Manual export/import**: Transfer data between devices via JSON files
- **Bulletproof reliability**: Core functionality works even if IndexedDB unavailable
- **Privacy protection**: All data stays local, no cloud storage required
- **Performance optimized**: Fast queries with indexed search and memory-efficient pagination

### 🎨 **User Experience**
- **Modern Interface**: Clean, card-based layout
- **Dark/Light Theme**: Automatic system theme detection
- **Smart Search**: Search local data and YouTube results from the feed page
- **Responsive Design**: Works perfectly on all screen sizes
- **Simpler popup**: The toolbar popup stays focused on quick resume/watch-later actions while full browsing happens on the feed page

---

## 🤝 Community & Support

- 🌐 **[Visit our website](https://rewatch.kirilov.dev/)** - Complete documentation and guides
- 💬 **[Join our community forum](https://community.kirilov.dev/t/re-watch)** - Get help, share tips, and connect with other users
- 💬 **[Telegram community](https://t.me/+eFftKWGVvSpiZjZk)** - Real-time chat and support
- 📖 **[Read our documentation](./docs/index.md)** - Complete guides for all skill levels
- 🐛 **[Report bugs on GitHub](https://github.com/EdinUser/YouTubeLocalHistory/issues)** - Help improve the extension
- ⭐ **[Rate us on browser stores](https://chromewebstore.google.com/detail/local-youtube-video-histo/pebiokefjgdbfnkolmblaaladkmpilba)** - Support the project

---

## 📥 Installation

### 🔥 **Recommended: Install from Browser Stores**

**Chrome Users:**
[![Get YT re:Watch on Chrome Web Store](https://img.shields.io/badge/Get_YT_re:Watch_on-Chrome_Web_Store-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/local-youtube-video-histo/pebiokefjgdbfnkolmblaaladkmpilba)

**Firefox Users:**
[![Get it on Firefox Add-ons](https://img.shields.io/badge/Get_it_on-Firefox_Add--ons-FF7139?logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/firefox/addon/yt-rewatch/)

### 🔧 **For Developers: Manual Installation**

<details>
<summary>Click to expand developer installation instructions</summary>

**Chrome:**
1. Run `./build.sh` to build the extension
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/chrome` folder

**Firefox:**
1. Run `./build.sh` to build the extension
2. Open Firefox → `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" and select the `manifest.json` file from the `dist/firefox` folder

</details>

## Storage System

This extension uses a **hybrid storage architecture** combining IndexedDB and localStorage for optimal performance and unlimited capacity:

- **IndexedDB**: Unlimited storage for complete video/playlists history with full metadata
- **localStorage**: Fast overlay for recent/active content and lightweight configuration
- **Merged reads**: Seamless access to complete history with local changes taking priority
- **Extension-scoped**: IndexedDB is never created under YouTube origin for privacy protection

### Persistent Statistics
For faster and more consistent Analytics, the extension maintains a small, local statistics snapshot:
- `totalWatchSeconds`: cumulative seconds watched
- `daily`: last 7 days of totals keyed by local date `YYYY-MM-DD`
- `hourly`: array of 24 totals for each hour of day

These stats are calculated and stored locally only. On first upgrade, they are seeded from your existing history when possible.

### Hybrid Storage Migration

The extension automatically migrates from legacy storage to the new hybrid system on first run. The migration process:

1. **Verified migration**: Each batch is written to IndexedDB and verified before cleanup
2. **Fail-safe**: Local data is never deleted until IndexedDB archival is confirmed
3. **Resumable**: Migration continues from last successful batch if interrupted
4. **Stats rebuild**: Analytics statistics are recalculated from migrated data
5. **Graceful fallback**: Extension continues working during migration process

### Data Stored

The extension can store:

- **Video History**: Video IDs, timestamps, progress, titles, and URLs
- **Playlist History**: Playlist IDs, titles, and URLs
- **Local Subscriptions**: Channels you subscribe to inside YT re:Watch
- **Local Playlists and Watch Later**: Playlists and saved videos managed by the extension
- **Settings**: User preferences for feed appearance, refresh, cleanup, and default page
- **Statistics**: Aggregated watch-time summaries used for analytics (local only)
- **Caches**: Duration, Shorts detection, and release-date caches used to make the feed faster and more accurate

## Usage

1. **Install the extension** following the instructions above
2. **Visit YouTube** and start watching videos
3. **Your progress is automatically saved** every 5 seconds with smart timestamp loading to prevent video interruption
4. **Click the extension icon** to quickly continue watching, open Watch Later, or open the full feed page
5. **Use the feed page** for Home, Shorts, Subscriptions, Channels, Playlists, History, Analytics, Settings, search, and in-extension channel pages
6. **Export/import data** anytime for backup and transfer between devices

### Settings

#### 🎨 Appearance
- **Theme**: Choose between System (follows your OS theme), Light, or Dark theme with instant switching
- **Accent Color**: Choose the feed page accent color
- **Default Feed Page**: Choose whether the full feed opens to the last used page, Home, Shorts, Subscriptions, Channels, Playlists, History, or Analytics

#### 🗂️ History & Feed
- **Auto-clean Period**: Automatically remove history entries older than specified days (1–180 days), or choose **Forever** to disable auto-cleanup
- **Feed Refresh Interval**: Choose how often the extension checks locally subscribed channels for new videos
- **Clear History**: Remove local watch history when needed

#### 🔄 Data Management
- **Backup all data**: Download a local JSON backup containing history, subscriptions, playlists, settings, analytics data, recommendation preferences, and caches
- **Restore backup**: Merge a previous YT re:Watch backup into the current browser profile
- **Import YouTube history**: Import Google Takeout watch history
- **Import channels**: Import YouTube subscriptions/channels from CSV or Takeout-style exports
- **Data Portability**: Transfer history between devices manually

### Theme System

The extension supports a comprehensive theme system:

- **System Theme**: Automatically follows your operating system's dark/light mode preference
- **Manual Themes**: Choose Light or Dark theme regardless of system setting
- **Dynamic Switching**: Theme changes are applied immediately without page refresh
- **Browser Integration**: Detects and responds to browser theme changes
- **Persistent Settings**: Your theme preference is saved and restored across sessions

### Progress Display

The history view now shows enhanced progress information:

- **Watched Time**: Shows the actual time you've watched (e.g., "5:30")
- **Percentage**: Shows the percentage of the video you've completed (e.g., "45%")
- **Combined Display**: Shows both time and percentage (e.g., "5:30 (45%)")
- **Accurate Tracking**: Only shows percentage when video duration is available
- **Progress Indicators**: Modern progress bars and visual indicators for each video and playlist

## Analytics Dashboard

The Analytics tab provides comprehensive insights into your YouTube viewing habits:

#### 📈 Viewing Patterns
- **Watch Time Distribution by Hour**: Interactive charts showing when you watch the most content
- **Weekly Activity Tracking**: Visualize your daily YouTube activity over the past 7 days
- **Content Type Comparison**: Pie charts comparing time spent on regular videos vs Shorts

#### 📊 Performance Metrics  
- **Completion Rate Statistics**: Track how often you finish videos you start watching
- **Total Watch Time**: Cumulative time spent watching videos and shorts
- **Video Count Statistics**: Track total videos watched and completion rates

#### 🎨 Visual Features
- **Interactive Charts**: All analytics presented with interactive, theme-aware visualizations
- **Real-time Updates**: Charts update automatically as you watch more content  
- **Dark Theme Support**: Analytics adapt to your chosen theme preference

## Privacy

- **No app backend**: YT re:Watch does not upload your history to an extension-owned server
- **Local Storage First**: Your history, local subscriptions, playlists, settings, backups, and analytics live in browser storage
- **YouTube requests only when needed**: The extension contacts YouTube to read pages, RSS feeds, metadata, and search results needed for YouTube-related features
- **Manual portability**: Backups are local JSON files that you control

## Security

The extension stores data in extension-scoped browser storage (`chrome.storage.local` / `browser.storage.local`) and IndexedDB:

- **Extension isolation**: Web pages cannot read the extension's storage directly
- **Browser-managed storage**: Data is protected by the browser profile and operating system user account
- **Local backups**: Exported backup files are plain JSON, so store them somewhere you trust

## Troubleshooting

### Extension Not Working
1. **Refresh and Retry**: Refresh the YouTube page or the full feed page
2. **Check Permissions**: Make sure the extension has access to YouTube
3. **Extension Status**: Verify the extension is enabled in your browser
4. **Reload Extension**: Disable/enable the extension or reload it from the browser extension page

### History Not Loading  
1. **Feed Refresh**: Open the feed page and click Refresh
2. **Page Refresh**: Refresh the YouTube page completely  
3. **Console Logs**: Check browser console for error messages (F12 → Console)
4. **Storage Check**: Verify extension has storage permissions
5. **Backup First**: Export a backup before clearing any extension data

### Storage & Migration Issues
1. **Storage Space**: Ensure sufficient disk space for IndexedDB storage
2. **Browser Storage**: Verify extension has storage permissions enabled
3. **Fallback Mode**: Extension continues working if IndexedDB is unavailable
4. **Export Backup**: Always export data before major troubleshooting

### Migration Issues
If you experience issues with data migration from older versions:
1. **Automatic Retry**: The extension will automatically retry migration on next startup
2. **Export First**: Export your data before troubleshooting to preserve it
3. **Clear and Restart**: If problems persist, clear extension data and start fresh
4. **Import Backup**: Use the import feature to restore previously exported data

## Development

### Project Structure
```
├── src/
│   ├── background.js                 # Extension background/service worker logic
│   ├── content*.js                   # YouTube page tracking, overlays, playlists, messages
│   ├── popup*.js / popup.html        # Toolbar popup and quick actions
│   ├── feed*.js / feed.html          # Full feed app, search, channel pages, settings, backup
│   ├── storage.js                    # Hybrid storage API
│   ├── indexeddb-storage.js          # IndexedDB backend
│   └── manifest*.json                # Browser-specific manifests
├── docs/                             # User and maintainer docs
├── dist/                             # Built release packages
├── build.sh                          # Chrome/Firefox build script
└── merge_locales.js                  # Locale build helper
```

### Building
1. Make changes to the source files in the `src/` directory
2. Run `./build.sh` to build both Chrome and Firefox extensions
3. Test the built extensions in your browser
4. The built extensions will be available in the `dist/` directory

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes and version history.

---

## 🎯 **Summary: Why Choose YT re:Watch?**

**YT re:Watch** is the ultimate **YouTube history extension** for users who:
- Switch between **multiple YouTube accounts** (work/personal)
- Want **YouTube history without login** requirements
- Need **YouTube progress tracking** with local viewed indicators
- Prefer **YouTube privacy** over Google's tracking
- Want **consistent viewing history** regardless of account status

**Key Search Terms:** YouTube multiple accounts, YouTube account switching, YouTube history extension, YouTube progress tracking, YouTube without login, YouTube privacy extension, YouTube progress bar, YouTube viewed videos, YouTube multi-account, YouTube local storage

**Perfect for:** Multi-account users, privacy-conscious users, students, researchers, content creators, families sharing computers, and anyone who wants reliable YouTube progress tracking without Google surveillance.

⭐ **[Install now from Chrome Web Store](https://chromewebstore.google.com/detail/local-youtube-video-histo/pebiokefjgdbfnkolmblaaladkmpilba)** or **[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/yt-rewatch/)**

## Multilanguage Support

This extension supports multiple languages:
- English (en)
- German (de)
- Spanish (es)
- French (fr)
- Bulgarian (bg)

**Note:** All non-English translations are currently machine-generated. If you are a native speaker and notice any issues, please consider contributing improvements! See `src/_locales/README.md` for translation guidelines.

## ❤️ Support the Project

If you find YT re:Watch useful, consider supporting development on [Patreon](https://patreon.com/EdinUser)!

[![Support on Patreon](https://img.shields.io/badge/Support%20on-Patreon-orange?logo=patreon&logoColor=white)](https://patreon.com/EdinUser)
