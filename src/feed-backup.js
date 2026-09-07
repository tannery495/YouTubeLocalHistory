async function exportFeedData() {
    const [
        videos,
        playlists,
        stats,
        subscriptions,
        watchLater,
        settings,
        localData
    ] = await Promise.all([
        ytStorage.getAllVideos(),
        ytStorage.getAllPlaylists(),
        ytStorage.getStats(),
        ytStorage.getSubscriptionList(),
        ytStorage.getAllWatchLater(),
        ytStorage.getSettings(),
        chrome.storage.local.get([
            'localVideoPlaylists',
            'feedFeedback',
            'durationCache',
            'shortsCache',
            'releaseDateCache',
            'popupAccentColor'
        ])
    ]);
    const data = {
        _metadata: {
            exportDate: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            exportFormat: 'json',
            dataVersion: '2.0',
            type: 'yt-rewatch-full-backup'
        },
        history: Object.values(videos || {}),
        playlists: Object.values(playlists || {}),
        localPlaylists: localData.localVideoPlaylists || {},
        subscriptions: subscriptions || [],
        watchLater: Object.values(watchLater || {}),
        settings: settings || {},
        stats,
        recommendationPreferences: localData.feedFeedback || {},
        caches: {
            durations: localData.durationCache || {},
            shorts: localData.shortsCache || {},
            releaseDates: localData.releaseDateCache || {}
        },
        interface: {
            popupAccentColor: localData.popupAccentColor || ''
        }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `yt-rewatch-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

async function restoreFeedBackup(file) {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw new Error('This is not a valid JSON backup file.'); }
    if (!data || typeof data !== 'object') throw new Error('Backup file is empty.');

    const history = Array.isArray(data.history) ? data.history : [];
    const playlists = Array.isArray(data.playlists) ? data.playlists : [];
    if (history.length || playlists.length) {
        await ytStorage.importRecords(history, playlists, true);
    }

    for (const subscription of (Array.isArray(data.subscriptions) ? data.subscriptions : [])) {
        if (subscription) await ytStorage.addSubscription(subscription);
    }
    for (const item of (Array.isArray(data.watchLater) ? data.watchLater : [])) {
        if (item && item.videoId) await ytStorage.setWatchLater(item.videoId, item);
    }
    if (data.settings && typeof data.settings === 'object') {
        const currentSettings = (await ytStorage.getSettings()) || {};
        await ytStorage.setSettings({ ...currentSettings, ...data.settings });
    }
    if (data.stats && typeof data.stats === 'object') {
        await ytStorage.setStats(data.stats);
    }

    const currentLocal = await chrome.storage.local.get([
        'localVideoPlaylists',
        'feedFeedback',
        'durationCache',
        'shortsCache',
        'releaseDateCache'
    ]);
    const localRestore = {};
    if (data.localPlaylists && typeof data.localPlaylists === 'object') {
        localRestore.localVideoPlaylists = {
            ...(currentLocal.localVideoPlaylists || {}),
            ...data.localPlaylists
        };
    }
    if (data.recommendationPreferences && typeof data.recommendationPreferences === 'object') {
        const currentFeedback = currentLocal.feedFeedback || {};
        localRestore.feedFeedback = {
            notInterested: {
                ...(currentFeedback.notInterested || {}),
                ...(data.recommendationPreferences.notInterested || {})
            },
            channelLess: {
                ...(currentFeedback.channelLess || {}),
                ...(data.recommendationPreferences.channelLess || {})
            },
            channelMore: {
                ...(currentFeedback.channelMore || {}),
                ...(data.recommendationPreferences.channelMore || {})
            }
        };
    }
    if (data.caches && typeof data.caches === 'object') {
        if (data.caches.durations) {
            localRestore.durationCache = {
                ...(currentLocal.durationCache || {}),
                ...data.caches.durations
            };
        }
        if (data.caches.shorts) {
            localRestore.shortsCache = {
                ...(currentLocal.shortsCache || {}),
                ...data.caches.shorts
            };
        }
        if (data.caches.releaseDates) {
            localRestore.releaseDateCache = {
                ...(currentLocal.releaseDateCache || {}),
                ...data.caches.releaseDates
            };
        }
    }
    if (data.interface && data.interface.popupAccentColor) {
        localRestore.popupAccentColor = data.interface.popupAccentColor;
    }
    if (Object.keys(localRestore).length) await chrome.storage.local.set(localRestore);

    await loadData();
    await loadFeedSettingsForm();
    notifySettingsChanged((await ytStorage.getSettings()) || {});
}

function notifySubsChanged() {
    try {
        chrome.tabs.query({ url: ['*://*.youtube.com/*'] }, (tabs) => {
            (tabs || []).forEach((tab) => {
                chrome.tabs.sendMessage(tab.id, { type: 'ytvhtSubsChanged' }).catch(() => {});
            });
        });
    } catch (_) { /* ignore */ }
}

let feedSettingsMessageTimer = null;

function setFeedSettingsMessage(text) {
    const message = document.getElementById('feedSettingsMessage');
    if (!message) return;

    if (feedSettingsMessageTimer) {
        clearTimeout(feedSettingsMessageTimer);
        feedSettingsMessageTimer = null;
    }

    const value = text || '';
    message.textContent = value;

    // Progress messages stay visible until the operation reports a result.
    // Finished messages behave like a toast and disappear automatically.
    if (value && !value.endsWith('…')) {
        feedSettingsMessageTimer = setTimeout(() => {
            message.textContent = '';
            feedSettingsMessageTimer = null;
        }, 3200);
    }
}

function refreshActiveFeedDataView() {
    if (settingsActive) return;
    if (historyActive) {
        renderHistory();
    } else if (subscriptionsActive) {
        renderSubscriptions();
    } else if (playlistsActive) {
        renderPlaylists();
    } else if (analyticsActive) {
        renderAnalytics();
    } else {
        render();
    }
}

function parseWatchHistoryHtml(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const records = [];
    const seen = new Set();

    let cells = Array.from(doc.querySelectorAll('div.content-cell'));
    if (cells.length === 0) cells = [doc.body];

    let index = 0;
    cells.forEach((cell) => {
        const videoLink = cell.querySelector('a[href*="watch?v="], a[href*="youtu.be/"]');
        if (!videoLink) return;
        const href = videoLink.getAttribute('href') || '';
        const idMatch = href.match(/[?&]v=([\w-]{11})/) || href.match(/youtu\.be\/([\w-]{11})/);
        if (!idMatch) return;
        const videoId = idMatch[1];
        if (seen.has(videoId)) return;
        seen.add(videoId);

        const title = (videoLink.textContent || '').trim() || 'Unknown Title';

        let channelName = '';
        let channelId = '';
        const chLink = cell.querySelector('a[href*="/channel/"], a[href*="youtube.com/@"]');
        if (chLink) {
            channelName = (chLink.textContent || '').trim();
            const chHref = chLink.getAttribute('href') || '';
            const cm = chHref.match(/\/channel\/(UC[\w-]+)/) || chHref.match(/\/(@[\w.\-]+)/);
            if (cm) channelId = cm[1];
        }

        let timestamp = 0;
        const dateMatch = (cell.textContent || '').match(
            /([A-Z][a-z]{2,8} \d{1,2}, \d{4}, [\d:]+(?:\s?[AP]M)?[^\n]*)/
        );
        if (dateMatch) {
            const parsed = Date.parse(dateMatch[1]);
            if (!isNaN(parsed)) timestamp = parsed;
        }
        if (!timestamp) timestamp = Date.now() - index * 60000;
        index++;

        records.push({
            videoId,
            title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            channelName: channelName || 'Unknown Channel',
            channelId,
            time: 0,
            duration: 0,
            importedHistory: true,
            timestamp
        });
    });

    return records;
}

function parseSubscriptionsExport(text, fileName) {
    const subs = [];
    const trimmed = text.trim();
    const looksJson = (fileName && fileName.toLowerCase().endsWith('.json')) ||
        trimmed.startsWith('[') || trimmed.startsWith('{');

    if (looksJson) {
        try {
            const data = JSON.parse(trimmed);
            const arr = Array.isArray(data) ? data : (data.subscriptions || []);
            arr.forEach((item) => {
                const snip = item.snippet || item;
                const resource = snip.resourceId || {};
                const ucid = resource.channelId || snip.channelId || item.channelId;
                const title = snip.title || item.title || 'Unknown Channel';
                if (ucid && /^UC[\w-]+$/.test(ucid)) {
                    subs.push({ ucid, title, url: `https://www.youtube.com/channel/${ucid}` });
                }
            });
            return subs;
        } catch (_) { /* fall through to CSV */ }
    }

    const lines = trimmed.split(/\r?\n/);
    lines.forEach((line, i) => {
        if (!line.trim()) return;
        if (i === 0 && /channel id/i.test(line)) return;
        const c1 = line.indexOf(',');
        const c2 = c1 >= 0 ? line.indexOf(',', c1 + 1) : -1;
        if (c1 < 0 || c2 < 0) return;
        const id = line.slice(0, c1).trim();
        const url = line.slice(c1 + 1, c2).trim();
        const title = line.slice(c2 + 1).trim().replace(/^"|"$/g, '');
        if (/^UC[\w-]+$/.test(id)) {
            subs.push({
                ucid: id,
                title: title || 'Unknown Channel',
                url: url || `https://www.youtube.com/channel/${id}`
            });
        }
    });
    return subs;
}

