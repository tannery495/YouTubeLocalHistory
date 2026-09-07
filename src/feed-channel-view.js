// ----- in-extension channel page -----------------------------------------
let activeChannelInfo = null;
let channelPageRenderToken = 0;
let activeChannelTab = 'videos';
let channelTabItems = [];
let channelVisibleLimit = 20;
const channelVideoSort = 'latest';
let channelSortLoading = false;
let channelLoadObserver = null;
let channelContinuation = '';
let channelContinuationConfig = null;
let channelLoadingMore = false;
let channelPagingError = '';
const channelTabCache = new Map();
const channelSubscriberTextCache = new Map();

function channelIdentity(info) {
    const ids = [info && info.channelId, info && info.ucid, info && info.handle]
        .filter(Boolean)
        .map((id) => String(id).toLowerCase());
    const name = channelKey(info && info.channelName);
    return { ids, name };
}

function channelPageKey(info) {
    const identity = channelIdentity(info);
    return identity.ids[0] || identity.name || 'channel';
}

function videoMatchesChannelInfo(video, info) {
    const target = channelIdentity(info);
    const sourceIds = [video && video.channelId, video && video.ucid, video && video.handle]
        .filter(Boolean)
        .map((id) => String(id).toLowerCase());
    if (target.ids.some((id) => sourceIds.includes(id))) return true;
    const url = video && video.channelUrl;
    if (url && target.ids.some((id) => String(url).toLowerCase().includes(id))) return true;
    return target.name && channelKey(video && video.channelName) === target.name;
}

function bestChannelInfoFromVideo(video) {
    const info = channelInfoFromVideo(video) || {};
    const ucid = info.ucid || video.ucid ||
        (/^UC[\w-]+$/.test(String(video.channelId || '')) ? video.channelId : null);
    const handle = info.handle || video.handle ||
        (/^@[\w.\-]+$/.test(String(video.channelId || '')) ? video.channelId : null);
    const channelUrl = info.url || video.channelUrl ||
        (handle ? `https://www.youtube.com/${handle}` : '') ||
        (ucid ? `https://www.youtube.com/channel/${ucid}` : '');

    return {
        channelId: info.channelId || video.channelId || ucid || handle || channelKey(video.channelName),
        ucid,
        handle,
        channelName: video.channelName || info.channelName || 'Unknown channel',
        thumbnail: video.channelThumbnail || info.thumbnail || null,
        subsText: video.subsText || info.subsText || '',
        // Never use video.url here. A watch URL followed by /videos produces an
        // invalid channel request such as /watch?v=.../videos.
        url: channelUrl
    };
}

