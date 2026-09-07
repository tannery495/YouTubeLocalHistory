// Shared Home feed parser/selector for YouTube Local Feed.
//
// Loaded by both the YouTube content script and the extension feed page. Keep
// YouTube upload parsing and cache selection here so the two surfaces cannot
// drift into different feed systems again.
(function () {
    'use strict';

    const FEED_CACHE_POLICY = 'balanced-backfill-rss-dates-v9';
    const CHANNEL_BACKFILL_MAX_AGE_DAYS = 1095;
    const CHANNEL_BACKFILL_LIMIT = 120;
    const CHANNEL_BACKFILL_MAX_PAGES = 8;

    function newestFirstVideos(videos) {
        return videos.slice()
            .sort((a, b) => Number(b?.published || 0) - Number(a?.published || 0));
    }

    function feedChannelKey(video) {
        return String(video?.channelId || video?.channelUrl || video?.channelName || 'unknown').toLowerCase();
    }

    function roundRobinByChannel(videos, limit) {
        const groups = new Map();
        videos.forEach((video) => {
            const key = feedChannelKey(video);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(video);
        });
        const keys = Array.from(groups.keys());
        const picked = [];
        while (picked.length < limit && keys.length) {
            let advanced = false;
            for (let i = 0; i < keys.length && picked.length < limit; i++) {
                const next = groups.get(keys[i])?.shift();
                if (next) {
                    picked.push(next);
                    advanced = true;
                }
            }
            if (!advanced) break;
        }
        return picked;
    }

    function selectFeedVideos(videos, limit) {
        const sorted = newestFirstVideos(videos);
        const selected = [];
        const selectedIds = new Set();
        const now = Date.now();
        const dayMs = 86400000;
        const buckets = [
            { min: 0, max: 30, share: 0.35 },
            { min: 30, max: 90, share: 0.24 },
            { min: 90, max: 180, share: 0.18 },
            { min: 180, max: 365, share: 0.13 },
            { min: 365, max: 1096, share: 0.10 }
        ];

        const add = (video) => {
            if (!video || !video.videoId || selectedIds.has(video.videoId) || selected.length >= limit) return;
            selectedIds.add(video.videoId);
            selected.push(video);
        };

        buckets.forEach((bucket) => {
            const bucketLimit = Math.max(1, Math.round(limit * bucket.share));
            const items = sorted.filter((video) => {
                if (!video?.published) return false;
                const age = (now - Number(video.published)) / dayMs;
                return age >= bucket.min && age < bucket.max;
            });
            roundRobinByChannel(items, bucketLimit).forEach(add);
        });

        sorted.forEach(add);
        return selected.slice(0, limit);
    }

    function decodeEmbeddedJsonString(value) {
        try { return JSON.parse(`"${value}"`); } catch (_) { return value; }
    }

    function runsText(node) {
        if (!node) return '';
        if (node.simpleText) return node.simpleText;
        if (Array.isArray(node.runs)) return node.runs.map((run) => run.text || '').join('');
        return '';
    }

    function parseRelativePublished(text) {
        const value = String(text || '').toLowerCase();
        if (!value) return 0;
        if (value.includes('just now') || value.includes('minute') || value.includes('hour')) {
            return Date.now();
        }
        if (value.includes('yesterday')) return Date.now() - 86400000;
        const match = value.match(/(\d+)\s+(day|week|month|year)s?\s+ago/);
        if (!match) return 0;
        const amount = Number(match[1]) || 0;
        const multipliers = { day: 1, week: 7, month: 30, year: 365 };
        return Date.now() - amount * (multipliers[match[2]] || 0) * 86400000;
    }

    function parseViewsText(text) {
        const value = String(text || '').toLowerCase().replace(/,/g, '');
        const match = value.match(/([\d.]+)\s*([kmb]?)/);
        if (!match) return 0;
        const amount = Number(match[1]);
        if (!Number.isFinite(amount)) return 0;
        const multipliers = { k: 1e3, m: 1e6, b: 1e9 };
        return Math.round(amount * (multipliers[match[2]] || 1));
    }

    function parseDurationText(text) {
        const parts = String(text || '').trim().split(':').map(Number);
        if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
        return parts.reduce((total, part) => total * 60 + part, 0);
    }

    function rendererDurationText(renderer) {
        const direct = runsText(renderer?.lengthText);
        if (direct) return direct;
        const overlays = renderer?.thumbnailOverlays || [];
        for (const overlay of overlays) {
            const text = runsText(overlay.thumbnailOverlayTimeStatusRenderer?.text);
            if (text) return text;
        }
        return '';
    }

    function rendererIsLive(renderer) {
        if (!renderer) return false;
        const text = JSON.stringify([]
            .concat(renderer.badges || [])
            .concat(renderer.ownerBadges || [])
            .concat(renderer.thumbnailOverlays || [])).toLowerCase();
        return text.includes('badge_style_type_live_now') ||
            text.includes('"style":"live"') ||
            text.includes('live now');
    }

    function memberBadgeText(node) {
        if (!node || typeof node !== 'object') return '';
        const text = JSON.stringify(node).toLowerCase();
        if (/members?[^a-z0-9]{0,20}only/.test(text) ||
            text.includes('badge_style_type_members_only')) return 'Members only';
        if (/members?[^a-z0-9]{0,20}first/.test(text) ||
            text.includes('badge_style_type_members_first')) return 'Members first';
        return '';
    }

    function firstContentImageSource(node) {
        const sources = node?.contentImage?.thumbnailViewModel?.image?.sources ||
            node?.thumbnailViewModel?.image?.sources ||
            node?.thumbnail?.thumbnails ||
            [];
        return sources.length ? sources[sources.length - 1].url : '';
    }

    function findDurationBadgeText(node) {
        if (!node || typeof node !== 'object') return '';
        const badgeText = node.thumbnailBadgeViewModel?.text;
        if (typeof badgeText === 'string' && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(badgeText)) {
            return badgeText;
        }
        for (const value of Object.values(node)) {
            const found = findDurationBadgeText(value);
            if (found) return found;
        }
        return '';
    }

    function findWatchEndpoint(node) {
        if (!node || typeof node !== 'object') return null;
        if (node.watchEndpoint?.videoId) return node.watchEndpoint;
        for (const value of Object.values(node)) {
            const found = findWatchEndpoint(value);
            if (found) return found;
        }
        return null;
    }

    function metadataPartText(part) {
        if (!part) return '';
        const node = part.text || part;

        if (typeof node === 'string') return node.trim();
        if (typeof node.content === 'string') return node.content.trim();
        if (typeof node.simpleText === 'string') return node.simpleText.trim();
        if (Array.isArray(node.runs)) {
            return node.runs.map((run) => run?.text || '').join('').trim();
        }
        if (typeof node.accessibilityLabel === 'string') return node.accessibilityLabel.trim();
        if (typeof part.accessibilityLabel === 'string') return part.accessibilityLabel.trim();
        if (typeof node.accessibilityData?.label === 'string') return node.accessibilityData.label.trim();
        return '';
    }

    function lockupMetadataRows(lockup) {
        const rows = lockup?.metadata?.lockupMetadataViewModel?.metadata
            ?.contentMetadataViewModel?.metadataRows || [];

        return rows
            .map((row) => (row?.metadataParts || [])
                .map(metadataPartText)
                .filter(Boolean))
            .filter((row) => row.length);
    }

    function lockupMetadataParts(lockup) {
        return lockupMetadataRows(lockup).flat();
    }

    function collectRendererStrings(node, out = [], seen = new Set()) {
        if (node == null || out.length >= 500) return out;
        if (typeof node === 'string') {
            const value = node.replace(/\u00a0|\u202f/gi, ' ').replace(/[  ]/g, ' ').trim();
            if (value && value.length <= 240) out.push(value);
            return out;
        }
        if (typeof node !== 'object' || seen.has(node)) return out;
        seen.add(node);
        if (Array.isArray(node)) {
            node.forEach((value) => collectRendererStrings(value, out, seen));
        } else {
            Object.values(node).forEach((value) => collectRendererStrings(value, out, seen));
        }
        return out;
    }

    function rendererViewsText(node) {
        const values = collectRendererStrings(node);
        for (const value of values) {
            const match = value.match(/\b[\d.,]+\s*(?:K|M|B|T)?\s+views?\b/i);
            if (match) return match[0];
        }
        return '';
    }

    function rendererPublishedText(node) {
        const values = collectRendererStrings(node);
        for (const value of values) {
            const match = value.match(/\b(?:just now|yesterday|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)\b/i);
            if (match) return match[0];
        }
        return '';
    }

    function isPublishedText(text) {
        const value = String(text || '').toLowerCase();
        return value.includes('yesterday') ||
            /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/.test(value);
    }

    function channelUrlForSub(sub) {
        return sub.url
            || (sub.handle ? `https://www.youtube.com/${sub.handle}` : null)
            || (sub.id && sub.id.startsWith('@') ? `https://www.youtube.com/${sub.id}` : null)
            || (sub.ucid ? `https://www.youtube.com/channel/${sub.ucid}` : null);
    }

    function uploadRendererToVideo(renderer, sub) {
        if (!renderer?.videoId) return null;
        const thumbs = renderer.thumbnail?.thumbnails || [];
        const durationText = rendererDurationText(renderer);
        const publishedText = runsText(renderer.publishedTimeText) || rendererPublishedText(renderer);
        const viewsText = runsText(renderer.shortViewCountText) || runsText(renderer.viewCountText) || rendererViewsText(renderer);
        return {
            videoId: renderer.videoId,
            title: runsText(renderer.title) || 'Untitled',
            published: parseRelativePublished(publishedText),
            thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${renderer.videoId}/mqdefault.jpg`,
            channelName: sub.channelName || '',
            channelThumbnail: sub.thumbnail || null,
            channelUrl: channelUrlForSub(sub),
            views: parseViewsText(viewsText),
            duration: parseDurationText(durationText),
            _viewsText: viewsText,
            isLive: rendererIsLive(renderer),
            _memberBadgeText: memberBadgeText(renderer),
            _whenText: publishedText,
            channelId: sub.id,
            url: `https://www.youtube.com/watch?v=${renderer.videoId}`
        };
    }

    function lockupToVideo(lockup, sub) {
        if (!lockup || lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
        const endpoint = findWatchEndpoint(lockup);
        const videoId = lockup.contentId || endpoint?.videoId;
        if (!videoId) return null;

        const rows = lockupMetadataRows(lockup);
        const parts = rows.flat();

        // On current YouTube lockupViewModel video cards the detail row contains
        // [views, published age]. Use its position rather than English words so
        // this also works for "weergaven", "dagen geleden", etc.
        let detailRow = rows.find((row, index) => index > 0 && row.length >= 2) ||
            rows.find((row) => row.length >= 2) ||
            [];

        let viewsText = detailRow[0] || '';
        let publishedText = detailRow[1] || '';

        // Legacy / alternate renderer fallback.
        if (!viewsText) {
            viewsText = parts.find((part) => /views?/i.test(part)) || rendererViewsText(lockup);
        }
        if (!publishedText) {
            publishedText = parts.find(isPublishedText) || rendererPublishedText(lockup);
        }

        const thumbnail = firstContentImageSource(lockup) || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        if (!viewsText && !publishedText) {
            console.warn('[Local Feed] Missing channel video metadata');
        }

        return {
            videoId,
            title: lockup?.metadata?.lockupMetadataViewModel?.title?.content || 'Untitled',
            published: parseRelativePublished(publishedText),
            thumbnail,
            channelName: sub.channelName || '',
            channelThumbnail: sub.thumbnail || null,
            channelUrl: channelUrlForSub(sub),
            views: parseViewsText(viewsText),
            duration: parseDurationText(findDurationBadgeText(lockup)),
            _viewsText: viewsText,
            isLive: rendererIsLive(lockup),
            _memberBadgeText: memberBadgeText(lockup),
            _whenText: publishedText,
            channelId: sub.id,
            url: `https://www.youtube.com/watch?v=${videoId}`
        };
    }

    function collectUploadVideos(node, sub, out = []) {
        const stack = [node];
        const queuedVideoIds = new Set(out.map((video) => video?.videoId).filter(Boolean));
        while (stack.length && out.length < CHANNEL_BACKFILL_LIMIT * 2) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;
            const renderer = item.videoRenderer ||
                item.gridVideoRenderer ||
                (item.richItemRenderer?.content &&
                    (item.richItemRenderer.content.videoRenderer || item.richItemRenderer.content.gridVideoRenderer));
            if (renderer) {
                const video = uploadRendererToVideo(renderer, sub);
                if (video && !queuedVideoIds.has(video.videoId)) {
                    queuedVideoIds.add(video.videoId);
                    out.push(video);
                }
            } else if (item.lockupViewModel) {
                const video = lockupToVideo(item.lockupViewModel, sub);
                if (video && !queuedVideoIds.has(video.videoId)) {
                    queuedVideoIds.add(video.videoId);
                    out.push(video);
                }
            }

            // Preserve YouTube's renderer order. Pushing children in reverse
            // means the stack pops the first visible item first; the previous
            // traversal reversed each rich-grid page and made Latest/Popular/
            // Oldest appear incorrect even when the correct feed was fetched.
            const values = Array.isArray(item) ? item : Object.values(item);
            for (let index = values.length - 1; index >= 0; index--) {
                const value = values[index];
                if (value && typeof value === 'object') stack.push(value);
            }
        }
        return out;
    }


    // Only parse the content belonging to the requested channel tab. YouTube's
    // initial data contains navigation, shelves and other renderers from around
    // the page; scanning the whole object can make Shorts/Live accidentally
    // inherit normal uploads.
    function selectedChannelTabContent(node, tab) {
        if (!node || typeof node !== 'object') return null;
        const wanted = String(tab || '').toLowerCase();
        const labels = {
            videos: ['videos'],
            shorts: ['shorts'],
            live: ['live', 'streams'],
            playlists: ['playlists'],
            posts: ['posts', 'community']
        }[wanted] || [wanted];

        const stacks = [node];
        let matching = null;
        while (stacks.length) {
            const item = stacks.pop();
            if (!item || typeof item !== 'object') continue;

            const tabs = item.tabs;
            if (Array.isArray(tabs)) {
                for (const tabItem of tabs) {
                    const renderer = tabItem?.tabRenderer || tabItem?.expandableTabRenderer;
                    if (!renderer) continue;
                    const title = String(renderer.title || runsText(renderer.titleText) || '').trim().toLowerCase();
                    const isWanted = labels.some((label) => title === label || title.includes(label));
                    if (renderer.selected && isWanted && renderer.content) return renderer.content;
                    if (!matching && isWanted && renderer.content) matching = renderer.content;
                }
            }

            Object.values(item).forEach((value) => {
                if (value && typeof value === 'object') stacks.push(value);
            });
        }
        return matching;
    }

    function shortsRendererToVideo(renderer, sub) {
        if (!renderer || typeof renderer !== 'object') return null;
        const videoId = renderer.videoId ||
            renderer.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
            renderer.onTap?.innertubeCommand?.watchEndpoint?.videoId ||
            renderer.navigationEndpoint?.reelWatchEndpoint?.videoId ||
            renderer.navigationEndpoint?.watchEndpoint?.videoId ||
            findWatchEndpoint(renderer)?.videoId || '';
        if (!videoId) return null;

        const headline = runsText(renderer.headline) ||
            renderer.overlayMetadata?.primaryText?.content ||
            renderer.accessibilityText ||
            renderer.title?.content ||
            runsText(renderer.title) ||
            'Short';
        const viewText = runsText(renderer.viewCountText) ||
            renderer.overlayMetadata?.secondaryText?.content ||
            renderer.accessibilityText || '';
        const thumbnail = firstContentImageSource(renderer) ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return {
            videoId,
            title: headline,
            published: 0,
            thumbnail,
            channelName: sub.channelName || '',
            channelThumbnail: sub.thumbnail || null,
            channelUrl: channelUrlForSub(sub),
            views: parseViewsText(viewText),
            duration: 0,
            isLive: false,
            isShorts: true,
            _whenText: '',
            channelId: sub.id,
            url: `https://www.youtube.com/shorts/${videoId}`
        };
    }

    function collectShortsVideos(node, sub, out = []) {
        const stack = [node];
        const seen = new Set(out.map((video) => video?.videoId).filter(Boolean));
        while (stack.length && out.length < CHANNEL_BACKFILL_LIMIT * 2) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;
            const renderer = item.reelItemRenderer || item.shortsLockupViewModel ||
                item.richItemRenderer?.content?.reelItemRenderer ||
                item.richItemRenderer?.content?.shortsLockupViewModel;
            if (renderer) {
                const video = shortsRendererToVideo(renderer, sub);
                if (video && !seen.has(video.videoId)) {
                    seen.add(video.videoId);
                    out.push(video);
                }
            }
            Object.values(item).forEach((value) => {
                if (value && typeof value === 'object') stack.push(value);
            });
        }
        return out;
    }

    function continuationTokenFrom(node) {
        if (!node || typeof node !== 'object') return '';
        const token = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
        if (token) return token;
        for (const value of Object.values(node)) {
            const found = continuationTokenFrom(value);
            if (found) return found;
        }
        return '';
    }

    function clickTrackingParamsForContinuation(node, token) {
        if (!node || typeof node !== 'object' || !token) return '';
        const endpoint = node.continuationItemRenderer?.continuationEndpoint;
        const command = endpoint?.continuationCommand;
        if (command?.token === token) return endpoint.clickTrackingParams || '';
        for (const value of Object.values(node)) {
            const found = clickTrackingParamsForContinuation(value, token);
            if (found) return found;
        }
        return '';
    }

    function sliceBalancedJson(text, start) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
            } else if (ch === '"') {
                inString = true;
            } else if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0) return text.slice(start, i + 1);
            }
        }
        return '';
    }

    function extractInitialData(html) {
        let index = html.indexOf('ytInitialData');
        while (index !== -1) {
            const equals = html.indexOf('=', index);
            if (equals !== -1) {
                let start = equals + 1;
                while (start < html.length && html[start] !== '{' && html[start] !== '\n') start++;
                if (html[start] === '{') {
                    const json = sliceBalancedJson(html, start);
                    if (json) {
                        try { return JSON.parse(json); } catch (_) { /* try next */ }
                    }
                }
            }
            index = html.indexOf('ytInitialData', index + 13);
        }
        return null;
    }

    function extractInnertubeConfig(html) {
        const versionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) ||
            html.match(/"clientVersion":"([^"]+)"/);
        if (!versionMatch) return null;
        const visitorMatch = html.match(/"VISITOR_DATA":"([^"]+)"/) ||
            html.match(/"visitorData":"([^"]+)"/);
        const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
        return {
            clientVersion: decodeEmbeddedJsonString(versionMatch[1]),
            visitorData: visitorMatch ? decodeEmbeddedJsonString(visitorMatch[1]) : '',
            apiKey: keyMatch ? keyMatch[1] : ''
        };
    }

    function channelVideosUrl(sub, ucid) {
        let url = sub.url
            || (sub.handle ? `https://www.youtube.com/${sub.handle}` : '')
            || (ucid ? `https://www.youtube.com/channel/${ucid}` : '');
        if (!url) return '';
        if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        url = url.split('?')[0].replace(/\/$/, '');
        url = url.replace(/\/(featured|videos|shorts|streams|playlists|community|about)$/i, '');
        return `${url}/videos`;
    }

    async function fetchBrowseContinuationInBackground(token, config) {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return null;
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { type: 'fetchYouTubeBrowseContinuation', token, config },
                    (message) => {
                        if (chrome.runtime.lastError) {
                            resolve({ error: chrome.runtime.lastError.message });
                            return;
                        }
                        resolve(message || {});
                    }
                );
            });
            return response.data || null;
        } catch (_) {
            return null;
        }
    }


    async function fetchScrapedChannelVideosInBackground(url, limit = CHANNEL_BACKFILL_LIMIT) {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return [];
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { type: 'scrapeYouTubeChannelVideos', url, limit },
                    (message) => {
                        if (chrome.runtime.lastError) {
                            resolve({ error: chrome.runtime.lastError.message, items: [] });
                            return;
                        }
                        resolve(message || { items: [] });
                    }
                );
            });
            return Array.isArray(response.items) ? response.items : [];
        } catch (_) {
            return [];
        }
    }

    function scrapedChannelVideoToVideo(item, sub) {
        const videoId = String(item?.videoId || '').trim();
        if (!videoId) return null;
        const viewsText = String(item.viewsText || '');
        const publishedText = String(item.publishedText || '');
        return {
            videoId,
            title: String(item.title || 'Untitled'),
            published: parseRelativePublished(publishedText),
            thumbnail: String(item.thumbnail || '') || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            channelName: sub.channelName || '',
            channelThumbnail: sub.thumbnail || null,
            channelUrl: channelUrlForSub(sub),
            views: parseViewsText(viewsText),
            duration: parseDurationText(item.durationText || ''),
            _viewsText: viewsText,
            isLive: !!item.isLive,
            _memberBadgeText: '',
            _whenText: publishedText,
            channelId: sub.id,
            url: `https://www.youtube.com/watch?v=${videoId}`
        };
    }

    async function fetchBrowseContinuation(token, config, fetchFn) {
        if (!token || !config?.clientVersion) return null;

        // Match YouTube search paging: first ask the background bridge to make
        // the request from a real youtube.com tab. Firefox is much more reliable
        // there than when an extension page POSTs to youtubei directly.
        const backgroundPage = await fetchBrowseContinuationInBackground(token, config);
        if (backgroundPage) return backgroundPage;

        const key = config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : '';
        const headers = {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': config.clientVersion
        };
        if (config.visitorData) headers['X-Goog-Visitor-Id'] = config.visitorData;
        const context = {
            client: {
                clientName: 'WEB',
                clientVersion: config.clientVersion,
                visitorData: config.visitorData || '',
                hl: 'en',
                gl: 'US'
            }
        };
        if (config.clickTrackingParams) {
            context.clickTracking = { clickTrackingParams: String(config.clickTrackingParams) };
        }
        const body = JSON.stringify({ context, continuation: token });
        const endpoints = [
            `https://www.youtube.com/youtubei/v1/browse${key}`,
            `https://youtubei.googleapis.com/youtubei/v1/browse${key}`
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await fetchFn(endpoint, {
                    method: 'POST',
                    credentials: endpoint.includes('www.youtube.com') ? 'include' : 'omit',
                    headers,
                    body
                });
                if (response.ok) return response.json();
            } catch (_) { /* try the next endpoint */ }
        }
        return null;
    }


    async function fetchBrowseEndpoint(endpoint, config, fetchFn, fallbackBrowseId = '') {
        if (!config?.clientVersion || !endpoint) return null;
        const browse = endpoint.browseEndpoint || endpoint;
        const browseId = browse.browseId || fallbackBrowseId;
        const params = browse.params || '';
        if (!browseId || !params) return null;
        const key = config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : '';
        const response = await fetchFn(`https://www.youtube.com/youtubei/v1/browse${key}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-YouTube-Client-Name': '1',
                'X-YouTube-Client-Version': config.clientVersion
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: config.clientVersion,
                        visitorData: config.visitorData || '',
                        hl: 'en',
                        gl: 'US'
                    }
                },
                browseId,
                params
            })
        });
        if (!response.ok) return null;
        return response.json();
    }

    function channelSortLabel(value) {
        if (!value) return '';
        if (typeof value === 'string') return value.trim().toLowerCase();
        return String(
            value.simpleText ||
            value.content ||
            runsText(value) ||
            ''
        ).trim().toLowerCase();
    }

    function channelSortContinuationFrom(node) {
        if (!node || typeof node !== 'object') return '';
        return node.continuationCommand?.token ||
            node.reloadContinuationData?.continuation ||
            node.nextContinuationData?.continuation ||
            node.continuation?.reloadContinuationData?.continuation ||
            node.continuation?.nextContinuationData?.continuation ||
            '';
    }

    function channelSortEndpointDetails(node) {
        if (!node || typeof node !== 'object') return null;

        const candidates = [
            node.navigationEndpoint,
            node.serviceEndpoint,
            node.endpoint,
            node.onTap,
            node.onTap?.innertubeCommand,
            node.onTap?.command,
            node.tapCommand,
            node.tapCommand?.innertubeCommand,
            node.tapCommand?.command,
            node.commandContext?.onTap,
            node.commandContext?.onTap?.innertubeCommand,
            node.rendererContext?.commandContext?.onTap,
            node.rendererContext?.commandContext?.onTap?.innertubeCommand,
            node.rendererContext?.commandContext?.onTap?.command,
            node.command,
            node
        ].filter(Boolean);

        for (const endpoint of candidates) {
            const browseEndpoint = endpoint?.browseEndpoint ||
                endpoint?.command?.browseEndpoint ||
                endpoint?.innertubeCommand?.browseEndpoint ||
                null;
            const url = endpoint?.commandMetadata?.webCommandMetadata?.url ||
                endpoint?.command?.commandMetadata?.webCommandMetadata?.url ||
                endpoint?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url ||
                '';
            const continuationToken = channelSortContinuationFrom(endpoint) ||
                channelSortContinuationFrom(endpoint?.command) ||
                channelSortContinuationFrom(endpoint?.innertubeCommand) ||
                channelSortContinuationFrom(node);

            if (browseEndpoint || url || continuationToken) {
                return { browseEndpoint, url, continuationToken };
            }
        }

        // Some newer command containers wrap the actual endpoint in an array.
        const commands = node.commandExecutorCommand?.commands ||
            node.signalServiceEndpoint?.actions ||
            node.commands ||
            [];
        if (Array.isArray(commands)) {
            for (const command of commands) {
                const found = channelSortEndpointDetails(command);
                if (found) return found;
            }
        }
        return null;
    }

    function channelSortEndpointFrom(node, sort) {
        const wanted = String(sort || '').toLowerCase();
        if (!node) return null;

        const aliases = wanted === 'latest'
            ? [
                'latest', 'newest', 'newest first', 'latest videos',
                'recent', 'recently uploaded', 'newest to oldest'
            ]
            : wanted === 'popular'
                ? ['popular', 'most popular', 'popular videos']
                : [
                    'oldest', 'oldest first', 'oldest videos',
                    'date added (oldest)', 'date created (oldest)',
                    'oldest to newest'
                ];
        const matches = (label) => {
            const normalized = channelSortLabel(label);
            return aliases.some((alias) => normalized === alias || normalized.includes(alias));
        };

        const stack = [node];
        while (stack.length) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;

            // YouTube often exposes channel sorting through a submenu instead
            // of chipCloudChipRenderer. Inspect each submenu item directly.
            const submenu = item.sortFilterSubMenuRenderer;
            if (Array.isArray(submenu?.subMenuItems)) {
                for (const option of submenu.subMenuItems) {
                    if (!matches(option?.title || option?.label || option?.text)) continue;
                    const endpoint = channelSortEndpointDetails(option);
                    if (endpoint) return endpoint;
                }
            }

            const chip = item.chipCloudChipRenderer || item.chipCloudChipViewModel;
            if (chip && matches(chip.text || chip.title || chip.label)) {
                const endpoint = channelSortEndpointDetails(chip);
                if (endpoint) return endpoint;
            }

            // Newer channel pages use ChipView models. The first chip can
            // be a dropdown whose ShowSheetCommand contains ListItemView models
            // for Latest / Popular / Oldest.
            const filterChip = item.filterChipBarItemRenderer || item.chipViewModel;
            if (filterChip && matches(filterChip.text || filterChip.title || filterChip.label)) {
                const endpoint = channelSortEndpointDetails(filterChip);
                if (endpoint) return endpoint;
                const selected = Boolean(
                    filterChip.isSelected || filterChip.selected ||
                    filterChip.state === 'CHIP_VIEW_MODEL_STATE_SELECTED' ||
                    filterChip.state === 'CHIP_CLOUD_CHIP_STATE_SELECTED'
                );
                if (selected) return { useCurrent: true };
            }

            const listItem = item.listItemViewModel || item.listItemViewRenderer;
            if (listItem && matches(listItem.title || listItem.text || listItem.label)) {
                const endpoint = channelSortEndpointDetails(listItem);
                if (endpoint) return endpoint;
                if (listItem.isSelected || listItem.selected) return { useCurrent: true };
            }

            Object.values(item).forEach((value) => {
                if (value && typeof value === 'object') stack.push(value);
            });
        }
        return null;
    }


    function channelSortTextDeep(node) {
        if (node == null) return '';
        if (typeof node === 'string') return node.trim().toLowerCase();
        if (typeof node !== 'object') return '';

        const direct = [
            node.simpleText,
            node.content,
            node.label,
            node.title,
            node.text,
            node.accessibilityData?.label,
            node.accessibility?.accessibilityData?.label
        ];
        for (const value of direct) {
            const label = channelSortLabel(value);
            if (label) return label;
        }

        if (Array.isArray(node.runs)) {
            const label = node.runs.map((run) => run?.text || '').join('').trim().toLowerCase();
            if (label) return label;
        }

        return '';
    }

    function findFeedFilterChipBar(node) {
        if (!node || typeof node !== 'object') return null;
        const stack = [node];
        while (stack.length) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;

            const bar = item.feedFilterChipBarRenderer ||
                item.feedFilterChipBarViewModel ||
                item.chipBarViewModel ||
                item.richGridRenderer?.header?.chipBarViewModel;
            if (bar && (Array.isArray(bar.contents) || Array.isArray(bar.chips))) return bar;

            Object.values(item).forEach((value) => {
                if (value && typeof value === 'object') stack.push(value);
            });
        }
        return null;
    }

    function channelVideoSortEndpointFromSelectedTab(data, sort) {
        const wanted = String(sort || 'latest').toLowerCase();
        const selectedVideos = selectedChannelTabContent(data, 'videos');
        if (!selectedVideos) return null;

        const bar = findFeedFilterChipBar(selectedVideos);
        const entries = bar && (Array.isArray(bar.contents) ? bar.contents : bar.chips);
        if (!Array.isArray(entries)) return null;

        const wantedAliases = wanted === 'latest'
            ? ['latest', 'newest', 'recent']
            : wanted === 'popular'
                ? ['popular', 'most popular']
                : ['oldest', 'oldest first'];

        const chips = [];
        for (const entry of entries) {
            const chip = entry?.chipCloudChipRenderer ||
                entry?.chipCloudChipViewModel ||
                entry?.chipViewModel ||
                entry?.filterChipBarItemRenderer ||
                entry;
            if (!chip || typeof chip !== 'object') continue;

            const labelCandidates = [
                chip.text,
                chip.title,
                chip.label,
                chip.accessibilityData,
                chip.accessibility,
                chip
            ];
            let label = '';
            for (const candidate of labelCandidates) {
                label = channelSortTextDeep(candidate);
                if (label) break;
            }

            chips.push({
                chip,
                label,
                selected: Boolean(
                    chip.isSelected ||
                    chip.selected ||
                    chip.state === 'CHIP_CLOUD_CHIP_STATE_SELECTED' ||
                    chip.state === 'CHIP_VIEW_MODEL_STATE_SELECTED'
                ),
                endpoint: channelSortEndpointDetails(chip)
            });
        }

        // Prefer the explicit label from the actual Videos-tab chip bar.
        const byLabel = chips.find(({ label }) =>
            wantedAliases.some((alias) => label === alias || label.includes(alias)));
        if (byLabel) {
            // The selected Latest chip can legitimately have no endpoint.
            if (byLabel.selected && !byLabel.endpoint) return { useCurrent: true };
            if (byLabel.endpoint) return byLabel.endpoint;
        }

        // Do not guess by chip position. Newer channel pages mix sort and
        // secondary filter chips, so an index-based fallback can silently load
        // the wrong feed.
        return channelSortEndpointFrom(selectedVideos, wanted);
    }


    function channelBaseUrl(sub, ucid) {
        let url = sub.url
            || (sub.handle ? `https://www.youtube.com/${sub.handle}` : '')
            || (ucid ? `https://www.youtube.com/channel/${ucid}` : '');
        if (!url) return '';
        if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        url = url.split('?')[0].replace(/\/$/, '');
        return url.replace(/\/(featured|videos|shorts|streams|live|playlists|posts|community|about)$/i, '');
    }

    function channelTabUrl(sub, ucid, tab) {
        const base = channelBaseUrl(sub, ucid);
        if (!base) return '';
        const suffix = {
            videos: 'videos',
            shorts: 'shorts',
            live: 'streams',
            playlists: 'playlists',
            posts: 'posts'
        }[tab] || 'videos';
        return `${base}/${suffix}`;
    }

    function playlistIdFromNode(node) {
        if (!node || typeof node !== 'object') return '';

        const direct = node.playlistId || node.watchEndpoint?.playlistId ||
            node.navigationEndpoint?.watchEndpoint?.playlistId ||
            node.onTap?.innertubeCommand?.watchEndpoint?.playlistId ||
            node.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.playlistId || '';
        if (direct) return String(direct).replace(/^VL(?=PL|UU|OLAK5uy_|RD|FL)/, '');

        const browseId = node.browseEndpoint?.browseId ||
            node.navigationEndpoint?.browseEndpoint?.browseId ||
            node.onTap?.innertubeCommand?.browseEndpoint?.browseId ||
            node.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId || '';
        if (browseId && /^VL/.test(browseId)) return String(browseId).slice(2);

        const url = node.commandMetadata?.webCommandMetadata?.url ||
            node.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ||
            node.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url ||
            node.rendererContext?.commandContext?.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url || '';
        if (url) {
            const match = String(url).match(/[?&]list=([^&#]+)/);
            if (match) {
                try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
            }
        }
        return '';
    }

    function playlistCountText(renderer) {
        const direct = runsText(renderer?.videoCountText) || runsText(renderer?.videoCountShortText) || '';
        if (direct) return direct;
        const parts = collectMetadataText(renderer);
        return parts.find((part) => /\b\d[\d,.]*\s+videos?\b/i.test(part)) ||
            parts.find((part) => /\bvideos?\b/i.test(part)) || '';
    }

    function collectPlaylistItems(node, sub, out = []) {
        const stack = [node];
        const seen = new Set(out.map((item) => item?.playlistId).filter(Boolean));
        while (stack.length && out.length < CHANNEL_BACKFILL_LIMIT * 2) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;

            const renderer = item.gridPlaylistRenderer || item.playlistRenderer ||
                item.richItemRenderer?.content?.gridPlaylistRenderer ||
                item.richItemRenderer?.content?.playlistRenderer;
            if (renderer) {
                const playlistId = playlistIdFromNode(renderer);
                if (playlistId && !seen.has(playlistId)) {
                    seen.add(playlistId);
                    out.push({
                        _type: 'playlist',
                        playlistId,
                        title: runsText(renderer.title) || renderer.title?.simpleText || 'Playlist',
                        thumbnail: firstContentImageSource(renderer),
                        countText: playlistCountText(renderer),
                        url: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
                        channelName: sub.channelName || ''
                    });
                }
            }

            const lockup = item.lockupViewModel || item.richItemRenderer?.content?.lockupViewModel;
            if (lockup) {
                const contentType = String(lockup.contentType || '').toUpperCase();
                const playlistId = playlistIdFromNode(lockup) ||
                    (contentType.includes('PLAYLIST') ? String(lockup.contentId || '').replace(/^VL/, '') : '');
                if (playlistId && !seen.has(playlistId)) {
                    seen.add(playlistId);
                    const title = lockup?.metadata?.lockupMetadataViewModel?.title?.content ||
                        lockup?.metadata?.lockupMetadataViewModel?.title?.text ||
                        runsText(lockup?.metadata?.lockupMetadataViewModel?.title) ||
                        'Playlist';
                    out.push({
                        _type: 'playlist',
                        playlistId,
                        title,
                        thumbnail: firstContentImageSource(lockup),
                        countText: playlistCountText(lockup),
                        url: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
                        channelName: sub.channelName || ''
                    });
                }
            }

            Object.values(item).forEach((value) => {
                if (value && typeof value === 'object') stack.push(value);
            });
        }
        return out;
    }

    function postImageSource(renderer) {
        const candidates = [
            renderer?.backstageAttachment?.backstageImageRenderer?.image,
            renderer?.backstageAttachment?.postMultiImageRenderer?.images?.[0]?.backstageImageRenderer?.image,
            renderer?.attachment?.backstageImageRenderer?.image
        ];
        for (const image of candidates) {
            const thumbs = image?.thumbnails;
            if (Array.isArray(thumbs) && thumbs.length) return thumbs[thumbs.length - 1]?.url || '';
        }
        return '';
    }

    function collectPostItems(node, sub, out = []) {
        const stack = [node];
        const seen = new Set();
        while (stack.length && out.length < CHANNEL_BACKFILL_LIMIT * 2) {
            const item = stack.pop();
            if (!item || typeof item !== 'object') continue;
            const renderer = item.backstagePostRenderer || item.postRenderer ||
                item.backstagePostThreadRenderer?.post?.backstagePostRenderer;
            if (renderer) {
                const postId = renderer.postId || renderer.postIdText ||
                    renderer.publishedTimeText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
                    `post-${out.length}`;
                if (!seen.has(postId)) {
                    seen.add(postId);
                    const navUrl = renderer.publishedTimeText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
                    out.push({
                        _type: 'post',
                        postId,
                        text: runsText(renderer.contentText) || runsText(renderer.postText) || '',
                        publishedText: runsText(renderer.publishedTimeText) || '',
                        likesText: runsText(renderer.voteCount) || '',
                        image: postImageSource(renderer),
                        url: navUrl ? `https://www.youtube.com${navUrl}` : (sub.url || ''),
                        channelName: sub.channelName || ''
                    });
                }
            }
            Object.values(item).forEach((value) => {
                if (value && typeof value === 'object') stack.push(value);
            });
        }
        return out;
    }

    function parseChannelTabPage(data, sub, tab, initial = false) {
        // The first HTML response contains every channel-tab shell. Continuation
        // responses contain only the requested tab's next batch.
        let scope = data;
        if (initial) {
            const selected = selectedChannelTabContent(data, tab);
            if (!selected && tab !== 'videos' && tab !== 'playlists') return [];
            if (selected) scope = selected;
        }
        if (tab === 'playlists') {
            const selectedItems = collectPlaylistItems(scope, sub, []);
            if (selectedItems.length || !initial || scope === data) return selectedItems;
            return collectPlaylistItems(data, sub, []);
        }
        if (tab === 'posts') return collectPostItems(scope, sub, []);
        if (tab === 'shorts') return collectShortsVideos(scope, sub, []);
        if (tab === 'videos') {
            const selectedItems = collectUploadVideos(scope, sub, []);
            if (selectedItems.length || !initial || scope === data) return selectedItems;
            return collectUploadVideos(data, sub, []);
        }
        return collectUploadVideos(scope, sub, []);
    }

    async function fetchChannelTabContinuation(sub, tab, token, config, options = {}) {
        const fetchFn = options.fetchFn || fetch.bind(globalThis);
        if (!token || !config?.clientVersion) {
            return { items: [], continuation: '', config: config || null, error: 'channel-continuation-unavailable' };
        }

        try {
            const page = await fetchBrowseContinuation(token, config, fetchFn);
            if (!page) {
                return { items: [], continuation: '', config, error: 'channel-continuation-failed' };
            }

            const items = parseChannelTabPage(page, sub, tab, false);
            const nextToken = continuationTokenFrom(page);
            const pageVisitorData =
                page?.responseContext?.visitorData ||
                page?.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData ||
                '';
            const nextConfig = { ...config };
            if (pageVisitorData) nextConfig.visitorData = pageVisitorData;
            const clickTrackingParams = clickTrackingParamsForContinuation(page, nextToken);
            if (clickTrackingParams) nextConfig.clickTrackingParams = clickTrackingParams;

            return {
                items,
                continuation: nextToken && nextToken !== token ? nextToken : '',
                config: nextConfig,
                clickTrackingParams,
                error: null
            };
        } catch (error) {
            return {
                items: [],
                continuation: '',
                config,
                error: 'channel-continuation:' + (error.message || 'failed')
            };
        }
    }

    async function fetchChannelTab(sub, ucid, tab = 'videos', options = {}) {
        const fetchFn = options.fetchFn || fetch.bind(globalThis);
        const url = channelTabUrl(sub, ucid, tab);
        if (!url) return { items: [], error: 'no-channel-tab-url' };
        const requestedSort = tab === 'videos' ? String(options.sort || 'latest').toLowerCase() : 'latest';
        const items = [];
        const seen = new Set();
        let continuation = '';
        let config = null;

        const parsePage = (data, initial = false) => parseChannelTabPage(data, sub, tab, initial);
        const keyOf = (item) => item?.videoId || item?.playlistId || item?.postId || item?.url || '';
        const addItems = (pageItems) => {
            pageItems.forEach((item) => {
                const key = keyOf(item);
                if (!key || seen.has(key)) return;
                seen.add(key);
                items.push(item);
            });
        };

        try {
            if (typeof options.ensureConsentCookie === 'function') await options.ensureConsentCookie();
            let response = await fetchFn(url, { credentials: 'include' });
            // Older YouTube layouts may still expose community posts at /community.
            if (!response.ok && tab === 'posts') {
                response = await fetchFn(url.replace(/\/posts$/, '/community'), { credentials: 'include' });
            }
            if (!response.ok) return { items, error: 'channel-tab-http-' + response.status };
            let html = await response.text();
            let data = extractInitialData(html);
            config = extractInnertubeConfig(html);
            if (!data) return { items, error: 'channel-tab-parse' };

            // The plain /videos page is YouTube's real Latest feed. For
            // Popular / Oldest, invoke the sort control from that exact Videos
            // tab. Current YouTube layouts can expose those controls either as
            // ChipCloudChip nodes or as a ChipView dropdown containing
            // ListItemView entries.
            if (tab === 'videos' && requestedSort !== 'latest') {
                const videosScope = selectedChannelTabContent(data, 'videos') || data;
                const requestedSortEndpoint = channelVideoSortEndpointFromSelectedTab(data, requestedSort)
                    || channelSortEndpointFrom(videosScope, requestedSort);
                let sortedData = null;

                if (requestedSortEndpoint?.useCurrent) {
                    sortedData = data;
                }
                if (!sortedData && requestedSortEndpoint?.continuationToken) {
                    sortedData = await fetchBrowseContinuation(requestedSortEndpoint.continuationToken, config, fetchFn);
                }
                if (!sortedData && requestedSortEndpoint?.browseEndpoint) {
                    sortedData = await fetchBrowseEndpoint(requestedSortEndpoint.browseEndpoint, config, fetchFn, ucid);
                }
                if (!sortedData && requestedSortEndpoint?.url) {
                    const sortedUrl = requestedSortEndpoint.url.startsWith('http')
                        ? requestedSortEndpoint.url
                        : `https://www.youtube.com${requestedSortEndpoint.url}`;
                    const sortedResponse = await fetchFn(sortedUrl, { credentials: 'include' });
                    if (sortedResponse.ok) {
                        const sortedHtml = await sortedResponse.text();
                        sortedData = extractInitialData(sortedHtml);
                        config = extractInnertubeConfig(sortedHtml) || config;
                    }
                }

                // Compatibility fallback for older channel layouts. This is a
                // YouTube-side sort request, not a client-side approximation.
                if (!sortedData) {
                    const legacySort = requestedSort === 'popular' ? 'p' : 'da';
                    const legacyUrl = `${url}?view=0&sort=${legacySort}&flow=grid`;
                    const legacyResponse = await fetchFn(legacyUrl, { credentials: 'include' });
                    if (legacyResponse.ok) {
                        const legacyHtml = await legacyResponse.text();
                        sortedData = extractInitialData(legacyHtml);
                        config = extractInnertubeConfig(legacyHtml) || config;
                    }
                }

                if (!sortedData) return { items, error: `channel-sort-${requestedSort}-unavailable` };
                data = sortedData;
            }

            const initialScope = selectedChannelTabContent(data, tab) || data;
            addItems(parsePage(data, true));

            // Keep the continuation state instead of eagerly downloading every
            // page. The channel view now pages exactly like YouTube search: it
            // renders the first batch, observes a sentinel, then requests one
            // continuation batch as the user scrolls.
            continuation = continuationTokenFrom(initialScope) || continuationTokenFrom(data);
            const clickTrackingParams = clickTrackingParamsForContinuation(initialScope, continuation) ||
                clickTrackingParamsForContinuation(data, continuation);
            if (clickTrackingParams && config) config.clickTrackingParams = clickTrackingParams;

            return {
                items: items.slice(0, CHANNEL_BACKFILL_LIMIT),
                continuation,
                config,
                clickTrackingParams,
                error: null
            };
        } catch (error) {
            return { items, error: 'channel-tab:' + (error.message || 'failed') };
        }
    }

    async function fetchChannelBackfill(sub, ucid, existingIds, options = {}) {
        const fetchFn = options.fetchFn || fetch.bind(globalThis);
        const url = channelVideosUrl(sub, ucid);
        if (!url) return { videos: [], error: 'no-videos-url' };
        const cutoff = Date.now() - CHANNEL_BACKFILL_MAX_AGE_DAYS * 86400000;
        const videos = [];
        const metadataById = {};
        let continuation = '';
        let config = null;

        const addVideos = (items) => {
            items.forEach((video) => {
                if (!video || !video.videoId) return;
                if (existingIds.has(video.videoId)) {
                    if (video._memberBadgeText) {
                        metadataById[video.videoId] = {
                            ...(metadataById[video.videoId] || {}),
                            _memberBadgeText: video._memberBadgeText
                        };
                    }
                    return;
                }
                if (!video.published || video.published < cutoff) return;
                const isBackfillMemberVideo = !!video._memberBadgeText;
                existingIds.add(video.videoId);
                videos.push(isBackfillMemberVideo
                    ? { ...video, _publishedUnreliable: true }
                    : video);
            });
        };

        try {
            if (typeof options.ensureConsentCookie === 'function') {
                await options.ensureConsentCookie();
            }
            const response = await fetchFn(url, { credentials: 'include' });
            if (!response.ok) return { videos, metadataById, error: 'backfill-http-' + response.status };
            const html = await response.text();
            const data = extractInitialData(html);
            config = extractInnertubeConfig(html);
            if (!data) return { videos, metadataById, error: 'backfill-parse' };

            let pageVideos = collectUploadVideos(data, sub, []);
            addVideos(pageVideos);
            continuation = continuationTokenFrom(data);
            let pages = 1;

            while (continuation && config && videos.length < CHANNEL_BACKFILL_LIMIT && pages < CHANNEL_BACKFILL_MAX_PAGES) {
                const page = await fetchBrowseContinuation(continuation, config, fetchFn);
                if (!page) break;
                pageVideos = collectUploadVideos(page, sub, []);
                if (!pageVideos.length) break;
                addVideos(pageVideos);
                const hasRecent = pageVideos.some((video) => !video.published || video.published >= cutoff);
                continuation = hasRecent ? continuationTokenFrom(page) : '';
                pages++;
            }
            return { videos: newestFirstVideos(videos).slice(0, CHANNEL_BACKFILL_LIMIT), metadataById, error: null };
        } catch (error) {
            return { videos, metadataById, error: 'backfill:' + (error.message || 'failed') };
        }
    }

    globalThis.ytvhtFeedCore = {
        FEED_CACHE_POLICY,
        selectFeedVideos,
        fetchChannelBackfill,
        fetchChannelTab,
        fetchChannelTabContinuation,
        collectUploadVideos,
        extractInitialData,
        continuationTokenFrom
    };
})();
