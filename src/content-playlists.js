(function() {
    'use strict';

    function createContentPlaylistHelpers(dependencies) {
        const log = dependencies.log;
        const getStorage = dependencies.getStorage;
        const getPlaylistRetryTimeout = dependencies.getPlaylistRetryTimeout;
        const setPlaylistRetryTimeout = dependencies.setPlaylistRetryTimeout;

        function getPlaylistInfo() {
            const urlParams = new URLSearchParams(window.location.search);
            const playlistId = urlParams.get('list');
            if (!playlistId) {
                log('No playlist ID found in URL');
                return null;
            }

            log('Found playlist ID:', playlistId);

            const selectors = [
                'ytd-playlist-panel-renderer #playlist-title yt-formatted-string',
                'ytd-playlist-panel-renderer #playlist-name yt-formatted-string',
                'ytd-playlist-panel-renderer .title yt-formatted-string',
                '.ytd-watch-flexy[playlist] .playlist-title',
                '#secondary .title.ytd-playlist-panel-renderer',
                'ytd-playlist-metadata-header-renderer yt-formatted-string.title',
                'h3.ytd-playlist-panel-renderer',
                '#playlist-title',
                '#playlist-name',
                'ytd-playlist-panel-renderer h3 yt-formatted-string',
                'ytd-playlist-panel-renderer .title',
                '#secondary-inner ytd-playlist-panel-renderer .title',
                'ytd-playlist-header-renderer h1.ytd-playlist-header-renderer',
                '.playlist-title yt-formatted-string',
                '.ytd-playlist-panel-renderer .index-message + .title',
                'yt-page-header-view-model h1.dynamicTextViewModelH1 span',
                'yt-page-header-view-model .yt-page-header-view-model__page-header-title h1 span',
                'yt-dynamic-text-view-model h1.dynamicTextViewModelH1 span'
            ];

            let playlistTitle = null;
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    playlistTitle = element.textContent?.trim();
                    log(`Tried selector "${selector}": "${playlistTitle}"`);
                    if (playlistTitle && playlistTitle !== 'Unknown Playlist' && playlistTitle.length > 0) {
                        log('Found valid playlist title:', playlistTitle);
                        break;
                    }
                }
            }

            if (!playlistTitle || playlistTitle === 'Unknown Playlist') {
                log('No valid playlist title found');
                return null;
            }

            let thumbnail = '';
            const currentVideoId = urlParams.get('v');
            if (currentVideoId) {
                thumbnail = `https://i.ytimg.com/vi/${currentVideoId}/hqdefault.jpg`;
            } else {
                const firstVideoLink = document.querySelector(
                    'ytd-playlist-video-renderer a[href*="watch?v="], ' +
                    'ytd-playlist-panel-video-renderer a[href*="watch?v="]'
                );
                if (firstVideoLink) {
                    try {
                        const firstVideoId = new URL(firstVideoLink.href, location.origin).searchParams.get('v');
                        if (firstVideoId) thumbnail = `https://i.ytimg.com/vi/${firstVideoId}/hqdefault.jpg`;
                    } catch (_) { /* thumbnail enrichment can retry later */ }
                }
            }

            const localItems = {};
            document.querySelectorAll(
                'ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer'
            ).forEach((row) => {
                const link = row.querySelector('a[href*="watch?v="]');
                if (!link) return;
                let videoId = '';
                try { videoId = new URL(link.href, location.origin).searchParams.get('v') || ''; } catch (_) { return; }
                if (!videoId || localItems[videoId]) return;
                const titleElement = row.querySelector(
                    '#video-title, #video-title-link, .title, yt-formatted-string.title'
                );
                const channelElement = row.querySelector(
                    'ytd-channel-name a, #byline a, .byline a, .channel-name a'
                );
                const durationElement = row.querySelector(
                    'ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer'
                );
                localItems[videoId] = {
                    videoId,
                    title: titleElement?.textContent?.trim() || link.title || 'YouTube video',
                    channelName: channelElement?.textContent?.trim() || '',
                    channelUrl: channelElement?.href || '',
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    _durationText: (durationElement?.textContent || '')
                        .replace(/\s+/g, ' ')
                        .match(/\b(?:\d+:)?\d{1,2}:\d{2}\b/)?.[0] || '',
                    savedAt: Date.now()
                };
            });

            const playlistInfo = {
                playlistId,
                title: playlistTitle,
                url: `https://www.youtube.com/playlist?list=${playlistId}`,
                timestamp: Date.now(),
                ...(currentVideoId ? { videoId: currentVideoId } : {}),
                ...(thumbnail ? { thumbnail } : {}),
                ...(Object.keys(localItems).length ? {
                    localItems,
                    videoCount: Object.keys(localItems).length
                } : {})
            };

            log('Created playlist info:', playlistInfo);
            return playlistInfo;
        }

        async function savePlaylistInfo(playlistInfo = null) {
            const info = playlistInfo || getPlaylistInfo();
            if (!info) return;

            log('Saving playlist info:', info);

            try {
                const existing = await getStorage().getPlaylist(info.playlistId);
                const merged = {
                    ...(existing || {}),
                    ...info,
                    ...((existing?.localItems || info.localItems) ? {
                        localItems: {
                            ...((existing && existing.localItems) || {}),
                            ...(info.localItems || {})
                        }
                    } : {}),
                    lastUpdated: Date.now()
                };
                if (merged.localItems) merged.videoCount = Object.keys(merged.localItems).length;
                await getStorage().setPlaylist(info.playlistId, merged);
                log('Playlist info saved successfully:', merged);
            } catch (error) {
                log('Error saving playlist info:', error);
            }
        }

        function tryToSavePlaylist(retries = 3) {
            const urlParams = new URLSearchParams(window.location.search);
            const playlistId = urlParams.get('list');

            if (!playlistId) {
                log('No playlist ID in URL, skipping playlist save');
                return;
            }

            log(`Trying to save playlist (${retries} retries left)...`);
            const playlistInfo = getPlaylistInfo();

            if (playlistInfo) {
                log('Playlist info found, saving...');
                savePlaylistInfo(playlistInfo);
                attachPlaylistIgnoreToggles();
            } else if (retries > 0) {
                log(`Playlist title not found for ID ${playlistId}, will retry in 3 seconds... (${retries} retries left)`);
                clearTimeout(getPlaylistRetryTimeout());

                const delay = Math.min(3000 * (4 - retries), 5000);
                setPlaylistRetryTimeout(setTimeout(() => {
                    const currentPlaylistId = new URLSearchParams(window.location.search).get('list');
                    if (currentPlaylistId === playlistId) {
                        tryToSavePlaylist(retries - 1);
                        attachPlaylistIgnoreToggles();
                    } else {
                        log('Playlist ID changed, stopping retry attempts');
                    }
                }, delay));
            } else {
                log('Failed to get playlist title after retries; skipping placeholder playlist save');
                attachPlaylistIgnoreToggles();
            }
        }

        async function attachPlaylistIgnoreToggles() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const playlistId = urlParams.get('list');
                if (!playlistId) return;

                const playlistRecord = await getStorage().getPlaylist(playlistId);
                const isIgnored = !!playlistRecord?.ignoreVideos;
                log('[Toggle] Preparing toggles for playlist', { playlistId, isIgnored });

                const headerSelectors = [
                    'ytd-playlist-header-renderer',
                    'ytd-playlist-metadata-header-renderer',
                    'yt-page-header-view-model'
                ];
                const panelSelector = 'ytd-playlist-panel-renderer';

                const queryDeep = (root, selector) => {
                    try {
                        const el = root.querySelector(selector);
                        if (el) return el;
                    } catch (_) {}
                    return null;
                };

                const findActionsRow = () => {
                    let row = document.querySelector('.ytFlexibleActionsViewModelActionRow');
                    if (row) return row;

                    const flexHost = document.querySelector('yt-flexible-actions-view-model');
                    if (flexHost && flexHost.shadowRoot) {
                        row = queryDeep(flexHost.shadowRoot, '.ytFlexibleActionsViewModelActionRow');
                        if (row) return row;
                    }

                    const headerHost = document.querySelector('yt-page-header-view-model');
                    if (headerHost && headerHost.shadowRoot) {
                        row = queryDeep(headerHost.shadowRoot, '.ytFlexibleActionsViewModelActionRow');
                        if (row) return row;
                    }

                    return null;
                };

                const setButtonText = (btn, pressed) => {
                    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
                    btn.textContent = pressed ? (chrome.i18n?.getMessage('content_toggle_paused') || 're:Watch - History paused. Click to activate') : (chrome.i18n?.getMessage('content_toggle_pause') || 're:Watch - Click to pause history');
                    btn.title = pressed ? (chrome.i18n?.getMessage('content_toggle_paused_title') || 're:Watch - History is paused for this playlist. Click to activate tracking') : (chrome.i18n?.getMessage('content_toggle_pause_title') || 're:Watch - Click to pause history for this playlist');
                };

                const togglePlaylistState = async (btn) => {
                    const existing = await getStorage().getPlaylist(playlistId);
                    const toggled = !(existing?.ignoreVideos);
                    const merged = {
                        ...(existing || {}),
                        playlistId,
                        url: `https://www.youtube.com/playlist?list=${playlistId}`,
                        ignoreVideos: toggled,
                        lastUpdated: Date.now(),
                        timestamp: existing?.timestamp || Date.now()
                    };
                    await getStorage().setPlaylist(playlistId, merged);
                    setButtonText(btn, toggled);
                };

                const bindToggleClick = (btn) => {
                    btn.onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            await togglePlaylistState(btn);
                        } catch (err) {
                            // no-op on failure
                        }
                    };
                };

                const ensureToggleIn = (container) => {
                    if (!container) return;
                    try {
                        const stylePos = window.getComputedStyle(container).position;
                        if (stylePos === 'static') {
                            container.style.position = 'relative';
                        }
                        log('[Toggle] ensureToggleIn container matched', container.tagName || 'node');
                        let btn = container.querySelector('.ytvht-ignore-toggle');
                        if (!btn) {
                            btn = document.createElement('button');
                            btn.className = 'ytvht-ignore-toggle';
                            btn.type = 'button';
                            container.appendChild(btn);
                            log('[Toggle] Inserted sidebar/context button');
                        }
                        setButtonText(btn, isIgnored);
                        bindToggleClick(btn);
                    } catch (err) {
                        // silent
                    }
                };

                const ensureHeaderToggle = (headerEl) => {
                    if (!headerEl) return;
                    try {
                        let actionsEl = findActionsRow();
                        if (!actionsEl) {
                            const actionSelectors = [
                                '#primary-actions',
                                '#actions',
                                '#top-level-buttons-computed',
                                '.actions'
                            ];
                            for (const sel of actionSelectors) {
                                const el = headerEl.querySelector(sel);
                                if (el) { actionsEl = el; log('[Toggle] Actions row matched selector', sel); break; }
                            }
                        }

                        let btn;
                        if (actionsEl) {
                            let row = actionsEl.parentNode?.querySelector('.ytvht-ignore-row');
                            if (!row) {
                                row = document.createElement('div');
                                row.className = 'ytvht-ignore-row';
                                if (actionsEl.parentNode) {
                                    actionsEl.parentNode.insertBefore(row, actionsEl.nextSibling);
                                } else {
                                    headerEl.appendChild(row);
                                }
                                log('[Toggle] Inserted header row after actions');
                            }
                            btn = row.querySelector('.ytvht-ignore-toggle');
                            if (!btn) {
                                btn = document.createElement('button');
                                btn.className = 'ytvht-ignore-toggle header';
                                btn.type = 'button';
                                row.appendChild(btn);
                                log('[Toggle] Inserted header button in its own row');
                            }
                        } else {
                            let row = headerEl.querySelector('.ytvht-ignore-row');
                            if (!row) {
                                row = document.createElement('div');
                                row.className = 'ytvht-ignore-row';
                                headerEl.appendChild(row);
                                log('[Toggle] Inserted header row at end of header (no actions found)');
                            }
                            btn = row.querySelector('.ytvht-ignore-toggle');
                            if (!btn) {
                                btn = document.createElement('button');
                                btn.className = 'ytvht-ignore-toggle header';
                                btn.type = 'button';
                                row.appendChild(btn);
                                log('[Toggle] Inserted header button in fallback row');
                            }
                        }

                        setButtonText(btn, isIgnored);
                        bindToggleClick(btn);
                    } catch (err) {
                        // silent
                    }
                };

                for (const sel of headerSelectors) {
                    const header = document.querySelector(sel);
                    if (header) { log('[Toggle] Header matched selector', sel); ensureHeaderToggle(header); }
                }

                const panel = document.querySelector(panelSelector);
                if (panel) { log('[Toggle] Sidebar panel found'); ensureToggleIn(panel); }

                const pageHeader = document.querySelector('yt-page-header-view-model');
                if (pageHeader && !pageHeader.querySelector('.ytvht-ignore-toggle')) {
                    log('[Toggle] Fallback inserting into page header');
                    ensureHeaderToggle(pageHeader);
                }
            } catch (_) {
                // silent
            }
        }

        function ensurePlaylistIgnoreToggles(retries = 12) {
            try {
                const hasList = new URLSearchParams(window.location.search).get('list');
                if (!hasList) return;

                attachPlaylistIgnoreToggles();

                if (retries > 0) {
                    const header = document.querySelector('yt-page-header-view-model, ytd-playlist-header-renderer, ytd-playlist-metadata-header-renderer');
                    const headerToggle = header ? header.querySelector('.ytvht-ignore-toggle') : null;
                    if (!headerToggle) {
                        const delay = 500;
                        setTimeout(() => ensurePlaylistIgnoreToggles(retries - 1), delay);
                    }
                }
            } catch (e) {
                // silent
            }
        }

        return {
            getPlaylistInfo,
            savePlaylistInfo,
            tryToSavePlaylist,
            attachPlaylistIgnoreToggles,
            ensurePlaylistIgnoreToggles
        };
    }

    window.YTVHTContentPlaylists = {
        create: createContentPlaylistHelpers
    };
})();