async function importYouTubeHistoryFile(file) {
    const text = await file.text();
    const records = parseWatchHistoryHtml(text);
    if (!records.length) {
        throw new Error('No videos found. Use watch-history.html from Google Takeout.');
    }
    const result = await ytStorage.importRecords(records, [], true);
    await loadData();
    return result.importedVideos || records.length;
}

async function importYouTubeChannelsFile(file) {
    const text = await file.text();
    const subs = parseSubscriptionsExport(text, file.name);
    if (!subs.length) {
        throw new Error('No channels found. Use subscriptions.csv from YouTube or Takeout.');
    }
    let added = 0;
    for (const sub of subs) {
        try {
            await ytStorage.addSubscription({
                id: sub.ucid,
                ucid: sub.ucid,
                channelName: sub.title,
                url: sub.url
            });
            added++;
        } catch (_) { /* skip bad rows */ }
    }
    localSubscriptions = await ytStorage.getSubscriptionList();
    notifySubsChanged();
    return added;
}


function parseCsvLine(line) {
    const fields = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quoted) {
            if (char === '"' && line[index + 1] === '"') {
                value += '"';
                index++;
            } else if (char === '"') {
                quoted = false;
            } else {
                value += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            fields.push(value.trim());
            value = '';
        } else {
            value += char;
        }
    }
    fields.push(value.trim());
    return fields;
}

