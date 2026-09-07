# Privacy

YouTube Local Feed is designed to keep personal watch data local to the browser.

## Stored locally

- Watch history and progress
- Local subscriptions
- Local playlists and Watch Later
- Settings, feed state, and analytics derived from local watch data
- Imported Google Takeout data

Storage uses browser `storage.local` and IndexedDB. The extension does not use browser sync storage.

## Network requests

The extension makes requests directly to YouTube/YouTube-owned endpoints to load search results, channel pages, thumbnails, video metadata, RSS feeds, and related YouTube data. These requests can use the browser's existing YouTube session through `credentials: include`. Cookie values are handled by the browser and are not read or stored by the extension.

No application analytics, telemetry, advertising SDKs, remotely hosted JavaScript, or third-party tracking services are included.

## Permissions

- `storage`: stores Local Feed data locally.
- `unlimitedStorage`: supports larger local watch histories/playlists.
- `contextMenus`: provides the local Watch Later right-click action.
- YouTube host permissions: allow content scripts and direct requests to YouTube pages/API endpoints used by Local Feed.

The extension does **not** request the `cookies` permission and does **not** use the Cookies API. It also does not request `activeTab`, because its YouTube host permission already covers its YouTube-specific page access.

## Backups

Backup exports are ordinary JSON files and can contain local watch history, subscriptions, playlists, Watch Later, settings, and related local data. They are created on the user's device and are not uploaded by Local Feed. Once downloaded, the backup file is outside the extension's storage and should be handled like other personal files.

## Release logging

Release builds do not intentionally log search terms, video IDs/titles, history samples, playlist contents, or similar viewing activity to the browser console. Operational errors and privacy-safe diagnostic warnings may still be reported to help identify failures.