function normalizeSubscriberText(value) {
    const text = String(value || '')
        .replace(/\\u00a0|\\u202f/gi, ' ')
        .replace(/[\u00a0\u202f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text || text.startsWith('@')) return '';

    const unitAliases = {
        k: 'K',
        thousand: 'K',
        duizend: 'K',
        tausend: 'K',
        mil: 'K',
        m: 'M',
        million: 'M',
        millions: 'M',
        miljoen: 'M',
        mln: 'M',
        mio: 'M',
        b: 'B',
        billion: 'B',
        billions: 'B',
        miljard: 'B',
        mld: 'B',
        milliarde: 'B',
        t: 'T',
        trillion: 'T',
        trillions: 'T'
    };

    // YouTube localizes the subscriber label. The field is still semantically
    // a subscriber count, so accept the common localized labels we encounter.
    const subscriberLabel =
        /(?:subscribers?|abonnees?|abonnenten|suscriptores|suscripteurs|abonnés|iscritti|inscritos)/i;

    if (!subscriberLabel.test(text) &&
        !/^\s*\d[\d.,]*\s*(?:K|M|B|T|thousand|duizend|tausend|mil|million|millions|miljoen|mln\.?|mio\.?|billion|billions|miljard|mld\.?|milliarde|trillion|trillions)\s*$/i.test(text)) {
        return '';
    }

    const match = text.match(
        /(\d[\d.,]*)\s*(K|M|B|T|thousand|duizend|tausend|mil|million|millions|miljoen|mln\.?|mio\.?|billion|billions|miljard|mld\.?|milliarde|trillion|trillions)?/i
    );
    if (!match) return '';

    let number = match[1];
    const rawUnit = String(match[2] || '').replace(/\.$/, '');
    const unit = unitAliases[rawUnit.toLowerCase()] || rawUnit.toUpperCase();

    // YouTube uses decimal commas in locales such as nl-NL.
    if (unit && number.includes(',') && !number.includes('.')) {
        number = number.replace(',', '.');
    }

    return `${number}${unit} subscribers`;
}

function compactSubscriberCountText(value) {
    const normalized = normalizeSubscriberText(value);
    if (!normalized) return '';

    const match = normalized.match(/([\d.,]+)\s*(K|M|B|T|thousand|million|billion|trillion)?\s+subscribers?/i);
    if (!match) return normalized;

    const unitMap = {
        thousand: 'K',
        million: 'M',
        billion: 'B',
        trillion: 'T'
    };
    const unitRaw = String(match[2] || '');
    const unit = unitMap[unitRaw.toLowerCase()] || unitRaw.toUpperCase();
    return `${match[1]}${unit} subscribers`;
}

function normalizeChannelInfo(info) {
    return {
        channelId: info.channelId || info.ucid || info.handle || channelKey(info.channelName),
        ucid: info.ucid || null,
        handle: info.handle || null,
        channelName: info.channelName || 'Unknown channel',
        thumbnail: info.thumbnail || info.channelThumbnail || null,
        subsText: normalizeSubscriberText(info.subsText || info.subscriberCountText || ''),
        url: info.url || ''
    };
}

function decodeYouTubeJsonText(value) {
    try { return JSON.parse(`"${value}"`); } catch (_) { return String(value || ''); }
}

function subscriberTextFromChannelHtml(html) {
    const source = String(html || '');

    // Older/current renderer shapes.
    const keyedPatterns = [
        /"subscriberCountText"\s*:\s*\{[\s\S]{0,1200}?"simpleText"\s*:\s*"((?:\\.|[^"\\])*)"/,
        /"subscriberCountText"\s*:\s*\{[\s\S]{0,1200}?"text"\s*:\s*"((?:\\.|[^"\\])*)"/,
        /"subscriberCount"\s*:\s*\{[\s\S]{0,1200}?"content"\s*:\s*"((?:\\.|[^"\\])*)"/
    ];
    for (const pattern of keyedPatterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const normalized = normalizeSubscriberText(decodeYouTubeJsonText(match[1]));
        if (normalized) return normalized;
    }

    // Newer pageHeaderViewModel layouts often store the subscriber count as a
    // normal metadata string instead of subscriberCountText. Scan ytInitialData
    // strings first so we do not depend on a single renderer shape.
    try {
        const data = typeof extractInitialData === 'function' ? extractInitialData(source) : null;
        if (data) {
            const stack = [data];
            while (stack.length) {
                const value = stack.pop();
                if (typeof value === 'string') {
                    const normalized = normalizeSubscriberText(value);
                    if (normalized) return normalized;
                    continue;
                }
                if (!value || typeof value !== 'object') continue;
                if (Array.isArray(value)) stack.push(...value);
                else stack.push(...Object.values(value));
            }
        }
    } catch (_) { /* fall through to raw HTML scan */ }

    // Final fallback for labels embedded directly in the HTML/JSON. This also
    // catches accessibility labels such as "16.4 million subscribers".
    const decodedSource = source
        .replace(/\\u00a0|\\u202f/gi, ' ')
        .replace(/[\u00a0\u202f]/g, ' ');
    const rawCandidates = decodedSource.match(
        /\d[\d.,]*\s*(?:K|M|B|T|thousand|duizend|tausend|mil|million|millions|miljoen|mln\.?|mio\.?|billion|billions|miljard|mld\.?|milliarde|trillion|trillions)?\s*(?:subscribers?|abonnees?|abonnenten|suscriptores|suscripteurs|abonnés|iscritti|inscritos)/gi
    ) || [];
    for (const candidate of rawCandidates) {
        const normalized = normalizeSubscriberText(candidate);
        if (normalized) return normalized;
    }
    return '';
}