function parseYouTubePlaylistCsv(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)
        .filter((line) => line.trim());
    if (!lines.length) return [];

    const header = parseCsvLine(lines[0]).map((value) =>
        value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    );
    const videoIndex = header.findIndex((value) => value === 'video id' || value.endsWith(' video id'));
    const timestampIndex = header.findIndex((value) =>
        value.includes('playlist video creation timestamp') ||
        value.includes('creation timestamp') ||
        value.includes('added timestamp')
    );
    if (videoIndex < 0) return [];

    const records = [];
    const seen = new Set();
    for (let index = 1; index < lines.length; index++) {
        const fields = parseCsvLine(lines[index]);
        const videoId = String(fields[videoIndex] || '').trim();
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        const parsed = timestampIndex >= 0 ? Date.parse(fields[timestampIndex] || '') : NaN;
        records.push({
            videoId,
            savedAt: Number.isFinite(parsed) ? parsed : Date.now() + records.length
        });
    }
    return records;
}

function importedPlaylistTitle(fileName) {
    const name = String(fileName || 'Imported playlist')
        .replace(/\.csv$/i, '')
        .trim();
    return name || 'Imported playlist';
}

function localPlaylistIdFromTitle(title, playlists) {
    let id = normalizeText(title).replace(/\s+/g, '-') || `playlist-${Date.now()}`;
    if (!playlists[id]) return id;
    let suffix = 2;
    while (playlists[`${id}-${suffix}`]) suffix++;
    return `${id}-${suffix}`;
}

