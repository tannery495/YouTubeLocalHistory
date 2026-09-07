async function renderWatchLater() {
    const section = document.getElementById('watchLaterSection');
    const list = document.getElementById('watchLaterList');
    const empty = document.getElementById('watchLaterEmpty');
    const count = document.getElementById('watchLaterCount');
    if (!section || !list || !empty || !count) return;

    let records = [];
    try {
        const items = await ytStorage.getAllWatchLater();
        records = Object.values(items || {})
            .filter((item) => item && item.videoId)
            .sort((a, b) => watchLaterTimestamp(b) - watchLaterTimestamp(a));
    } catch (error) {
        console.error('[watch-later] could not load saved videos', error);
    }

    list.textContent = '';
    records.forEach((record) => {
        const video = {
            ...record,
            title: record.title || record.url || record.videoId,
            thumbnail: record.thumbnail || `https://i.ytimg.com/vi/${record.videoId}/hqdefault.jpg`,
            url: record.url || `https://www.youtube.com/watch?v=${record.videoId}`
        };
        const row = buildResultRow(video, {
            metaText: watchLaterAddedText(record),
            overlayRecord: watchedMap[record.videoId],
            menuOptions: {
                showWatchLater: false,
                showHideVideo: false,
                showRecommendationFeedback: false,
                showUnsubscribe: false
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
                await ytStorage.removeWatchLater(record.videoId);
                await renderWatchLater();
            } catch (error) {
                console.error('[watch-later] could not remove saved video', error);
                remove.disabled = false;
            }
        });

        const actions = row.querySelector('.yt-row-actions');
        if (actions) actions.insertBefore(remove, actions.firstChild);
        else row.appendChild(remove);
        list.appendChild(row);
    });

    count.textContent = `${records.length} saved video${records.length === 1 ? '' : 's'}`;
    const isEmpty = records.length === 0;
    document.body.classList.toggle('empty-page-no-scroll', isEmpty);
    section.classList.toggle('watch-later-empty-view', isEmpty);
    section.style.display = isEmpty ? 'flex' : 'block';
    empty.style.display = isEmpty ? 'flex' : 'none';
}

function watchLaterTimestamp(record) {
    return Number(record?.addedAt || record?.savedAt || 0);
}

function watchLaterAddedText(record) {
    const timestamp = watchLaterTimestamp(record);
    if (!timestamp) return 'Saved to Watch Later';
    return `Saved ${new Date(timestamp).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    })}`;
}

function showWatchLater() {
    document.body.classList.remove('empty-page-no-scroll');
    rememberView('playlists');
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

    analyticsActive = false;
    subscriptionsActive = false;
    playlistsActive = true;
    historyActive = false;
    settingsActive = false;
    channelActive = false;
    watchLaterActive = true;

    ['localHeading', 'grid', 'localSearchResults', 'empty', 'ytSection',
        'analyticsSection', 'subscriptionsSection', 'playlistsSection',
        'historySection', 'settingsSection', 'channelSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const chips = document.querySelector('.chips');
    if (chips) chips.style.display = 'none';
    const section = document.getElementById('watchLaterSection');
    if (section) section.style.display = 'block';
    setActiveNav('navPlaylists');
    renderWatchLater();
}
