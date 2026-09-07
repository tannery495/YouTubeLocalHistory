async function renderHistory() {
    const list = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');
    const count = document.getElementById('historyCount');
    const loadMore = document.getElementById('historyLoadMore');
    const clearAll = document.getElementById('clearHistoryPage');
    if (!list || !empty || !count || !loadMore) return;

    let videoMap = {};
    try { videoMap = await ytStorage.getAllVideos(); } catch (_) { /* show empty */ }
    let records = Object.entries(videoMap || {})
        .map(([videoId, value]) => ({ ...(value || {}), videoId: (value && value.videoId) || videoId }))
        .filter(isVisibleHistoryRecord)
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

    const visible = records.slice(0, historyVisibleLimit);
    list.textContent = '';
    visible.forEach((video) => {
        const row = buildResultRow(video, {
            metaText: historyWatchedText(video),
            overlayRecord: video,
            menuOptions: {
                showRecommendationFeedback: false,
                showUnsubscribe: false,
                showHideVideo: false
            }
        });
        row.classList.add('history-row');
        const remove = document.createElement('button');
        remove.className = 'btn history-remove';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
            remove.disabled = true;
            try {
                await ytStorage.removeVideo(video.videoId);
                delete watchedMap[video.videoId];
                await renderHistory();
            } catch (error) {
                console.error('[history] remove failed', error);
                remove.disabled = false;
            }
        });
        const actions = row.querySelector('.yt-row-actions');
        if (actions) actions.insertBefore(remove, actions.firstChild);
        else row.appendChild(remove);
        list.appendChild(row);
    });

    count.textContent = String(records.length);
    const historyCountLabel = `${records.length} history ${records.length === 1 ? 'entry' : 'entries'}`;
    count.title = historyCountLabel;
    count.setAttribute('aria-label', historyCountLabel);
    if (clearAll) clearAll.style.display = records.length ? '' : 'none';
    document.body.classList.toggle('empty-page-no-scroll', records.length === 0);
    empty.style.display = records.length ? 'none' : 'flex';
    loadMore.style.display = visible.length < records.length ? '' : 'none';
    loadMore.textContent = visible.length < records.length
        ? `Load more (${records.length - visible.length} remaining)`
        : 'Load more';
}

function showHistory() {
    document.body.classList.remove('empty-page-no-scroll');
    rememberView('history');
    document.body.classList.remove('shorts-mode');
    setRefreshVisible(false);
    setCreatePlaylistVisible(false);
    setSaveSettingsVisible(false);
    // Keep destructive actions hidden until renderHistory confirms there is data.
    setClearSubscriptionsVisible(false);
    setClearHistoryVisible(false);
    setPageCountVisible('historyCount');
    setFeedOptionsVisible(false);
    showFeedStatus(false);
    leaveSearchPage();
    analyticsActive = false;
    subscriptionsActive = false;
    playlistsActive = false;
    historyActive = true;
    settingsActive = false;
    channelActive = false;
    watchLaterActive = false;
    ['localHeading', 'grid', 'localSearchResults', 'empty', 'ytSection',
        'analyticsSection', 'subscriptionsSection', 'playlistsSection', 'settingsSection', 'channelSection', 'watchLaterSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const chips = document.querySelector('.chips');
    if (chips) chips.style.display = 'none';
    const section = document.getElementById('historySection');
    if (section) section.style.display = 'block';
    setActiveNav('navHistory');
    renderHistory();
}

function isVisibleHistoryRecord(video) {
    if (!video || !video.videoId) return false;
    if (Number(video.time || 0) > 0) return true;
    if (video.importedHistory) return true;
    return Number(video.timestamp || 0) > 0 && !!(video.title || video.url);
}