function importedPlaylistVideo(videoId, source, savedAt) {
    const record = source || {};
    return {
        videoId,
        title: decodeHtmlEntities(record.title || 'YouTube video'),
        channelName: decodeHtmlEntities(record.channelName || ''),
        channelUrl: record.channelUrl || '',
        channelThumbnail: record.channelThumbnail || '',
        thumbnail: record.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: record.url || `https://www.youtube.com/watch?v=${videoId}`,
        duration: Number(record.duration || 0),
        published: Number(record.published || 0),
        _durationText: record._durationText || '',
        _viewsText: record._viewsText || '',
        _whenText: record._whenText || '',
        addedAt: savedAt,
        savedAt
    };
}

async function importYouTubePlaylistFile(file) {
    const csvText = await file.text();
    const rows = parseYouTubePlaylistCsv(csvText);
    if (!rows.length) {
        throw new Error('No playlist videos found. Choose a playlist CSV exported by Google Takeout.');
    }

    const title = importedPlaylistTitle(file.name);
    const stored = await chrome.storage.local.get(['localVideoPlaylists']);
    const playlists = stored.localVideoPlaylists || {};
    let playlist = Object.values(playlists).find((item) =>
        item && normalizeText(item.title) === normalizeText(title)
    );

    if (!playlist) {
        const id = localPlaylistIdFromTitle(title, playlists);
        playlist = {
            id,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            items: {},
            order: []
        };
    }

    playlist.items = playlist.items || {};
    playlist.order = Array.isArray(playlist.order)
        ? playlist.order.filter((videoId) => playlist.items[videoId])
        : Object.keys(playlist.items);

    let knownVideos = {};
    try { knownVideos = await ytStorage.getAllVideos(); } catch (_) { /* placeholders are fine */ }
    const currentVideos = Array.isArray(allVideos) ? allVideos : [];
    const currentById = Object.fromEntries(currentVideos
        .filter((video) => video && video.videoId)
        .map((video) => [video.videoId, video]));

    let added = 0;
    rows.forEach((row) => {
        const existing = playlist.items[row.videoId];
        const source = currentById[row.videoId] || knownVideos[row.videoId] || existing || null;
        if (!existing) {
            playlist.order.push(row.videoId);
            added++;
        }
        playlist.items[row.videoId] = {
            ...importedPlaylistVideo(row.videoId, source, row.savedAt),
            ...(existing || {}),
            addedAt: Number(existing?.addedAt || row.savedAt),
            savedAt: Number(existing?.savedAt || row.savedAt)
        };
    });

    playlist.updatedAt = Date.now();
    playlists[playlist.id] = playlist;
    await chrome.storage.local.set({ localVideoPlaylists: playlists });

    return { title: playlist.title, total: rows.length, added };
}