async function resolveChannelSubscriberText(info) {
    const existing = normalizeSubscriberText(info?.subsText || info?.subscriberCountText || '');
    if (existing) return existing;

    const url = info?.url || (info?.handle ? `https://www.youtube.com/${info.handle}` : '') ||
        (info?.ucid ? `https://www.youtube.com/channel/${info.ucid}` : '');
    if (!url) return '';

    const cacheKey = String(
        info?.ucid || info?.channelId || info?.handle || url
    ).toLowerCase();

    if (channelSubscriberTextCache.has(cacheKey)) {
        return channelSubscriberTextCache.get(cacheKey);
    }

    const request = (async () => {
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (response.ok) {
                const direct = normalizeSubscriberText(subscriberTextFromChannelHtml(await response.text()));
                if (direct) return direct;
            }
        } catch (_) { /* use search fallback below */ }

        // YouTube moves subscriber metadata between renderer shapes frequently.
        // If the channel page does not expose it, reuse the normal search parser
        // and match the channel result by UCID/handle/name.
        try {
            if (typeof searchYouTube === 'function' && info?.channelName) {
                const page = await searchYouTube(info.channelName);
                const wantedId = String(info.ucid || info.channelId || '').toLowerCase();
                const wantedHandle = String(info.handle || '').toLowerCase();
                const wantedName = channelKey(info.channelName);
                const match = (page?.results || []).find((item) => {
                    if (item?._type !== 'channel') return false;
                    if (wantedId && String(item.ucid || item.channelId || '').toLowerCase() === wantedId) return true;
                    if (wantedHandle && String(item.handle || '').toLowerCase() === wantedHandle) return true;
                    return wantedName && channelKey(item.channelName) === wantedName;
                });
                const fallback = normalizeSubscriberText(match?.subsText || '');
                if (fallback) return fallback;
            }
        } catch (_) { /* no subscriber count available */ }
        return '';
    })();

    channelSubscriberTextCache.set(cacheKey, request);
    const result = await request;

    // Keep successful values cached permanently. Failed requests can retry later.
    if (result) channelSubscriberTextCache.set(cacheKey, Promise.resolve(result));
    else channelSubscriberTextCache.delete(cacheKey);

    return result;
}

function renderChannelMeta(meta, info) {
    meta.textContent = '';

    const subs = document.createElement('div');
    subs.className = 'channel-view-subs';

    const subscriberCount = compactSubscriberCountText(info.subsText);
    if (subscriberCount) {
        subs.textContent = subscriberCount;
    } else if (info._subscriberResolved) {
        subs.classList.add('subscriber-empty');
    } else {
        subs.classList.add('subscriber-loading');
    }

    meta.appendChild(subs);
}

function collectCachedChannelVideos(info) {
    const byId = new Map();
    const sources = []
        .concat(youtubeSearchResults || [])
        .concat(buildLocalIndex());
    sources.forEach((video) => {
        if (!video || video._type === 'channel' || !videoMatchesChannelInfo(video, info)) return;
        const key = video.videoId || `${channelKey(video.channelName)}:${normalizeText(video.title)}`;
        if (!key || byId.has(key)) return;
        applyLocalChannelArtwork(video);
        byId.set(key, video);
    });
    return Array.from(byId.values()).sort((a, b) => {
        const ageA = relativeAgeDays(a._whenText);
        const ageB = relativeAgeDays(b._whenText);
        const timeA = Number(a.published || 0) || (ageA == null ? 0 : Date.now() - ageA * 86400000);
        const timeB = Number(b.published || 0) || (ageB == null ? 0 : Date.now() - ageB * 86400000);
        return timeB - timeA;
    });
}

async function resolveChannelPageUcid(info) {
    const direct = [info?.ucid, info?.channelId]
        .find((value) => /^UC[\w-]+$/.test(String(value || '')));
    if (direct) return direct;

    const url = info?.url
        || (info?.handle ? `https://www.youtube.com/${info.handle}` : '');
    if (url) {
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (response.ok) {
                const ucid = extractOwnUcid(await response.text());
                if (ucid) {
                    info.ucid = ucid;
                    if (!/^UC[\w-]+$/.test(String(info.channelId || ''))) info.channelId = ucid;
                    return ucid;
                }
            }
        } catch (_) { /* use search fallback below */ }
    }

    // Older locally stored videos can have only a channel name and no channel
    // URL/UCID. Resolve the channel through the normal YouTube search parser so
    // opening those creators does not leave the Videos tab empty.
    try {
        if (typeof searchYouTube === 'function' && info?.channelName) {
            const page = await searchYouTube(info.channelName);
            const wantedName = channelKey(info.channelName);
            const wantedHandle = String(info.handle || '').toLowerCase();
            const match = (page?.results || []).find((item) => {
                if (item?._type !== 'channel') return false;
                if (wantedHandle && String(item.handle || '').toLowerCase() === wantedHandle) return true;
                return wantedName && channelKey(item.channelName) === wantedName;
            });
            const ucid = match?.ucid || match?.channelId || '';
            if (/^UC[\w-]+$/.test(String(ucid))) {
                info.ucid = ucid;
                info.channelId = ucid;
                if (!info.handle && match.handle) info.handle = match.handle;
                if (!info.url && match.url) info.url = match.url;
                if (!info.thumbnail && match.thumbnail) info.thumbnail = match.thumbnail;
                return ucid;
            }
        }
    } catch (_) { /* no channel id available */ }
    return null;
}

