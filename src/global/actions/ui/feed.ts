import {
    addActionHandler, getGlobal, setGlobal,
} from '../../index';
import {
    selectTabState,
} from '../../selectors';
import { updateTabState } from '../../reducers/tabs';
import type { ActionReturnType } from '../../types';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { parseSearchResultKey } from '../../../util/keys/searchResultKey';

const FEED_FILTERS_STORAGE_KEY = 'tt-feed-filters';
const MAX_FILTERS = 50; // Prevent localStorage overflow
const MAX_FILTER_NAME_LENGTH = 100; // Prevent excessively long names
const MAX_EXCLUDED_CHATS = 500; // Reasonable limit for excluded chats

// Helper to validate filter structure
function isValidFilter(filter: any): filter is { id: string; name: string; excludedChatIds: string[] } {
    return (
        filter &&
        typeof filter === 'object' &&
        typeof filter.id === 'string' &&
        filter.id.length > 0 &&
        filter.id.length < 100 &&
        typeof filter.name === 'string' &&
        filter.name.length > 0 &&
        filter.name.length <= MAX_FILTER_NAME_LENGTH &&
        Array.isArray(filter.excludedChatIds) &&
        filter.excludedChatIds.length <= MAX_EXCLUDED_CHATS &&
        filter.excludedChatIds.every((id: any) => typeof id === 'string' && id.length > 0 && id.length < 100)
    );
}

// Helper to save filters to localStorage
function saveFiltersToStorage(filters: Array<{ id: string; name: string; excludedChatIds: string[] }>) {
    try {
        // Limit number of filters
        const limitedFilters = filters.slice(0, MAX_FILTERS);
        localStorage.setItem(FEED_FILTERS_STORAGE_KEY, JSON.stringify(limitedFilters));
    } catch (err) {
        console.error('Failed to save feed filters to localStorage:', err);
        // If quota exceeded, try to save fewer filters
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            try {
                const reducedFilters = filters.slice(0, Math.floor(MAX_FILTERS / 2));
                localStorage.setItem(FEED_FILTERS_STORAGE_KEY, JSON.stringify(reducedFilters));
                console.warn('[Feed] Reduced filter count due to storage quota');
            } catch (retryErr) {
                console.error('[Feed] Failed to save even reduced filters:', retryErr);
            }
        }
    }
}

// Helper to load filters from localStorage
export function loadFiltersFromStorage(): Array<{ id: string; name: string; excludedChatIds: string[] }> {
    try {
        const stored = localStorage.getItem(FEED_FILTERS_STORAGE_KEY);
        if (!stored) return [];

        const parsed = JSON.parse(stored);

        // Validate that it's an array
        if (!Array.isArray(parsed)) {
            console.warn('[Feed] Invalid filters format in localStorage, resetting');
            return [];
        }

        // Validate and filter out invalid entries
        const validFilters = parsed.filter(isValidFilter);

        if (validFilters.length !== parsed.length) {
            console.warn(`[Feed] Removed ${parsed.length - validFilters.length} invalid filters`);
            // Save the cleaned up version
            saveFiltersToStorage(validFilters);
        }

        return validFilters.slice(0, MAX_FILTERS);
    } catch (err) {
        console.error('Failed to load feed filters from localStorage:', err);
        // Clear corrupted data
        try {
            localStorage.removeItem(FEED_FILTERS_STORAGE_KEY);
        } catch (removeErr) {
            // Ignore
        }
        return [];
    }
}

addActionHandler('toggleFeedChannelExclusion', (global, actions, payload): ActionReturnType => {
    const { chatId, tabId = getCurrentTabId() } = payload!;
    const { feed } = selectTabState(global, tabId);
    const { excludedChatIds } = feed;

    const newExcludedChatIds = excludedChatIds.includes(chatId)
        ? excludedChatIds.filter(id => id !== chatId)
        : [...excludedChatIds, chatId];

    return updateTabState(global, {
        feed: {
            ...feed,
            excludedChatIds: newExcludedChatIds,
        },
    }, tabId);
});

addActionHandler('saveFeedFilter', (global, actions, payload): ActionReturnType => {
    const { name, tabId = getCurrentTabId() } = payload!;
    const { feed } = selectTabState(global, tabId);
    const { excludedChatIds, savedFilters = [] } = feed;

    // Validate and sanitize filter name
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length === 0) {
        console.warn('[Feed] Cannot save filter with empty name');
        return global;
    }

    if (trimmedName.length > MAX_FILTER_NAME_LENGTH) {
        console.warn('[Feed] Filter name too long, truncating');
    }

    const sanitizedName = trimmedName.slice(0, MAX_FILTER_NAME_LENGTH);

    // Check if max filters reached
    if (savedFilters.length >= MAX_FILTERS) {
        console.warn('[Feed] Maximum number of filters reached');
        return global;
    }

    // Generate unique ID
    const id = `filter_${Date.now()}`;

    const newFilter = {
        id,
        name: sanitizedName,
        excludedChatIds: [...excludedChatIds].slice(0, MAX_EXCLUDED_CHATS), // Limit excluded chats
    };

    const updatedFilters = [...savedFilters, newFilter];

    // Save to localStorage
    saveFiltersToStorage(updatedFilters);

    return updateTabState(global, {
        feed: {
            ...feed,
            savedFilters: updatedFilters,
        },
    }, tabId);
});

