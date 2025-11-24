import { addActionHandler, getGlobal, setGlobal } from '../../index';
import { updateTabState } from '../../reducers/tabs';
import { selectTabState } from '../../selectors';
import type { ActionReturnType } from '../../types';
import { getCurrentTabId } from '../../../util/establishMultitabRole';

addActionHandler('toggleFeed', (global, actions, payload): ActionReturnType => {
    const { tabId = getCurrentTabId() } = payload || {};
    const tabState = selectTabState(global, tabId);

    // If closing, trigger animation first
    if (tabState.isFeedOpen) {
        // Set isClosing flag
        global = updateTabState(global, {
            feed: {
                ...tabState.feed,
                isClosing: true,
            },
        }, tabId);

        // Wait for animation to complete (300ms) then actually close
        setTimeout(() => {
            const currentGlobal = getGlobal();
            setGlobal(updateTabState(currentGlobal, {
                isFeedOpen: false,
                feed: {
                    ...selectTabState(currentGlobal, tabId).feed,
                    isClosing: false,
                },
            }, tabId));
        }, 300);

        return global;
    }

    // If opening, just open immediately (slide-in animation is in CSS)
    return updateTabState(global, {
        isFeedOpen: true,
        feed: {
            ...tabState.feed,
            isClosing: false,
        },
    }, tabId);
});

addActionHandler('setPreviousView', (global, actions, payload): ActionReturnType => {
    const { view, tabId = getCurrentTabId() } = payload!;
    const tabState = selectTabState(global, tabId);

    return updateTabState(global, {
        previousView: view,
    }, tabId);
});

addActionHandler('saveFeedScrollPosition', (global, actions, payload): ActionReturnType => {
    const { scrollPosition, tabId = getCurrentTabId() } = payload!;

    return updateTabState(global, {
        feed: {
            ...selectTabState(global, tabId).feed,
            scrollPosition,
        },
    }, tabId);
});
