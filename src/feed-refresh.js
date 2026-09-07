// ----- data loading ------------------------------------------------------
async function loadData() {
    try {
        const settings = (await ytStorage.getSettings()) || {};
        overlayTitle = 'Viewed';
        applyFeedTheme(settings.themePreference || 'system');
        applyAccentColor(settings.accentColor || 'blue');
    } catch (_) { /* defaults */ }

    try {
        const cache = (await ytStorage.getFeedCache()) || {};
        allVideos = Array.isArray(cache.videos)
            ? cache.videos.filter((video) =>
                video &&
                video.videoId &&
                !video._historyOnly &&
                !video.importedHistory &&
                !String(video._whenText || '').toLowerCase().startsWith('watched ')
            )
            : [];
        lastUpdated = cache.updatedAt || 0;
        feedCachePolicy = cache.policy || '';
        feedDiagnostics = Array.isArray(cache.diagnostics) ? cache.diagnostics : [];
    } catch (e) {
        console.error('[feed] failed to load feed cache', e);
        allVideos = [];
        feedCachePolicy = '';
        feedDiagnostics = [];
    }

    try {
        releaseDateCache = await ytStorage.getReleaseDateCache();
    } catch (_) {
        releaseDateCache = {};
    }
    try {
        durationCache = await ytStorage.getDurationCache();
    } catch (_) {
        durationCache = {};
    }
    try {
        shortsCache = await ytStorage.getShortsCache();
    } catch (_) {
        shortsCache = {};
    }
    try {
        localSubscriptions = await ytStorage.getSubscriptionList();
    } catch (_) {
        localSubscriptions = [];
    }
    if (localSubscriptions.length > 0 &&
        feedCachePolicy !== FEED_CACHE_POLICY &&
        !isRefreshing &&
        !(typeof feedRefreshIsSuppressed === 'function' && feedRefreshIsSuppressed())) {
        refreshFeedNow(true).catch((error) => {
            console.warn('[feed] cache policy refresh failed', error && error.message);
        });
    }
    try {
        const feedbackResult = await chrome.storage.local.get(['feedFeedback']);
        const saved = feedbackResult.feedFeedback || {};
        feedFeedback = {
            notInterested: saved.notInterested || {},
            channelLess: saved.channelLess || {},
            channelMore: saved.channelMore || {}
        };
    } catch (_) {
        feedFeedback = { notInterested: {}, channelLess: {}, channelMore: {} };
    }

    // Watch records power the "viewed" overlay + "unwatched only" filter.
    try {
        const videos = await ytStorage.getAllVideos();
        watchedMap = videos || {};
    } catch (e) {
        console.warn('[feed] could not load watch history for overlays', e && e.message);
        watchedMap = {};
    }
}

// ----- refresh (self-contained; fetches youtube.com directly) ------------
function setStatus(message, busy) {
    const el = document.getElementById('status');
    el.textContent = '';
    if (busy) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        el.appendChild(spinner);
    }
    if (message) el.appendChild(document.createTextNode(message));
    el.style.display = message ? '' : 'none';
}

const REFRESH_COOLDOWN_MS = 5000;
let refreshCooldownUntil = 0;
let refreshCooldownTimer = null;
let refreshSuccessTimer = null;

function appendRefreshReadyContent(btn) {
    btn.textContent = '';
    const icon = document.createElement('span');
    icon.className = 'refresh-button-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '↻';
    btn.append(icon, document.createTextNode(tFeed('feed_refresh', 'Refresh')));
}

function clearRefreshUiTimers() {
    if (refreshCooldownTimer) {
        clearInterval(refreshCooldownTimer);
        refreshCooldownTimer = null;
    }
    if (refreshSuccessTimer) {
        clearTimeout(refreshSuccessTimer);
        refreshSuccessTimer = null;
    }
}