addActionHandler('deleteFeedFilter', (global, actions, payload): ActionReturnType => {
    const { filterId, tabId = getCurrentTabId() } = payload!;
    const { feed } = selectTabState(global, tabId);
    const { savedFilters = [], activeFilterId } = feed;

    const newSavedFilters = savedFilters.filter(f => f.id !== filterId);

    // Save to localStorage
    saveFiltersToStorage(newSavedFilters);

    return updateTabState(global, {
        feed: {
            ...feed,
            savedFilters: newSavedFilters,
            activeFilterId: activeFilterId === filterId ? undefined : activeFilterId,
        },
    }, tabId);
});

addActionHandler('renameFeedFilter', (global, actions, payload): ActionReturnType => {
    const { filterId, newName, tabId = getCurrentTabId() } = payload!;
    const { feed } = selectTabState(global, tabId);
    const { savedFilters = [] } = feed;

    // Validate and sanitize new name
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName.length === 0) {
        console.warn('[Feed] Cannot rename filter to empty name');
        return global;
    }

    const sanitizedName = trimmedName.slice(0, MAX_FILTER_NAME_LENGTH);

    const updatedFilters = savedFilters.map(f =>
        f.id === filterId ? { ...f, name: sanitizedName } : f
    );

    // Save to localStorage
    saveFiltersToStorage(updatedFilters);

    return updateTabState(global, {
        feed: {
            ...feed,
            savedFilters: updatedFilters,
        },
    }, tabId);
});

addActionHandler('updateFeedFilter', (global, actions, payload): ActionReturnType => {
    const { filterId, tabId = getCurrentTabId() } = payload!;
    const { feed } = selectTabState(global, tabId);
    const { savedFilters = [], excludedChatIds } = feed;

    const updatedFilters = savedFilters.map(f =>
        f.id === filterId ? { ...f, excludedChatIds: [...excludedChatIds] } : f
    );

    // Save to localStorage
    saveFiltersToStorage(updatedFilters);

    return updateTabState(global, {
        feed: {
            ...feed,
            savedFilters: updatedFilters,
        },
    }, tabId);
});

addActionHandler('applyFeedFilter', (global, actions, payload): ActionReturnType => {
    const { filterId, tabId = getCurrentTabId() } = payload!;
    const { feed } = selectTabState(global, tabId);
    const { savedFilters = [], allMessageIds } = feed;

    const filter = savedFilters.find(f => f.id === filterId);
    if (!filter) return global;

    console.log('[Feed Filter] Applying filter:', filter.name);
    console.log('[Feed Filter] Excluded chat IDs:', filter.excludedChatIds);

    // Use allMessageIds if available, otherwise fallback to current messageIds
    const sourceMessageIds = allMessageIds.length > 0 ? allMessageIds : feed.messageIds;

    // CLIENT-SIDE FILTERING: Filter sourceMessageIds instead of reloading from server
    const messageIds = filter.excludedChatIds.length > 0
        ? sourceMessageIds.filter((key) => {
            const [chatId] = parseSearchResultKey(key as any);
            return !filter.excludedChatIds.includes(chatId);
        })
        : sourceMessageIds;

    console.log('[Feed Filter] Filtered from', sourceMessageIds.length, 'to', messageIds.length, 'messages (instant client-side filtering)');

    // Apply filter by setting excluded chat IDs and filtered messageIds
    global = updateTabState(global, {
        feed: {
            ...feed,
            savedFilters: [...savedFilters], // Explicitly preserve saved filters
            excludedChatIds: [...filter.excludedChatIds],
            messageIds, // Instantly filtered messages
            activeFilterId: filterId,
        },
    }, tabId);

    // No need to reload - filtering is instant!
    setGlobal(global);

    return global;
});

addActionHandler('clearFeedFilter', (global, actions, payload): ActionReturnType => {
    const { tabId = getCurrentTabId() } = payload || {};
    const { feed } = selectTabState(global, tabId);

    // Clear all exclusions - show all messages
    global = updateTabState(global, {
        feed: {
            ...feed,
            excludedChatIds: [],
            messageIds: feed.allMessageIds, // Show all messages instantly
            activeFilterId: undefined,
        },
    }, tabId);

    // No need to reload - just show all messages
    setGlobal(global);

    return global;
});

addActionHandler('detachFeedFilter', (global, actions, payload): ActionReturnType => {
    const { tabId = getCurrentTabId() } = payload || {};
    const { feed } = selectTabState(global, tabId);

    return updateTabState(global, {
        feed: {
            ...feed,
            activeFilterId: undefined,
        },
    }, tabId);
});

addActionHandler('setFeedInitialScroll', (global, actions, payload): ActionReturnType => {
    const { tabId = getCurrentTabId() } = payload || {};
    const { feed } = selectTabState(global, tabId);

    return updateTabState(global, {
        feed: {
            ...feed,
            hasInitialScroll: true,
        },
    }, tabId);
});
