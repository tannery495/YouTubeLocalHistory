let subscriptionsRenderRequestId = 0;

function showFeedStatus(show) {
    const status = document.getElementById('status');
    if (!status) return;
    if (show && isRefreshing) {
        setStatus('', false);
    } else if (!isRefreshing) {
        status.textContent = '';
    }
    status.style.display = show && status.textContent ? '' : 'none';
}

function setRefreshVisible(visible) {
    const refresh = document.getElementById('refresh');
    if (refresh) refresh.style.display = visible ? '' : 'none';
}

function setCreatePlaylistVisible(visible) {
    const create = document.getElementById('createPlaylist');
    if (create) create.style.display = visible ? '' : 'none';
}

function setPageCountVisible() {
    // Count badges are intentionally hidden for the cleaner toolbar layout.
    // Keep the elements/data in place so they can be restored later.
    ['subscriptionsCount', 'playlistsCount', 'historyCount'].forEach((id) => {
        const badge = document.getElementById(id);
        if (badge) badge.style.display = 'none';
    });
}

function setSaveSettingsVisible(visible) {
    const save = document.getElementById('saveFeedSettings');
    if (save) save.style.display = visible ? '' : 'none';
}

function setClearSubscriptionsVisible(visible) {
    const clear = document.getElementById('clearSubscriptions');
    if (clear) clear.style.display = visible ? '' : 'none';
}

function setClearHistoryVisible(visible) {
    const clear = document.getElementById('clearHistoryPage');
    if (clear) clear.style.display = visible ? '' : 'none';
}

function setFeedOptionsVisible(_visible) {
    // Feed filters live in Settings now; there is no masthead overflow menu.
}

function hideSearchControls() {
    document.getElementById('searchFilters')?.classList.remove('visible', 'open');
    document.getElementById('searchSourceTabs')?.classList.remove('visible');
}

function leaveSearchPage() {
    const search = document.getElementById('search');
    if (search) search.value = '';
    searchVisibleLimit = SEARCH_PAGE_SIZE;
    youtubeVisibleLimit = SEARCH_PAGE_SIZE;
    hideSearchControls();
    if (typeof cancelYouTubeSearch === 'function') cancelYouTubeSearch();
}

