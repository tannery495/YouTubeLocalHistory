(function() {
    'use strict';

    function extractWatchLaterVideoMeta(videoId) {
        const txt = (el) => (el && (el.textContent || '').trim()) || '';
        const id = String(videoId || '').trim();
        if (!id) return { title: '', channelName: '' };

        const onWatch = new URLSearchParams(location.search).get('v') === id;
        const onShorts = location.pathname.indexOf('/shorts/' + id) === 0;
        if (onWatch || onShorts) {
            const h1 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-watch-metadata, yt-shorts-video-title-view-model h2 span');
            const title = txt(h1) || document.title.replace(/ - YouTube( Shorts)?$/, '').trim();
            const ch = document.querySelector('ytd-video-owner-renderer #channel-name a, #owner #channel-name a, ytd-channel-name a, #owner-name a');
            return { title, channelName: txt(ch) };
        }

        const escapedId = id.replace(/(["\\])/g, '\\$1');
        const a = document.querySelector(
            'a#thumbnail[href*="' + escapedId + '"], a[href*="watch?v=' + escapedId + '"], a[href*="/shorts/' + escapedId + '"]'
        );
        if (a) {
            const box = a.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model') || document;
            const t = box.querySelector('#video-title, a#video-title-link, yt-formatted-string#video-title, .yt-lockup-metadata-view-model-wiz__title');
            const title = txt(t) || a.getAttribute('title') || a.getAttribute('aria-label') || '';
            const ch = box.querySelector('ytd-channel-name a, #channel-name a, .yt-content-metadata-view-model-wiz__metadata-text');
            return { title: title.trim(), channelName: txt(ch) };
        }

        return { title: '', channelName: '' };
    }

    function textOf(node) {
        return (node && (node.textContent || '').trim()) || '';
    }

    function firstMatch(text, pattern) {
        const match = String(text || '').match(pattern);
        return match ? match[0].trim() : '';
    }

    function collectVisibleChannelVideos(limit = 120) {
        const maxItems = Math.max(20, Math.min(200, Number(limit) || 120));
        const root =
            document.querySelector('ytd-rich-grid-renderer') ||
            document.querySelector('ytd-two-column-browse-results-renderer #primary') ||
            document.querySelector('ytd-browse[page-subtype="channels"] #contents') ||
            document.querySelector('main') ||
            document;

        const result = [];
        const seen = new Set();
        const anchors = root.querySelectorAll('a[href*="/watch?v="]');

        for (const anchor of anchors) {
            if (result.length >= maxItems) break;
            let url;
            try {
                url = new URL(anchor.getAttribute('href') || anchor.href || '', location.origin);
            } catch (_) {
                continue;
            }
            const videoId = String(url.searchParams.get('v') || '').trim();
            if (!videoId || seen.has(videoId)) continue;

            const card = anchor.closest(
                'ytd-rich-item-renderer, ytd-rich-grid-media, ytd-grid-video-renderer, ' +
                'ytd-video-renderer, yt-lockup-view-model, .yt-lockup-view-model-wiz'
            ) || anchor.parentElement;
            if (!card) continue;

            const titleNode =
                card.querySelector('a#video-title-link') ||
                card.querySelector('a#video-title') ||
                card.querySelector('#video-title') ||
                card.querySelector('h3 a[href*="/watch?v="]') ||
                card.querySelector('.yt-lockup-metadata-view-model-wiz__title') ||
                anchor;
            const title = (
                titleNode.getAttribute?.('title') ||
                titleNode.getAttribute?.('aria-label') ||
                textOf(titleNode)
            ).trim();
            if (!title) continue;

            const cardText = textOf(card);
            const thumbnailNode =
                card.querySelector('ytd-thumbnail img') ||
                card.querySelector('yt-image img') ||
                card.querySelector('img');
            const thumbnail = (
                thumbnailNode?.currentSrc ||
                thumbnailNode?.src ||
                thumbnailNode?.getAttribute?.('src') ||
                ''
            ).trim();

            const viewsText =
                firstMatch(cardText, /\b(?:No|[\d.,]+(?:\s*[KMBT])?)\s+views?\b/i) ||
                firstMatch(cardText, /\b[\d.,]+(?:\s*[KMBT])?\s+watching\b/i);
            const publishedText =
                firstMatch(cardText, /\b(?:Streamed\s+|Premiered\s+)?(?:just now|yesterday|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)\b/i);
            const durationNode =
                card.querySelector('ytd-thumbnail-overlay-time-status-renderer #text') ||
                card.querySelector('ytd-thumbnail-overlay-time-status-renderer') ||
                card.querySelector('.badge-shape-wiz__text') ||
                card.querySelector('[aria-label*="minutes"], [aria-label*="seconds"], [aria-label*="hours"]');
            const durationText =
                firstMatch(textOf(durationNode), /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/) ||
                firstMatch(cardText, /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
            const isLive = /\bLIVE\b/i.test(cardText) || /\bwatching\b/i.test(viewsText);

            seen.add(videoId);
            result.push({
                videoId,
                title,
                thumbnail,
                viewsText,
                publishedText,
                durationText,
                isLive
            });
        }

        return result;
    }

    async function scrapeChannelVideosFromCurrentPage(limit = 120) {
        const maxItems = Math.max(20, Math.min(200, Number(limit) || 120));
        const collected = new Map();
        let stableRounds = 0;
        let lastCount = 0;
        let lastHeight = 0;

        const mergeCurrent = () => {
            for (const item of collectVisibleChannelVideos(maxItems)) {
                if (!collected.has(item.videoId)) collected.set(item.videoId, item);
            }
        };

        mergeCurrent();

        for (let round = 0; round < 16 && collected.size < maxItems; round++) {
            const scrolling = document.scrollingElement || document.documentElement || document.body;
            const height = Math.max(
                scrolling?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0,
                document.body?.scrollHeight || 0
            );
            try {
                window.scrollTo(0, height);
            } catch (_) {
                if (scrolling) scrolling.scrollTop = height;
            }

            await new Promise((resolve) => setTimeout(resolve, 750));
            mergeCurrent();

            const nextHeight = Math.max(
                scrolling?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0,
                document.body?.scrollHeight || 0
            );
            if (collected.size === lastCount && nextHeight <= lastHeight + 8) {
                stableRounds++;
            } else {
                stableRounds = 0;
            }
            lastCount = collected.size;
            lastHeight = nextHeight;
            if (stableRounds >= 3) break;
        }

        return Array.from(collected.values()).slice(0, maxItems);
    }

    function createContentMessageListener(dependencies) {
        const log = dependencies.log;
        const getStorage = dependencies.getStorage;
        const isInitialized = dependencies.isInitialized;
        const initializeIfNeeded = dependencies.initializeIfNeeded;
        const injectCSS = dependencies.injectCSS;
        const updateOverlayCSS = dependencies.updateOverlayCSS;
        const overlayColors = dependencies.overlayColors;
        const overlayLabelSizeMap = dependencies.overlayLabelSizeMap;
        const getAccentOverlayColor = dependencies.getAccentOverlayColor;
        const setCurrentSettings = dependencies.setCurrentSettings;
        const processExistingThumbnails = dependencies.processExistingThumbnails;

        return function contentMessageListener(message, sender, sendResponse) {
            const storage = getStorage();

            if (message.type === 'extractWatchLaterVideoMeta') {
                try {
                    sendResponse(extractWatchLaterVideoMeta(message.videoId));
                } catch (_) {
                    sendResponse({ title: '', channelName: '' });
                }
                return true;
            } else if (message.type === 'scrapeYouTubeChannelVideosInTab') {
                const limit = Math.max(20, Math.min(200, Number(message.limit) || 120));
                scrapeChannelVideosFromCurrentPage(limit).then((items) => {
                    sendResponse({ items });
                }).catch((error) => {
                    sendResponse({ error: error && error.message ? error.message : String(error), items: [] });
                });
                return true;
            } else if (message.type === 'fetchYouTubeSearchPageInTab') {
                const query = String(message.query || '').trim();
                if (!query) {
                    sendResponse({ error: 'Missing YouTube search query' });
                    return true;
                }
                fetch(`/results?search_query=${encodeURIComponent(query)}`, {
                    credentials: 'include'
                }).then(async (response) => {
                    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
                    sendResponse({ html: await response.text() });
                }).catch((error) => {
                    sendResponse({ error: error && error.message ? error.message : String(error) });
                });
                return true;
            } else if (message.type === 'fetchYouTubeSearchContinuationInTab') {
                const token = String(message.token || '');
                const config = message.config || {};
                if (!token || !config.clientVersion) {
                    sendResponse({ error: 'Missing YouTube search continuation data' });
                    return true;
                }
                const key = config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : '';
                const headers = {
                    'Content-Type': 'application/json',
                    'X-YouTube-Client-Name': '1',
                    'X-YouTube-Client-Version': String(config.clientVersion)
                };
                if (config.visitorData) headers['X-Goog-Visitor-Id'] = String(config.visitorData);
                const context = {
                    client: {
                        clientName: 'WEB',
                        clientVersion: String(config.clientVersion),
                        visitorData: String(config.visitorData || ''),
                        hl: 'en',
                        gl: 'US'
                    }
                };
                if (config.clickTrackingParams) {
                    context.clickTracking = { clickTrackingParams: String(config.clickTrackingParams) };
                }
                fetch(`/youtubei/v1/search${key}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify({
                        context,
                        continuation: token
                    })
                }).then(async (response) => {
                    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
                    sendResponse({ data: await response.json() });
                }).catch((error) => {
                    sendResponse({ error: error && error.message ? error.message : String(error) });
                });
                return true;
            } else if (message.type === 'fetchYouTubeBrowseContinuationInTab') {
                const token = String(message.token || '');
                const config = message.config || {};
                if (!token || !config.clientVersion) {
                    sendResponse({ error: 'Missing YouTube browse continuation data' });
                    return true;
                }
                const key = config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : '';
                const headers = {
                    'Content-Type': 'application/json',
                    'X-YouTube-Client-Name': '1',
                    'X-YouTube-Client-Version': String(config.clientVersion)
                };
                if (config.visitorData) headers['X-Goog-Visitor-Id'] = String(config.visitorData);
                const context = {
                    client: {
                        clientName: 'WEB',
                        clientVersion: String(config.clientVersion),
                        visitorData: String(config.visitorData || ''),
                        hl: 'en',
                        gl: 'US'
                    }
                };
                if (config.clickTrackingParams) {
                    context.clickTracking = { clickTrackingParams: String(config.clickTrackingParams) };
                }
                fetch(`/youtubei/v1/browse${key}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify({
                        context,
                        continuation: token
                    })
                }).then(async (response) => {
                    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
                    sendResponse({ data: await response.json() });
                }).catch((error) => {
                    sendResponse({ error: error && error.message ? error.message : String(error) });
                });
                return true;
            } else if (message.type === 'getHistory') {
                if (!isInitialized()) {
                    log('Not initialized yet, initializing now');
                    initializeIfNeeded();
                }
                storage.getAllVideos().then(allVideos => {
                    const history = Object.values(allVideos);
                    log('Sending history to popup:', history);
                    sendResponse({history: history});
                }).catch(error => {
                    log('Error getting history:', error);
                    sendResponse({history: []});
                });
                return true;
            } else if (message.type === 'exportHistory') {
                if (!isInitialized()) {
                    log('Not initialized yet, initializing now');
                    initializeIfNeeded();
                }
                Promise.all([
                    storage.getAllVideos(),
                    storage.getAllPlaylists()
                ]).then(([allVideos, allPlaylists]) => {
                    const history = Object.values(allVideos);
                    const playlists = Object.values(allPlaylists);
                    log('Sending export data to popup:', { history, playlists });
                    sendResponse({history: history, playlists: playlists});
                }).catch(error => {
                    log('Error getting export data:', error);
                    sendResponse({history: [], playlists: []});
                });
                return true;
            } else if (message.type === 'pauseVideoForImport') {
                try {
                    const video = document.querySelector('video');
                    if (video && !video.paused) {
                        video.pause();
                        log('Paused video for import flow');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    log('Error pausing video for import:', error);
                    sendResponse({ status: 'error', error: error && error.message ? error.message : String(error) });
                }
                return true;
            } else if (message.type === 'clearHistory') {
                storage.clear().then(() => {
                    log('History cleared successfully');
                    sendResponse({status: 'success'});
                }).catch(error => {
                    log('Error clearing history:', error);
                    sendResponse({status: 'error'});
                });
                return true;
            } else if (message.type === 'deleteRecord') {
                const videoId = message.videoId;
                storage.removeVideo(videoId).then(() => {
                    log('Record deleted successfully:', videoId);
                    sendResponse({status: 'success'});
                }).catch(error => {
                    log('Error deleting record:', videoId);
                    sendResponse({status: 'error'});
                });
                return true;
            } else if (message.type === 'getPlaylists') {
                storage.getAllPlaylists().then(allPlaylists => {
                    const playlists = Object.values(allPlaylists);
                    log('Sending playlists to popup:', playlists);
                    sendResponse({playlists: playlists});
                }).catch(error => {
                    log('Error getting playlists:', error);
                    sendResponse({playlists: []});
                });
                return true;
            } else if (message.type === 'deletePlaylist') {
                const playlistId = message.playlistId;
                storage.removePlaylist(playlistId).then(() => {
                    log('Playlist deleted successfully:', playlistId);
                    sendResponse({status: 'success'});
                }).catch(error => {
                    log('Error deleting playlist:', playlistId);
                    sendResponse({status: 'error'});
                });
                return true;
            } else if (message.type === 'updateSettings') {
                const currentSettings = message.settings;
                setCurrentSettings(currentSettings);
                if (currentSettings.debug) {
                    
                }
                injectCSS();
                updateOverlayCSS(
                    overlayLabelSizeMap[currentSettings.overlayLabelSize] || overlayLabelSizeMap.medium,
                    getAccentOverlayColor
                        ? getAccentOverlayColor(currentSettings)
                        : (overlayColors[currentSettings.accentColor] || overlayColors[currentSettings.overlayColor] || overlayColors.blue)
                );
                processExistingThumbnails();
                sendResponse({status: 'success'});
                return true;
            }

            return false;
        };
    }

    window.YTVHTContentMessages = {
        create: createContentMessageListener
    };
})();