function updateRefreshCooldownUi() {
    const btn = document.getElementById('refresh');
    if (!btn) return;
    const remainingMs = Math.max(0, refreshCooldownUntil - Date.now());
    if (remainingMs <= 0) {
        clearRefreshUiTimers();
        refreshCooldownUntil = 0;
        btn.disabled = false;
        btn.setAttribute('aria-busy', 'false');
        btn.classList.remove('refresh-busy', 'refresh-success', 'refresh-cooldown');
        appendRefreshReadyContent(btn);
        btn.title = 'Refresh feed';
        return;
    }

    const seconds = Math.ceil(remainingMs / 1000);
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'false');
    btn.classList.remove('refresh-busy', 'refresh-success');
    btn.classList.add('refresh-cooldown');
    btn.textContent = `Refresh ${seconds}s`;
    btn.title = `Refresh available in ${seconds} second${seconds === 1 ? '' : 's'}`;
}

function startRefreshCooldown() {
    const btn = document.getElementById('refresh');
    if (!btn) return;
    clearRefreshUiTimers();
    refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'false');
    btn.classList.remove('refresh-busy', 'refresh-success');

    // Go straight from Refreshing… into the cooldown countdown.
    updateRefreshCooldownUi();
    refreshCooldownTimer = setInterval(updateRefreshCooldownUi, 250);
}

function setRefreshUi(busy) {
    const btn = document.getElementById('refresh');
    if (!btn) return;

    if (!busy && refreshCooldownUntil > Date.now()) {
        updateRefreshCooldownUi();
        return;
    }

    btn.disabled = busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    btn.classList.toggle('refresh-busy', busy);
    btn.classList.remove('refresh-success', 'refresh-cooldown');
    btn.textContent = '';
    if (busy) {
        const spinner = document.createElement('span');
        spinner.className = 'button-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        btn.appendChild(spinner);
        btn.appendChild(document.createTextNode(tFeed('feed_refreshing', 'Refreshing...')));
        btn.title = 'Refreshing feed';
    } else {
        appendRefreshReadyContent(btn);
        btn.title = 'Refresh feed';
    }
}

function setRefreshResultStatus() {
    // Refresh success is represented by the updated content/button state.
    setStatus('', false);
}

async function refresh(event) {
    const userInitiated = !!(event && event.type === 'click');
    if (userInitiated && refreshCooldownUntil > Date.now()) {
        updateRefreshCooldownUi();
        return;
    }

    let succeeded = false;
    if (isRefreshing) {
        setRefreshUi(true);
        setStatus('', false);
        try {
            while (isRefreshing) {
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
            await loadData();
            if (historyActive) await renderHistory();
            else if (channelActive && activeChannelInfo) renderChannelPage(activeChannelInfo);
            else if (!analyticsActive && !subscriptionsActive && !playlistsActive && !settingsActive) render();
            setRefreshResultStatus();
            succeeded = true;
        } finally {
            if (userInitiated) startRefreshCooldown(succeeded);
            else setRefreshUi(false);
        }
        return;
    }
    setRefreshUi(true);
    setStatus('', false);
    try {
        const needsFullRefresh = allVideos.length === 0 || feedCachePolicy !== FEED_CACHE_POLICY;
        await refreshFeedNow(needsFullRefresh);
        await loadData();
        if (!shortsOnly && !subscriptionsChronological &&
            !analyticsActive && !subscriptionsActive && !playlistsActive && !historyActive && !settingsActive) {
            reshuffleHome();
        }
        if (historyActive) await renderHistory();
        else if (channelActive && activeChannelInfo) renderChannelPage(activeChannelInfo);
        else if (!analyticsActive && !subscriptionsActive && !playlistsActive && !settingsActive) render();
        setRefreshResultStatus();
        succeeded = true;
    } catch (e) {
        setStatus(tFeed('feed_refresh_failed_status', 'Refresh failed: $1. If YouTube shows a consent wall, open youtube.com once in this browser.', [e.message || tFeed('message_unknown_error', 'error')]), false);
    } finally {
        if (userInitiated) startRefreshCooldown(succeeded);
        else setRefreshUi(false);
    }
}
