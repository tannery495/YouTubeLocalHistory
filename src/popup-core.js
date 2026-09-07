// --- Debugging and Logging ---
let debugEnabled = false; // Will be set from user settings

function log(...args) {
    if (debugEnabled) {
        
    }
}

window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('[ythdb-popup] Error: ' + msg + '\nURL: ' + url + '\nLine: ' + lineNo + '\nColumn: ' + columnNo + '\nError object: ' + JSON.stringify(error));
    return false;
};



log('Script starting initialization');

// Pagination state
let allHistoryRecords = [];
let allShortsRecords = [];
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let totalHistoryRecords = 0;

// Shorts Pagination state
let currentShortsPage = 1;
let shortsPageSize = 20;
let totalShortsPages = 1;
let totalShortsRecords = 0;

// --- Playlists Tab State ---
let allPlaylists = [];
let currentPlaylistPage = 1;
let playlistPageSize = 20;
let totalPlaylistPages = 1;
let totalPlaylistRecords = 0;

// Stored aggregated stats cache (from persistent storage)
let storedStats = null;

// Full merged video list for analytics (hybrid: IndexedDB + storage.local).
// Populated by updateAnalytics() when the Analytics tab is shown.
let analyticsAllVideos = null;

// Default settings
const DEFAULT_SETTINGS = {
    autoCleanPeriod: 'forever',
    paginationCount: 10,
    themePreference: 'system', // 'system', 'light', or 'dark'
    overlayTitle: 'viewed',
    overlayColor: 'blue',
    overlayLabelSize: 'medium',
    debug: false,
    pauseHistoryInPlaylists: false,
    localFeedEnabled: true,
    hideAccountUI: false,
    hideRecommendations: true,
    feedRefreshMinutes: 60
};

// Get version from manifest
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

const OVERLAY_LABEL_SIZE_MAP = {
    small: {fontSize: 12, bar: 2},
    medium: {fontSize: 16, bar: 3},
    large: {fontSize: 22, bar: 4},
    xlarge: {fontSize: 28, bar: 5}
};

// Color mapping for overlay colors
const OVERLAY_COLORS = {
    red: '#ff4e45',
    blue: '#3ea6ff',
    yellow: '#ffd54f',
    green: '#2ecc71',
    orange: '#ff9f2f',
    purple: '#a970ff',
    pink: '#ff5fa2',
    brown: '#b9855a'
};

const POPUP_ACCENT_COLORS = {
    red: { main: '#ff4e45', hover: '#ff7069', text: '#ffffff' },
    blue: { main: '#3ea6ff', hover: '#65b8ff', text: '#ffffff' },
    yellow: { main: '#ffd54f', hover: '#ffe17a', text: '#111111' },
    green: { main: '#2ecc71', hover: '#55d98b', text: '#ffffff' },
    orange: { main: '#ff9f2f', hover: '#ffb45c', text: '#ffffff' },
    purple: { main: '#a970ff', hover: '#bd91ff', text: '#ffffff' },
    pink: { main: '#ff5fa2', hover: '#ff82b7', text: '#ffffff' },
    brown: { main: '#b9855a', hover: '#c99d78', text: '#ffffff' }
};

function applyPopupAccent(colorName) {
    const color = POPUP_ACCENT_COLORS[colorName] || POPUP_ACCENT_COLORS.blue;
    document.documentElement.dataset.accent = colorName || 'blue';
    const style = document.documentElement.style;
    style.setProperty('--accent', color.main);
    style.setProperty('--button-bg', color.main);
    style.setProperty('--button-hover', color.hover);
    style.setProperty('--button-hover-bg', color.hover);
    style.setProperty('--link-color', color.main);
    style.setProperty('--link-hover-color', color.hover);
    style.setProperty('--message-border', color.main);

    let override = document.getElementById('ytvht-popup-accent');
    if (!override) {
        override = document.createElement('style');
        override.id = 'ytvht-popup-accent';
        document.head.appendChild(override);
    }
    override.textContent = `
        .tab { color: ${color.main} !important; }
        .tab.active, .primary-button { background: ${color.main} !important; border-color: ${color.main} !important; color: ${color.text || '#fff'} !important; }
        .video-link, .analytics-value { color: ${color.main} !important; }
        .video-progress-fill, .analytics-bar-fill { background: ${color.main} !important; }
    `;
}