async function resetAllFeedData() {
    if (typeof cancelFeedRefreshes === 'function') cancelFeedRefreshes();
    setRefreshUi(false);
    setStatus('', false);
    await ytStorage.resetAllData();
    watchedMap = {};
    localSubscriptions = [];
    allVideos = [];
    lastUpdated = 0;
    feedCachePolicy = '';
    feedFeedback = { notInterested: {}, channelLess: {}, channelMore: {} };
    releaseDateCache = {};
    durationCache = {};
    shortsCache = {};
    feedDiagnostics = [];
    await loadFeedSettingsForm();
    applyFeedTheme(FEED_SETTINGS_DEFAULTS.themePreference || 'system');
    applyAccentColor(FEED_SETTINGS_DEFAULTS.accentColor || 'blue');
    const searchInput = document.getElementById('search');
    if (searchInput) searchInput.value = '';
    searchVisibleLimit = SEARCH_PAGE_SIZE;
    youtubeVisibleLimit = SEARCH_PAGE_SIZE;
    shortsOnly = false;
    subscriptionsChronological = false;
    channelActive = false;
    reshuffleHome();
    setRefreshUi(false);
    setStatus('', false);
    // Resetting data should not navigate the user away from Settings.
    showSettings();
    setTimeout(() => {
        setRefreshUi(false);
        setStatus('', false);
    }, 0);
    setTimeout(() => {
        setRefreshUi(false);
        setStatus('', false);
    }, 750);
    notifySubsChanged();
}

function getFeedSettingsUrl() {
    const runtime = (typeof browser !== 'undefined' && browser.runtime)
        ? browser.runtime
        : chrome.runtime;
    return runtime.getURL('feed.html') + '#settings';
}

function openFeedSettingsPage() {
    const url = getFeedSettingsUrl();
    if (chrome.tabs && typeof chrome.tabs.create === 'function') {
        try {
            chrome.tabs.create({ url });
            return;
        } catch (_) { /* fall through */ }
    }
    window.open(url, '_blank', 'noopener');
}


async function detectYouTubeImportType(file) {
    const text = await file.text();
    const name = String(file?.name || '').toLowerCase();

    // History Takeout is HTML and contains YouTube watch records.
    const historyRecords = parseWatchHistoryHtml(text);
    if (historyRecords.length && (
        /\.html?$/.test(name) ||
        /<html\b|<a\b/i.test(text)
    )) {
        return 'history';
    }

    // Playlist Takeout CSVs expose a Video ID column.
    if (parseYouTubePlaylistCsv(text).length) {
        return 'playlist';
    }

    // Subscriptions can be CSV, JSON, or text exports.
    if (parseSubscriptionsExport(text, file?.name || '').length) {
        return 'channels';
    }

    // Final history fallback for renamed Takeout files.
    if (historyRecords.length) {
        return 'history';
    }

    return '';
}