async function fetchYouTubeChannelTab(info, tab, sort = 'latest') {
    const core = globalThis.ytvhtFeedCore;
    const ucid = await resolveChannelPageUcid(info);
    if (!ucid) return { items: [], error: 'channel-id-unavailable' };

    const source = {
        id: ucid,
        ucid,
        handle: info.handle || null,
        channelName: info.channelName || '',
        thumbnail: info.thumbnail || null,
        url: info.url || `https://www.youtube.com/channel/${ucid}`
    };

    if (core && typeof core.fetchChannelTab === 'function') {
        const result = await core.fetchChannelTab(source, ucid, tab, {
            sort,
            ensureConsentCookie: typeof ensureConsentCookie === 'function' ? ensureConsentCookie : undefined
        });
        if (tab !== 'videos' || (Array.isArray(result?.items) && result.items.length)) return result;

        // YouTube changes its channel-tab renderer shape frequently. If the HTML
        // tab parser yields no videos, fall back to the public channel RSS feed.
        // This keeps the channel page useful in Firefox even when a private
        // renderer or youtubei continuation changes.
        if (typeof fetchChannelFeed === 'function') {
            try {
                const rss = await fetchChannelFeed(source);
                if (Array.isArray(rss?.videos) && rss.videos.length) {
                    return { items: rss.videos, error: result?.error || null };
                }
            } catch (_) { /* continue to backfill fallback */ }
        }

        if (core && typeof core.fetchChannelBackfill === 'function') {
            const backfill = await core.fetchChannelBackfill(source, ucid, new Set(), {
                ensureConsentCookie: typeof ensureConsentCookie === 'function' ? ensureConsentCookie : undefined
            });
            if (Array.isArray(backfill?.videos) && backfill.videos.length) {
                return { items: backfill.videos, error: result?.error || backfill.error || null };
            }
        }
        return result;
    }

    if (tab === 'videos' && core && typeof core.fetchChannelBackfill === 'function') {
        const result = await core.fetchChannelBackfill(source, ucid, new Set(), {
            ensureConsentCookie: typeof ensureConsentCookie === 'function' ? ensureConsentCookie : undefined
        });
        return { items: result.videos || [], error: result.error };
    }
    return { items: [], error: 'youtube-fetch-unavailable' };
}

async function fetchYouTubeChannelTabContinuation(info, tab, token, config) {
    const core = globalThis.ytvhtFeedCore;
    if (!core || typeof core.fetchChannelTabContinuation !== 'function') {
        return { items: [], continuation: '', config, error: 'youtube-paging-unavailable' };
    }
    const ucid = await resolveChannelPageUcid(info);
    if (!ucid) return { items: [], continuation: '', config, error: 'channel-id-unavailable' };
    const source = {
        id: ucid,
        ucid,
        handle: info.handle || null,
        channelName: info.channelName || '',
        thumbnail: info.thumbnail || null,
        url: info.url || `https://www.youtube.com/channel/${ucid}`
    };
    return core.fetchChannelTabContinuation(source, tab, token, config, {
        ensureConsentCookie: typeof ensureConsentCookie === 'function' ? ensureConsentCookie : undefined
    });
}

function channelItemKey(item) {
    return item?.videoId || item?.playlistId || item?.postId || item?.url || '';
}

function appendUniqueChannelItems(items) {
    const known = new Set(channelTabItems.map(channelItemKey).filter(Boolean));
    let added = 0;
    (items || []).forEach((item) => {
        const key = channelItemKey(item);
        if (!key || known.has(key)) return;
        known.add(key);
        channelTabItems.push(item);
        added++;
    });
    return added;
}

function renderChannelAvatar(container, info) {
    container.textContent = '';
    if (info.thumbnail) {
        const img = document.createElement('img');
        img.className = 'channel-view-avatar';
        img.src = info.thumbnail;
        img.alt = '';
        container.appendChild(img);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'channel-view-avatar';
        fallback.textContent = decodeHtmlEntities(info.channelName || '?').charAt(0).toUpperCase();
        container.appendChild(fallback);
    }
}