// Toggle between the feed grid and the analytics view.
function showAnalytics() {
    document.body.classList.remove('empty-page-no-scroll');
    rememberView('analytics');
    document.body.classList.remove('shorts-mode');
    setRefreshVisible(false);
    setCreatePlaylistVisible(false);
    setSaveSettingsVisible(false);
    setClearSubscriptionsVisible(false);
    setClearHistoryVisible(false);
    setPageCountVisible();
    setFeedOptionsVisible(false);
    showFeedStatus(false);
    leaveSearchPage();
    analyticsActive = true;
    subscriptionsActive = false;
    playlistsActive = false;
    historyActive = false;
    settingsActive = false;
    channelActive = false;
    watchLaterActive = false;
    ['localHeading', 'grid', 'localSearchResults', 'empty', 'ytSection', 'channelSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const subscriptions = document.getElementById('subscriptionsSection');
    if (subscriptions) subscriptions.style.display = 'none';
    const playlists = document.getElementById('playlistsSection');
    if (playlists) playlists.style.display = 'none';
    const history = document.getElementById('historySection');
    if (history) history.style.display = 'none';
    const watchLater = document.getElementById('watchLaterSection');
    if (watchLater) watchLater.style.display = 'none';
    const settings = document.getElementById('settingsSection');
    if (settings) settings.style.display = 'none';
    const chips = document.querySelector('.chips');
    if (chips) chips.style.display = 'none';
    const sec = document.getElementById('analyticsSection');
    if (sec) sec.style.display = 'block';
    setActiveNav('analyticsToggle');
    renderAnalytics();
}

function showFeed() {
    document.body.classList.remove('empty-page-no-scroll');
    rememberView(shortsOnly ? 'shorts' : (subscriptionsChronological ? 'subscriptions' : 'home'));
    setRefreshVisible(true);
    setCreatePlaylistVisible(false);
    setSaveSettingsVisible(false);
    setClearSubscriptionsVisible(false);
    setClearHistoryVisible(false);
    setPageCountVisible();
    setFeedOptionsVisible(true);
    showFeedStatus(true);
    analyticsActive = false;
    subscriptionsActive = false;
    playlistsActive = false;
    historyActive = false;
    settingsActive = false;
    channelActive = false;
    watchLaterActive = false;
    const sec = document.getElementById('analyticsSection');
    if (sec) sec.style.display = 'none';
    const subscriptions = document.getElementById('subscriptionsSection');
    if (subscriptions) subscriptions.style.display = 'none';
    const playlists = document.getElementById('playlistsSection');
    if (playlists) playlists.style.display = 'none';
    const history = document.getElementById('historySection');
    if (history) history.style.display = 'none';
    const watchLater = document.getElementById('watchLaterSection');
    if (watchLater) watchLater.style.display = 'none';
    const settings = document.getElementById('settingsSection');
    if (settings) settings.style.display = 'none';
    const channel = document.getElementById('channelSection');
    if (channel) channel.style.display = 'none';
    const chips = document.querySelector('.chips');
    if (chips) chips.style.display = '';
    const heading = document.getElementById('localHeading');
    if (heading) heading.style.display = '';
    setActiveNav(shortsOnly ? 'navShorts' : (subscriptionsChronological ? 'navSubscriptions' : 'navHome'));
    render();
}

function subscriptionUrl(sub) {
    if (sub.url) return sub.url;
    if (sub.handle) return `https://www.youtube.com/${sub.handle}`;
    return `https://www.youtube.com/channel/${sub.ucid || sub.id}`;
}

async function renderSubscriptions() {
    const requestId = ++subscriptionsRenderRequestId;
    const list = document.getElementById('subscriptionsList');
    const empty = document.getElementById('subscriptionsEmpty');
    const count = document.getElementById('subscriptionsCount');
    const clear = document.getElementById('clearSubscriptions');
    if (!list || !empty || !count) return;

    let subscriptions = [];
    try { subscriptions = await ytStorage.getSubscriptionList(); } catch (_) { /* show empty */ }
    if (requestId !== subscriptionsRenderRequestId) return;
    list.textContent = '';
    count.textContent = String(subscriptions.length);
    const channelCountLabel = `${subscriptions.length} channel${subscriptions.length === 1 ? '' : 's'}`;
    count.title = channelCountLabel;
    count.setAttribute('aria-label', channelCountLabel);
    empty.style.display = subscriptions.length ? 'none' : 'flex';
    document.body.classList.toggle('empty-page-no-scroll', subscriptions.length === 0);
    if (clear) clear.style.display = subscriptions.length ? '' : 'none';

    subscriptions.forEach((sub) => {
        const row = document.createElement('div');
        row.className = 'subs-row';

        const channel = document.createElement('a');
        channel.className = 'subs-channel';
        channel.href = subscriptionUrl(sub);
        channel.target = '_blank';
        channel.rel = 'noopener';

        let avatar;
        if (sub.thumbnail) {
            avatar = document.createElement('img');
            avatar.src = sub.thumbnail;
            avatar.alt = '';
            avatar.loading = 'lazy';
            avatar.className = 'subs-avatar';
        } else {
            avatar = document.createElement('div');
            avatar.className = 'subs-avatar subs-avatar-fallback';
            avatar.textContent = decodeHtmlEntities(sub.channelName || sub.id || '?').charAt(0).toUpperCase();
        }
        channel.appendChild(avatar);

        const name = document.createElement('span');
        name.className = 'subs-name';
        name.textContent = decodeHtmlEntities(sub.channelName || sub.id || 'Unknown channel');
        channel.appendChild(name);
        row.appendChild(channel);

        const unsubscribe = document.createElement('button');
        unsubscribe.className = 'btn';
        unsubscribe.textContent = 'Unsubscribe';
        unsubscribe.addEventListener('click', async () => {
            unsubscribe.disabled = true;
            try {
                await removeSubscriptionAndPruneFeed(sub);
                await renderSubscriptions();
                setStatus(`Unsubscribed from ${name.textContent}.`, false);
                refreshFeedNow(false).catch((error) => {
                    console.warn('[subscriptions] feed refresh after unsubscribe failed', error);
                });
            } catch (error) {
                console.error('[subscriptions] remove failed', error);
                unsubscribe.disabled = false;
            }
        });
        row.appendChild(unsubscribe);
        list.appendChild(row);
    });
}

function showSubscriptions() {
    document.body.classList.remove('empty-page-no-scroll');
    rememberView('channels');
    document.body.classList.remove('shorts-mode');
    setRefreshVisible(false);
    setCreatePlaylistVisible(false);
    setSaveSettingsVisible(false);
    // Keep destructive actions hidden until renderSubscriptions confirms there is data.
    setClearSubscriptionsVisible(false);
    setClearHistoryVisible(false);
    setPageCountVisible('subscriptionsCount');
    setFeedOptionsVisible(false);
    showFeedStatus(false);
    leaveSearchPage();
    analyticsActive = false;
    subscriptionsActive = true;
    playlistsActive = false;
    historyActive = false;
    settingsActive = false;
    channelActive = false;
    watchLaterActive = false;
    ['localHeading', 'grid', 'localSearchResults', 'empty', 'ytSection', 'channelSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const analytics = document.getElementById('analyticsSection');
    if (analytics) analytics.style.display = 'none';
    const playlists = document.getElementById('playlistsSection');
    if (playlists) playlists.style.display = 'none';
    const history = document.getElementById('historySection');
    if (history) history.style.display = 'none';
    const watchLater = document.getElementById('watchLaterSection');
    if (watchLater) watchLater.style.display = 'none';
    const settings = document.getElementById('settingsSection');
    if (settings) settings.style.display = 'none';
    const chips = document.querySelector('.chips');
    if (chips) chips.style.display = 'none';
    const subscriptions = document.getElementById('subscriptionsSection');
    if (subscriptions) subscriptions.style.display = 'block';
    setActiveNav('manage');
    renderSubscriptions();
}

function formatSavedDate(timestamp) {
    if (!timestamp) return '';
    try {
        return new Date(timestamp).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    } catch (_) {
        return '';
    }
}

function formatUploadDate(timestamp) {
    if (!timestamp) return '';
    try {
        return `Uploaded ${new Date(timestamp).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        })}`;
    } catch (_) {
        return '';
    }
}