// Apply the saved popup color immediately, independently of the popup's larger
// history-loading startup. This also keeps an already-open popup in sync.
function initializePopupAccent() {
    try {
        chrome.storage.local.get(['settings', 'popupAccentColor'], (result) => {
            const settings = (result && result.settings) || {};
            applyPopupAccent(result.popupAccentColor || settings.accentColor || settings.overlayColor || 'blue');
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.popupAccentColor) {
                applyPopupAccent(changes.popupAccentColor.newValue || 'blue');
                return;
            }
            if (changes.settings && changes.settings.newValue) {
                const settings = changes.settings.newValue;
                applyPopupAccent(settings.accentColor || settings.overlayColor || 'blue');
            }
        });
    } catch (error) {
        console.warn('[Popup] Could not initialize accent color:', error);
    }
}
initializePopupAccent();

// Show message
function showMessage(message, type = 'success') {
    log('Showing message:', {message, type});
    const messageDiv = document.getElementById('ytvhtMessage');
    if (!messageDiv) {
        console.error('[ythdb-popup] Message div not found!');
        return;
    }
    messageDiv.textContent = message;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

function sendToContentScript(message, callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        if (!tabs[0]) {
            showMessage('No active tab found.', 'error');
            return;
        }
        log('Sending message to content script:', message);
        chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
            log('Received response from content script:', response, chrome.runtime.lastError);
            callback(response);
        });
    });
}

// Send message to content script with retry
function sendToContentScriptWithRetry(message, callback, retries = 3, delay = 500) {
    log('Sending message to content script:', message);

    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        if (!tabs[0]?.id) {
            log('No active tab found');
            callback(null);
            return;
        }

        chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
            if (chrome.runtime.lastError) {
                log('Error sending message:', chrome.runtime.lastError);
                if (retries > 0) {
                    log(`Retrying in ${delay}ms... (${retries} retries left)`);
                    setTimeout(() => {
                        sendToContentScriptWithRetry(message, callback, retries - 1, delay);
                    }, delay);
                } else {
                    callback(null);
                }
                return;
            }
            log('Received response from content script:', response);
            callback(response);
        });
    });
}

// Initialize storage and set up listeners
async function initStorage() {
    try {
        // Ensure migration is complete
        await ytStorage.ensureMigrated();

        // Load initial data
        await loadCurrentPages();

        // Set up message listener for updates
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'videoUpdateFromBackground') {
                log('Received video update from background:', message.data);
                updateVideoRecord(message.data);
            } else if (message.type === 'storageUpdate') {
                log('Received storage update:', message.changes);
                handleStorageUpdates(message.changes);
            }
        });

        // Get any updates that happened while popup was closed
        chrome.runtime.sendMessage({type: 'getLatestUpdate'}, (response) => {
            if (response?.lastUpdate) {
                log('Received latest update from background:', response.lastUpdate);
                updateVideoRecord(response.lastUpdate);
            }
        });

        // Set up storage change listener
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                const videoChanges = Object.entries(changes).filter(([key]) =>
                    key.startsWith('video_') || key.startsWith('playlist_')
                );

                if (videoChanges.length > 0) {
                    
                    // Process each change individually
                    videoChanges.forEach(([key, change]) => {
                        if (key.startsWith('video_')) {
                            const videoId = key.replace('video_', '');
                            if (change.newValue) {
                                // Check for tombstone before adding/updating
                                checkTombstoneAndUpdateVideo(videoId, change.newValue);
                            } else {
                                // Record was deleted
                                allHistoryRecords = allHistoryRecords.filter(r => r.videoId !== videoId);
                                allShortsRecords = allShortsRecords.filter(r => r.videoId !== videoId);
                                displayHistoryPage();
                                displayShortsPage();
                            }
                        }
                    });
                }
            }
        });

        return true;
    } catch (error) {
        console.error('Storage initialization failed:', error);
        return false;
    }
}

// Handle storage updates
function handleStorageUpdates(changes) {
    let needsRefresh = false;

    changes.forEach(([key, change]) => {
        if (key.startsWith('video_')) {
            const videoId = key.replace('video_', '');
            if (change.newValue) {
                // Update or add record
                updateVideoRecord(change.newValue);
            } else {
                // Record was deleted
                const index = allHistoryRecords.findIndex(r => r.videoId === videoId);
                if (index !== -1) {
                    allHistoryRecords.splice(index, 1);
                    needsRefresh = true;
                }
            }
        }
    });

    if (needsRefresh) {
        displayHistoryPage();
    }
}

// Check for tombstone before updating video record
async function checkTombstoneAndUpdateVideo(videoId, videoRecord) {
    try {
        // Get all storage data to check for tombstone
        const allData = await chrome.storage.local.get(null).catch(error => {
            if (error.message && error.message.includes('Extension context invalidated')) {
                
                return {};
            }
            throw error;
        });
        const tombstoneKey = `deleted_video_${videoId}`;

        if (allData[tombstoneKey]) {
            
            return; // Don't add video if tombstone exists
        }

        // No tombstone, safe to update
        updateVideoRecord(videoRecord);
    } catch (error) {
        console.error('Error checking tombstone:', error);
        // If we can't check tombstone, err on the side of caution and don't add
    }
}