function setChannelTabActive(tab) {
    activeChannelTab = tab;
    document.querySelectorAll('#channelTabs .channel-view-tab').forEach((button) => {
        const active = button.dataset.tab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

function channelTabEmptyCopy(tab) {
    if (tab === 'shorts') return ['No Shorts yet', 'This channel has no Shorts yet.'];
    if (tab === 'live') return ['No live streams yet', 'This channel has no live streams yet.'];
    if (tab === 'playlists') return ['No playlists yet', 'This channel has no public playlists yet.'];
    if (tab === 'posts') return ['No posts yet', 'This channel has no public posts yet.'];
    return ['No videos yet', 'This channel has no videos yet.'];
}

function channelTabLoadingCopy(tab) {
    if (tab === 'shorts') return ['Loading Shorts', 'Checking this channel’s Shorts'];
    if (tab === 'live') return ['Loading live streams', 'Checking this channel’s live content'];
    if (tab === 'playlists') return ['Loading playlists', 'Checking this channel’s playlists'];
    if (tab === 'posts') return ['Loading posts', 'Checking this channel’s posts'];
    return ['Loading videos', 'Checking this channel’s videos'];
}

function renderChannelTabLoading(tab) {
    const container = document.getElementById('channelVideos');
    const empty = document.getElementById('channelEmpty');
    const sentinel = document.getElementById('channelLoadSentinel');
    if (!container) return;

    container.textContent = '';
    container.classList.remove(
        'channel-view-video-grid',
        'channel-view-shorts-grid',
        'channel-view-playlist-grid',
        'channel-view-posts'
    );
    container.classList.add('channel-loading-state');
    if (empty) empty.style.display = 'none';
    if (sentinel) sentinel.style.display = 'none';

    const [title, detail] = channelTabLoadingCopy(tab);
    const loading = document.createElement('div');
    loading.className = 'channel-tab-loading yt-search-state';
    loading.innerHTML =
        '<span class="yt-search-loader" aria-hidden="true"></span>' +
        '<span class="yt-search-state-text">' +
            '<strong></strong><span></span>' +
        '</span>';
    loading.querySelector('strong').textContent = title;
    loading.querySelector('.yt-search-state-text > span').textContent = detail;
    container.appendChild(loading);
}

function renderChannelPlaylistCard(item) {
    const link = document.createElement('a');
    link.className = 'channel-playlist-card';
    link.href = item.url || `https://www.youtube.com/playlist?list=${encodeURIComponent(item.playlistId || '')}`;
    link.target = '_blank';
    link.rel = 'noopener';

    const thumb = document.createElement('div');
    thumb.className = 'channel-playlist-thumb';
    if (item.thumbnail) {
        const image = document.createElement('img');
        image.src = item.thumbnail;
        image.alt = '';
        image.loading = 'lazy';
        thumb.appendChild(image);
    } else {
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '▶';
        thumb.appendChild(icon);
    }

    const title = document.createElement('div');
    title.className = 'channel-playlist-title';
    title.textContent = decodeHtmlEntities(item.title || 'Playlist');
    const meta = document.createElement('div');
    meta.className = 'channel-playlist-meta';
    meta.textContent = item.countText || '';
    link.append(thumb, title, meta);
    return link;
}

function renderChannelPostCard(item) {
    const card = document.createElement(item.url ? 'a' : 'article');
    card.className = 'channel-post-card';
    if (item.url) {
        card.href = item.url;
        card.target = '_blank';
        card.rel = 'noopener';
    }
    const text = document.createElement('div');
    text.className = 'channel-post-text';
    text.textContent = decodeHtmlEntities(item.text || 'Post');
    card.appendChild(text);
    if (item.image) {
        const image = document.createElement('img');
        image.className = 'channel-post-image';
        image.src = item.image;
        image.alt = '';
        image.loading = 'lazy';
        card.appendChild(image);
    }
    const meta = document.createElement('div');
    meta.className = 'channel-post-meta';
    meta.textContent = [item.publishedText, item.likesText].filter(Boolean).join(' • ');
    if (meta.textContent) card.appendChild(meta);
    return card;
}

function channelVideoPublishedTime(video) {
    const direct = Number(video && video.published || 0);
    if (direct) return direct;
    const ageDays = relativeAgeDays(video && video._whenText);
    return ageDays == null ? 0 : Date.now() - ageDays * 86400000;
}

function sortedChannelVideos(items) {
    const videos = Array.isArray(items) ? items.slice() : [];
    if (channelVideoSort === 'popular') {
        return videos.sort((a, b) => Number(b && b.views || 0) - Number(a && a.views || 0));
    }
    if (channelVideoSort === 'oldest') {
        return videos.sort((a, b) => channelVideoPublishedTime(a) - channelVideoPublishedTime(b));
    }
    return videos.sort((a, b) => channelVideoPublishedTime(b) - channelVideoPublishedTime(a));
}

function renderChannelVideoRow(video) {
    const row = buildResultRow(video, {
        menuOptions: {
            showRecommendationFeedback: false,
            showHideVideo: false
        }
    });
    row.classList.add('channel-video-row');
    // We are already inside this channel, so repeating the avatar/name on every
    // row adds noise and wastes vertical space.
    const channel = row.querySelector('.yt-row-channel');
    if (channel) channel.remove();
    return row;
}

function renderChannelVideoCard(video) {
    const card = buildCard(video, {
        menuOptions: {
            showRecommendationFeedback: false,
            showHideVideo: false
        }
    });
    card.classList.add('channel-video-card');

    // A channel page already establishes the creator, so keep each card focused
    // on the video itself: thumbnail, title, views/date and menu.
    const avatar = card.querySelector('.ytvht-avatar-link');
    if (avatar) avatar.remove();
    const channelRow = card.querySelector('.ytvht-card-channel-row');
    if (channelRow) channelRow.remove();

    // New YouTube lockup renderers occasionally keep the display strings while
    // the parsed numeric/timestamp fields are empty. Ensure the metadata line
    // remains visible instead of leaving only the title.
    const cardText = card.querySelector('.ytvht-card-text');
    if (cardText && !cardText.querySelector('.ytvht-card-meta')) {
        const parts = [
            typeof videoViewsText === 'function' ? videoViewsText(video) : '',
            typeof videoAgeText === 'function' ? videoAgeText(video) : ''
        ].filter(Boolean);
        if (parts.length) {
            const meta = document.createElement('div');
            meta.className = 'ytvht-card-meta';
            meta.textContent = parts.join(' • ');
            cardText.appendChild(meta);
        }
    }
    return card;
}

function renderChannelShortCard(video) {
    const card = buildCard(video, {
        menuOptions: {
            showRecommendationFeedback: false,
            showHideVideo: false
        }
    });
    card.classList.add('channel-short-card');

    // The channel is already known on this page, so Shorts only need the
    // thumbnail, title, views/date and video menu.
    const avatar = card.querySelector('.ytvht-avatar-link');
    if (avatar) avatar.remove();
    const channelRow = card.querySelector('.ytvht-card-channel-row');
    if (channelRow) channelRow.remove();
    return card;
}

function updateChannelSortControls() {
    // Channel Videos always use YouTube's default latest-first order.
}

function wireChannelSortControls() {
    // Popular / Oldest controls intentionally removed because YouTube's
    // internal channel sort endpoints are not stable across layouts.
}

function renderVisibleChannelItems() {
    const container = document.getElementById('channelVideos');
    const empty = document.getElementById('channelEmpty');
    const sentinel = document.getElementById('channelLoadSentinel');
    if (!container || !empty) return;

    container.textContent = '';
    container.classList.remove('channel-loading-state');
    container.classList.toggle('channel-view-video-grid', activeChannelTab === 'videos');
    container.classList.toggle('channel-view-shorts-grid', activeChannelTab === 'shorts');
    container.classList.toggle('channel-view-playlist-grid', activeChannelTab === 'playlists');
    container.classList.toggle('channel-view-posts', activeChannelTab === 'posts');

    let sourceItems = channelTabItems;

    // Keep the channel page consistent with Home / Subscriptions. When
    // "Hide member videos" is enabled, filter members-only/members-first
    // videos from Videos, Shorts and Live before rendering.
    const hideMemberVideos = document.getElementById('hideMembers')?.checked;
    if (hideMemberVideos && ['videos', 'shorts', 'live'].includes(activeChannelTab)) {
        sourceItems = sourceItems.filter((video) => !videoIsMembersOnly(video));
    }

    const visible = sourceItems.slice(0, channelVisibleLimit);
    if (activeChannelTab === 'videos') {
        visible.forEach((video) => container.appendChild(renderChannelVideoCard(video)));
    } else if (activeChannelTab === 'shorts') {
        visible.forEach((video) => container.appendChild(renderChannelShortCard(video)));
    } else if (activeChannelTab === 'playlists') {
        visible.forEach((item) => container.appendChild(renderChannelPlaylistCard(item)));
    } else if (activeChannelTab === 'posts') {
        visible.forEach((item) => container.appendChild(renderChannelPostCard(item)));
    } else {
        visible.forEach((video) => container.appendChild(renderChannelVideoRow(video)));
    }
    updateChannelSortControls();

    const [title, text] = channelTabEmptyCopy(activeChannelTab);
    const strong = empty.querySelector('strong');
    const span = empty.querySelector('.empty-panel > span:last-child');
    if (strong) strong.textContent = title;
    if (span) span.textContent = text;
    empty.style.display = sourceItems.length ? 'none' : 'flex';
    if (sentinel) {
        const hiddenItems = channelVisibleLimit < sourceItems.length;
        const canPage = !!channelContinuation && !channelPagingError;
        sentinel.style.display = hiddenItems || canPage || channelLoadingMore ? 'block' : 'none';
        sentinel.setAttribute('aria-label', channelLoadingMore
            ? 'Loading more videos'
            : (channelPagingError ? channelPagingError : 'Load more channel items'));
    }
}

async function loadMoreChannelItems() {
    if (channelLoadingMore || !channelContinuation || !activeChannelInfo || !channelActive) return;
    const renderToken = channelPageRenderToken;
    const pageInfo = activeChannelInfo;
    const tab = activeChannelTab;
    const previousCount = channelTabItems.length;

    channelLoadingMore = true;
    channelPagingError = '';
    renderVisibleChannelItems();

    try {
        let attempts = 0;
        while (channelContinuation && attempts < 4) {
            const previousToken = channelContinuation;
            const page = await fetchYouTubeChannelTabContinuation(
                pageInfo,
                tab,
                previousToken,
                channelContinuationConfig
            );

            if (renderToken !== channelPageRenderToken || !channelActive ||
                activeChannelInfo !== pageInfo || activeChannelTab !== tab) return;

            const added = appendUniqueChannelItems(page?.items || []);
            channelContinuation = page?.continuation || '';
            channelContinuationConfig = page?.config || channelContinuationConfig;
            attempts++;

            if (added > 0) break;
            if (!channelContinuation || channelContinuation === previousToken) {
                channelContinuation = '';
                break;
            }
        }

        if (channelTabItems.length === previousCount) {
            channelPagingError = 'No more videos found.';
            channelContinuation = '';
        }
        channelVisibleLimit = Math.max(channelVisibleLimit + 20, channelTabItems.length);
    } catch (error) {
        console.error('[feed] loading more channel items failed', error);
        channelPagingError = 'More videos unavailable right now';
        channelContinuation = '';
    } finally {
        channelLoadingMore = false;
        if (renderToken === channelPageRenderToken && channelActive &&
            activeChannelInfo === pageInfo && activeChannelTab === tab) {
            renderVisibleChannelItems();
        }
    }
}

function ensureChannelLoadObserver() {
    const sentinel = document.getElementById('channelLoadSentinel');
    if (!sentinel) return;
    if (channelLoadObserver) channelLoadObserver.disconnect();
    channelLoadObserver = new IntersectionObserver((entries) => {
        if (!channelActive || channelLoadingMore || !entries.some((entry) => entry.isIntersecting)) return;
        let sourceItems = channelTabItems;
        const hideMemberVideos = document.getElementById('hideMembers')?.checked;
        if (hideMemberVideos && ['videos', 'shorts', 'live'].includes(activeChannelTab)) {
            sourceItems = sourceItems.filter((video) => !videoIsMembersOnly(video));
        }
        if (channelVisibleLimit < sourceItems.length) {
            channelVisibleLimit = Math.min(sourceItems.length, channelVisibleLimit + 20);
            renderVisibleChannelItems();
            return;
        }
        if (channelContinuation) loadMoreChannelItems();
    }, { rootMargin: '700px 0px' });
    channelLoadObserver.observe(sentinel);
}


async function loadChannelTab(pageInfo, tab, renderToken) {
    setChannelTabActive(tab);
    channelVisibleLimit = 20;
    channelTabItems = [];
    channelContinuation = '';
    channelContinuationConfig = null;
    channelLoadingMore = false;
    channelPagingError = '';
    updateChannelSortControls();
    renderChannelTabLoading(tab);

    const requestedSort = 'latest';
    const cacheKey = `${channelPageKey(pageInfo)}:${tab}:${requestedSort}`;
    if (tab === 'videos') {
        channelSortLoading = true;
        updateChannelSortControls();
    }

    let result;
    try {
        // Video sorts are deliberately fetched fresh. Caching a failed/incorrect
        // YouTube sort response makes the buttons appear to do nothing for the
        // rest of the session. Other channel tabs can still use their cache.
        result = tab === 'videos' ? null : channelTabCache.get(cacheKey);
        if (!result) {
            result = await fetchYouTubeChannelTab(pageInfo, tab, requestedSort);
            if (tab !== 'videos') channelTabCache.set(cacheKey, result);
        }
    } finally {
        if (tab === 'videos' && channelVideoSort === requestedSort) {
            channelSortLoading = false;
            updateChannelSortControls();
        }
    }

    if (renderToken !== channelPageRenderToken || !channelActive || activeChannelInfo !== pageInfo ||
        activeChannelTab !== tab || (tab === 'videos' && channelVideoSort !== requestedSort)) return;

    channelTabItems = Array.isArray(result?.items) ? result.items : [];
    channelContinuation = result?.continuation || '';
    channelContinuationConfig = result?.config || null;
    channelPagingError = '';
    // Do not fall back to the local cache here. A partial local match can show
    // the wrong uploads for Latest / Popular / Oldest and makes the channel
    // page look trustworthy when the real YouTube tab data was unavailable.
    renderVisibleChannelItems();
    ensureChannelLoadObserver();
}

function wireChannelTabs(pageInfo, renderToken) {
    document.querySelectorAll('#channelTabs .channel-view-tab').forEach((button) => {
        button.onclick = () => {
            const tab = button.dataset.tab || 'videos';
            if (tab === activeChannelTab) return;
            loadChannelTab(pageInfo, tab, renderToken);
        };
    });
}

async function renderChannelPage(info) {
    const normalized = normalizeChannelInfo(info);
    const changedChannel = !activeChannelInfo || channelPageKey(activeChannelInfo) !== channelPageKey(normalized);
    activeChannelInfo = normalized;
    const pageInfo = activeChannelInfo;
    if (changedChannel) {
        activeChannelTab = 'videos';
        channelVisibleLimit = 20;
        channelTabItems = [];
        channelContinuation = '';
        channelContinuationConfig = null;
        channelLoadingMore = false;
        channelPagingError = '';
    }
    const renderToken = ++channelPageRenderToken;
    const title = document.getElementById('channelTitle');
    const meta = document.getElementById('channelMeta');
    const avatar = document.getElementById('channelAvatar');
    const actions = document.getElementById('channelActions');
    const videos = document.getElementById('channelVideos');
    const empty = document.getElementById('channelEmpty');
    if (!title || !meta || !avatar || !actions || !videos || !empty) return;

    renderChannelAvatar(avatar, pageInfo);
    title.textContent = decodeHtmlEntities(pageInfo.channelName || 'Unknown channel');
    // Keep the handle and subscriber count together like YouTube's channel header.
    renderChannelMeta(meta, pageInfo);

    actions.textContent = '';
    actions.appendChild(buildSubscribeButton(pageInfo));
    if (pageInfo.url) {
        const open = document.createElement('a');
        open.className = 'btn';
        open.href = pageInfo.url;
        open.target = '_blank';
        open.rel = 'noopener';
        open.classList.add('channel-open-youtube');
        open.innerHTML = '<span>Open on YouTube</span>' +
            '<svg class="external-link-icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M14 5h5v5"></path><path d="M10 14 19 5"></path>' +
            '<path d="M19 13v6H5V5h6"></path></svg>';
        actions.appendChild(open);
    }

    if (!compactSubscriberCountText(pageInfo.subsText)) {
        resolveChannelSubscriberText(pageInfo).then((subsText) => {
            if (renderToken !== channelPageRenderToken || activeChannelInfo !== pageInfo) return;
            if (subsText) pageInfo.subsText = subsText;
            pageInfo._subscriberResolved = true;
            renderChannelMeta(meta, pageInfo);
        });
    } else {
        pageInfo._subscriberResolved = true;
    }

    wireChannelTabs(pageInfo, renderToken);
    wireChannelSortControls();
    updateChannelSortControls();
    await loadChannelTab(pageInfo, activeChannelTab || 'videos', renderToken);
}

function resetChannelPageScroll() {
    const scrolling = document.scrollingElement || document.documentElement;
    if (scrolling) {
        scrolling.scrollTop = 0;
        scrolling.scrollLeft = 0;
    }
    try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_) { window.scrollTo(0, 0); }
}

function showChannelPage(info) {
    document.body.classList.remove('empty-page-no-scroll');
    if (youtubeSearchTimer) {
        clearTimeout(youtubeSearchTimer);
        youtubeSearchTimer = null;
    }
    youtubeSearchRequestId++;
    youtubeSearchLoadingMore = false;
    document.body.classList.remove('shorts-mode');
    setRefreshVisible(false);
    setCreatePlaylistVisible(false);
    setSaveSettingsVisible(false);
    setClearSubscriptionsVisible(false);
    setClearHistoryVisible(false);
    setPageCountVisible();
    setFeedOptionsVisible(false);
    showFeedStatus(false);
    channelActive = true;
    watchLaterActive = false;
    analyticsActive = false;
    subscriptionsActive = false;
    playlistsActive = false;
    historyActive = false;
    settingsActive = false;
    ['localHeading', 'grid', 'localSearchResults', 'empty', 'ytSection',
        'analyticsSection', 'subscriptionsSection', 'playlistsSection',
        'historySection', 'settingsSection', 'watchLaterSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    hideSearchControls();
    const chips = document.querySelector('.chips');
    if (chips) chips.style.display = 'none';
    const section = document.getElementById('channelSection');
    if (section) section.style.display = 'block';
    resetChannelPageScroll();
    requestAnimationFrame(resetChannelPageScroll);
    setActiveNav('');
    renderChannelPage(info);
}

function hideChannelPage() {
    channelPageRenderToken++;
    channelActive = false;
    channelLoadingMore = false;
    channelContinuation = '';
    channelContinuationConfig = null;
    if (channelLoadObserver) {
        channelLoadObserver.disconnect();
        channelLoadObserver = null;
    }
    watchLaterActive = false;
    const section = document.getElementById('channelSection');
    if (section) section.style.display = 'none';
}