function initFeedDataSettings() {
    const restoreInput = document.getElementById('restoreBackupFile');
    const youtubeImportInput = document.getElementById('importYouTubeFile');

    document.getElementById('exportFeedData')?.addEventListener('click', async () => {
        const button = document.getElementById('exportFeedData');
        setFeedSettingsMessage('Creating backup…');
        if (button) button.disabled = true;
        try {
            await exportFeedData();
            setFeedSettingsMessage('Backup downloaded.');
        } catch (error) {
            console.error('[settings] export failed', error);
            setFeedSettingsMessage('Could not create backup.');
        } finally {
            if (button) button.disabled = false;
        }
    });

    document.getElementById('importFeedData')?.addEventListener('click', () => {
        if (restoreInput) {
            restoreInput.value = '';
            restoreInput.click();
        }
    });
    restoreInput?.addEventListener('change', async () => {
        const file = restoreInput.files && restoreInput.files[0];
        if (!file) return;
        if (!confirm('Restore this backup and merge it with your current local data?')) {
            restoreInput.value = '';
            return;
        }
        const button = document.getElementById('importFeedData');
        setFeedSettingsMessage('Restoring backup…');
        if (button) button.disabled = true;
        try {
            await restoreFeedBackup(file);
            refreshActiveFeedDataView();
            setFeedSettingsMessage('Backup restored. Your local data is ready.');
        } catch (error) {
            console.error('[settings] restore failed', error);
            setFeedSettingsMessage(error.message || 'Could not restore backup.');
        } finally {
            if (button) button.disabled = false;
            restoreInput.value = '';
        }
    });

    document.getElementById('importYouTubeData')?.addEventListener('click', () => {
        if (!youtubeImportInput) return;
        youtubeImportInput.value = '';
        youtubeImportInput.click();
    });

    youtubeImportInput?.addEventListener('change', async () => {
        const file = youtubeImportInput.files && youtubeImportInput.files[0];
        if (!file) return;

        const button = document.getElementById('importYouTubeData');
        if (button) button.disabled = true;
        setFeedSettingsMessage('Checking Google Takeout file…');

        try {
            const type = await detectYouTubeImportType(file);

            if (type === 'history') {
                setFeedSettingsMessage('Importing watch history…');
                const count = await importYouTubeHistoryFile(file);
                refreshActiveFeedDataView();
                setFeedSettingsMessage(`Imported ${count} videos into your history.`);
            } else if (type === 'channels') {
                setFeedSettingsMessage('Importing subscriptions…');
                const count = await importYouTubeChannelsFile(file);
                setFeedSettingsMessage(`Imported ${count} subscriptions.`);
            } else if (type === 'playlist') {
                setFeedSettingsMessage('Importing playlist…');
                const result = await importYouTubePlaylistFile(file);
                refreshActiveFeedDataView();
                setFeedSettingsMessage(
                    result.added === result.total
                        ? `Imported ${result.total} videos into “${result.title}”.`
                        : `Added ${result.added} new videos to “${result.title}” · ${result.total} total.`
                );
            } else {
                throw new Error(
                    'File not recognized. Choose watch-history.html, subscriptions.csv/json, or a playlist CSV from Google Takeout.'
                );
            }
        } catch (error) {
            console.error('[settings] YouTube import failed', error);
            setFeedSettingsMessage(error.message || 'Could not import this file.');
        } finally {
            if (button) button.disabled = false;
            youtubeImportInput.value = '';
        }
    });

    function confirmResetAllData() {
        const dialog = document.getElementById('resetDataDialog');
        const confirmButton = document.getElementById('resetDataConfirm');
        const cancelButton = document.getElementById('resetDataCancel');
        const closeButton = document.getElementById('resetDataDialogClose');

        // Use an in-page dialog instead of chained browser confirm() dialogs.
        // Firefox can suppress a second native dialog, which previously made reset impossible.
        if (!dialog || !confirmButton || !cancelButton || !closeButton) {
            return Promise.resolve(confirm(
                'Reset all Local Feed data in this browser?\n\n' +
                'This permanently deletes history, subscriptions, playlists, Watch Later, settings, stats, and caches.\n\n' +
                'This cannot be undone.'
            ));
        }

        return new Promise((resolve) => {
            let finished = false;
            const previousFocus = document.activeElement;

            const finish = (confirmed) => {
                if (finished) return;
                finished = true;
                dialog.hidden = true;
                confirmButton.removeEventListener('click', onConfirm);
                cancelButton.removeEventListener('click', onCancel);
                closeButton.removeEventListener('click', onCancel);
                dialog.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeydown, true);
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    try { previousFocus.focus(); } catch (_) { /* ignored */ }
                }
                resolve(confirmed);
            };
            const onConfirm = () => finish(true);
            const onCancel = () => finish(false);
            const onBackdrop = (event) => {
                if (event.target === dialog) finish(false);
            };
            const onKeydown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                }
            };

            confirmButton.addEventListener('click', onConfirm);
            cancelButton.addEventListener('click', onCancel);
            closeButton.addEventListener('click', onCancel);
            dialog.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKeydown, true);
            dialog.hidden = false;
            confirmButton.focus();
        });
    }

    document.getElementById('resetAllData')?.addEventListener('click', async () => {
        const button = document.getElementById('resetAllData');
        if (!await confirmResetAllData()) return;

        if (button) button.disabled = true;
        setFeedSettingsMessage('Resetting all data…');
        try {
            await resetAllFeedData();
            setFeedSettingsMessage('All local data has been reset.');
        } catch (error) {
            console.error('[settings] reset failed', error);
            setFeedSettingsMessage('Could not reset all data.');
        } finally {
            if (button) button.disabled = false;
        }
    });
}