// Update a single video record in the table
function updateVideoRecord(record) {
    if (!record || !record.videoId) return;

    log('Updating video record:', record);

    // Update the record in our local array
    const recordIndex = allHistoryRecords.findIndex(r => r.videoId === record.videoId);
    if (recordIndex !== -1) {
        allHistoryRecords[recordIndex] = record;
    } else {
        // New record, add it to the beginning and sort
        allHistoryRecords.unshift(record);
        allHistoryRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    // Find if the record is currently displayed
    const historyTable = document.getElementById('ytvhtHistoryTable');
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, allHistoryRecords.length);
    const recordPageIndex = recordIndex - startIdx;

    // Only update DOM if the record is on the current page
    if (recordIndex >= startIdx && recordIndex < endIdx) {
        const row = historyTable.rows[recordPageIndex];
        if (row) {
            const cell = row.cells[0];
            if (cell) {
                const link = cell.querySelector('.video-link');
                const progress = cell.querySelector('.video-progress');
                const date = cell.querySelector('.video-date');

                if (link) {
                    link.textContent = record.title || 'Unknown Title';
                    link.href = (record.time && record.time > 0) 
                        ? addTimestampToUrl(record.url, record.time)
                        : record.url;
                }

                if (progress) {
                    progress.textContent = formatProgress(record.time, record.duration);
                }

                if (date) {
                    date.textContent = formatDate(record.timestamp);
                }
            }
        }
    } else if (recordIndex === -1 && currentPage === 1) {
        // If it's a new record and we're on the first page, refresh the display
        displayHistoryPage();
    }
}

// Load history records
async function loadHistory(isInitialLoad = false) {
    try {
        log('Loading history from storage...');
        const allData = await chrome.storage.local.get(null).catch(error => {
            if (error.message && error.message.includes('Extension context invalidated')) {
                
                return {};
            }
            throw error;
        });

        // Extract videos and tombstones
        const videos = {};
        const tombstones = {};

        Object.keys(allData).forEach(key => {
            if (key.startsWith('video_')) {
                const videoId = key.replace('video_', '');
                videos[videoId] = allData[key];
            } else if (key.startsWith('deleted_video_')) {
                const videoId = key.replace('deleted_video_', '');
                tombstones[videoId] = allData[key];
            }
        });

        // Filter out videos that have active tombstones
        const filteredVideos = {};
        Object.keys(videos).forEach(videoId => {
            if (!tombstones[videoId]) {
                filteredVideos[`video_${videoId}`] = videos[videoId];
            } else {
                
            }
        });

        
        

        if (Object.keys(filteredVideos).length > 0) {
            // Show newest videos first for sync debugging
            const videoKeys = Object.keys(filteredVideos);
            const sortedKeys = videoKeys.sort((a, b) => (filteredVideos[b].timestamp || 0) - (filteredVideos[a].timestamp || 0));
            const newestKeys = sortedKeys.slice(0, 3);

            
        }

        if (!filteredVideos || Object.keys(filteredVideos).length === 0) {
            if (isInitialLoad) {
                showMessage(chrome.i18n.getMessage('history_no_history_found'), 'info');
            }
            allHistoryRecords = [];
            allShortsRecords = [];
        } else {
            const newRegularVideos = extractRegularVideoRecords(filteredVideos);
            const newShortsRecords = extractShortsRecords(filteredVideos);

            // Only sort and update if there are actual changes
            if (JSON.stringify(newRegularVideos) !== JSON.stringify(allHistoryRecords)) {
                allHistoryRecords = newRegularVideos;
                allHistoryRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                log('Updated regular videos history:', allHistoryRecords);
            }

            if (JSON.stringify(newShortsRecords) !== JSON.stringify(allShortsRecords)) {
                allShortsRecords = newShortsRecords;
                allShortsRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                log('Updated shorts history:', allShortsRecords);
            }
        }

        // Only reset to first page on initial load
        if (isInitialLoad) {
            currentPage = 1;
        }

        displayHistoryPage();
        displayShortsPage();
    } catch (error) {
        console.error('Error loading history:', error);
        if (isInitialLoad) {
            showMessage(chrome.i18n.getMessage('error_loading_history', [error.message || chrome.i18n.getMessage('unknown_error')]), 'error');
        }
    }
}
