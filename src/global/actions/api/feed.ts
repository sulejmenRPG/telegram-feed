import {
    addActionHandler, getGlobal, setGlobal,
} from '../../index';
import {
    selectChat,
    selectTabState,
    selectIsChatWithSelf,
} from '../../selectors';
import { callApi } from '../../../api/gramjs';
import { buildCollectionByKey } from '../../../util/iteratees';
import { addChatMessagesById } from '../../reducers';
import { getSearchResultKey, parseSearchResultKey } from '../../../util/keys/searchResultKey';
import type { ApiMessage } from '../../../api/types';
import { MAIN_THREAD_ID } from '../../../api/types';
import { updateTabState } from '../../reducers/tabs';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { isChatChannel, isChatGroup } from '../../helpers/chats';

addActionHandler('loadFeedMessages', async (global, actions, payload): Promise<void> => {
    const { tabId = getCurrentTabId() } = payload || {};

    const currentFeed = selectTabState(global, tabId).feed;

    global = updateTabState(global, {
        feed: {
            ...currentFeed,
            isLoading: true,
        },
    }, tabId);
    setGlobal(global);

    const state = getGlobal();
    const chatIds = state.chats.listIds.active || [];
    const excludedChatIds = selectTabState(state, tabId).feed.excludedChatIds || [];
    console.log('[Feed] Active chat IDs:', chatIds.length);
    console.log('[Feed] Excluded chat IDs:', excludedChatIds);

    const CHANNELS_TO_LOAD = 100; // Увеличено для более быстрой загрузки
    const MESSAGES_PER_CHANNEL = 50;  // Увеличено для более быстрой загрузки истории

    const allMessages: ApiMessage[] = [];

    // Filter for channels and groups only, exclude private chats and Saved Messages
    const channelAndGroupIds = chatIds.filter((chatId) => {
        const chat = state.chats.byId[chatId];
        if (!chat) return false;

        // Skip excluded channels
        if (excludedChatIds.includes(chatId)) {
            console.log(`[Feed] Skipping excluded channel: ${chat.title}`);
            return false;
        }

        // Skip "Saved Messages" (chat with self)
        const isSavedMessages = selectIsChatWithSelf(state, chatId);
        if (isSavedMessages) return false;

        // Only include channels and groups
        return isChatChannel(chat) || isChatGroup(chat);
    }).slice(0, CHANNELS_TO_LOAD);

    // console.log('[Feed] Loading messages for channels/groups:', channelAndGroupIds);

    try {
        await Promise.all(channelAndGroupIds.map(async (chatId) => {
            const chat = state.chats.byId[chatId];
            if (!chat) return;

            // console.log(`[Feed] Fetching messages for chat ${chatId} (${chat.title})...`);
            const result = await callApi('fetchMessages', {
                chat,
                threadId: MAIN_THREAD_ID,
                limit: MESSAGES_PER_CHANNEL,
            });

            if (result && result.messages) {
                // console.log(`[Feed] Fetched ${result.messages.length} messages for chat ${chatId}`);
                allMessages.push(...result.messages);

                // Update global message store
                global = getGlobal();
                global = addChatMessagesById(global, chatId, buildCollectionByKey(result.messages, 'id'));
                setGlobal(global);
            }
        }));

        // console.log('[Feed] All fetches completed. Total messages:', allMessages.length);

        // Sort by date ascending (oldest first, newest at bottom - like Telegram chats)
        allMessages.sort((a, b) => a.date - b.date);
        // console.log('[Feed] Messages sorted');

        // Filter grouped messages (albums) - keep the message with text
        const groupedMessages = new Map<string, ApiMessage[]>();
        const standaloneMessages: ApiMessage[] = [];

        // Group messages by groupedId
        allMessages.forEach((message) => {
            if (message.groupedId) {
                if (!groupedMessages.has(message.groupedId)) {
                    groupedMessages.set(message.groupedId, []);
                }
                groupedMessages.get(message.groupedId)!.push(message);
            } else {
                standaloneMessages.push(message);
            }
        });

        // console.log('[Feed] Grouping done. Groups:', groupedMessages.size, 'Standalone:', standaloneMessages.length);

        // For each group, try to find text in album or in next message
        const selectedGroupMessages: ApiMessage[] = [];
        const usedStandaloneIds = new Set<number>();

        groupedMessages.forEach((messages, groupId) => {
            // console.log(`[Feed] Album ${groupId} has ${messages.length} messages`);

            // Try to find message with text or caption in album
            let messageWithText = messages.find((msg) =>
                msg.content.text?.text ||
                msg.content.photo?.caption?.text ||
                msg.content.video?.caption?.text
            );

            let selected = messageWithText || messages[0];

            // If album has no text, try to find next standalone text message
            if (!messageWithText) {
                const albumMaxDate = Math.max(...messages.map(m => m.date));
                const nextTextMessage = standaloneMessages.find((msg) =>
                    msg.date > albumMaxDate &&
                    msg.content.text?.text &&
                    !msg.content.photo &&
                    !msg.content.video &&
                    !usedStandaloneIds.has(msg.id)
                );

                if (nextTextMessage) {
                    // console.log(`[Feed]   Found next text message: "${nextTextMessage.content.text?.text?.substring(0, 50)}..."`);
                    // Create a merged message: album media + next message text
                    selected = {
                        ...selected,
                        content: {
                            ...selected.content,
                            text: nextTextMessage.content.text,
                        },
                    };
                    usedStandaloneIds.add(nextTextMessage.id);
                }
            }

            selectedGroupMessages.push(selected);
        });

        // Filter out standalone messages that were used for albums
        const filteredStandaloneMessages = standaloneMessages.filter(msg => !usedStandaloneIds.has(msg.id));

        const filteredMessages = [...filteredStandaloneMessages, ...selectedGroupMessages].sort((a, b) => a.date - b.date);

        console.log(`[Feed] Total aggregated messages: ${allMessages.length}, after filtering albums: ${filteredMessages.length}`);

        const allMessageIds = filteredMessages.map(getSearchResultKey);

        // Filter messageIds based on excludedChatIds (client-side filtering for fast filter switching)
        const messageIds = excludedChatIds.length > 0
            ? allMessageIds.filter((key) => {
                const [chatId] = parseSearchResultKey(key as any);
                return !excludedChatIds.includes(chatId);
            })
            : allMessageIds;

        global = getGlobal();
        const finalFeed = selectTabState(global, tabId).feed;

        global = updateTabState(global, {
            feed: {
                ...finalFeed, // Preserve all fields including savedFilters, activeFilterId, scrollPosition
                allMessageIds, // Store all messages for fast client-side filtering
                messageIds, // Filtered messages based on current excludedChatIds
                isLoading: false,
                excludedChatIds,
            },
        }, tabId);
        setGlobal(global);
    } catch (err) {
        console.error('[Feed] Error loading messages:', err);
        global = getGlobal();
        const finalFeed = selectTabState(global, tabId).feed;
        global = updateTabState(global, {
            feed: {
                ...finalFeed,
                isLoading: false,
            },
        }, tabId);
        setGlobal(global);
    }
});

addActionHandler('loadMoreFeedMessages', async (global, actions, payload): Promise<void> => {
    const { tabId = getCurrentTabId() } = payload || {};
    const state = getGlobal();
    const feed = selectTabState(state, tabId).feed;

    if (feed.isLoadingMore || feed.isLoading) return;

    global = updateTabState(global, {
        feed: {
            ...feed,
            isLoadingMore: true,
        },
    }, tabId);
    setGlobal(global);

    const { messageIds, excludedChatIds } = feed;
    if (!messageIds.length) {
        actions.loadFeedMessages({ tabId });
        return;
    }

    // Get oldest message date
    const oldestKey = messageIds[0];
    const [chatId, messageId] = parseSearchResultKey(oldestKey as any);
    const oldestMessage = state.messages.byChatId[chatId]?.byId[messageId];

    if (!oldestMessage) {
        console.warn('[Feed] Oldest message not found in state');
        global = updateTabState(global, {
            feed: {
                ...feed,
                isLoadingMore: false,
            },
        }, tabId);
        setGlobal(global);
        return;
    }

    const maxDate = oldestMessage.date;
    console.log(`[Feed] Loading more messages older than date: ${maxDate} (${new Date(maxDate * 1000).toLocaleString()})`);

    const chatIds = state.chats.listIds.active || [];
    const CHANNELS_TO_LOAD = 100; // Увеличено для более быстрой пагинации
    const MESSAGES_PER_CHANNEL = 50;  // Увеличено для более глубокой истории

    const channelAndGroupIds = chatIds.filter((id) => {
        const chat = state.chats.byId[id];
        if (!chat) return false;
        if (excludedChatIds.includes(id)) return false;
        const isSavedMessages = selectIsChatWithSelf(state, id);
        if (isSavedMessages) return false;
        return isChatChannel(chat) || isChatGroup(chat);
    }).slice(0, CHANNELS_TO_LOAD);

    const newMessages: ApiMessage[] = [];

    try {
        await Promise.all(channelAndGroupIds.map(async (cid) => {
            const chat = state.chats.byId[cid];
            if (!chat) return;

            const result = await callApi('fetchMessages', {
                chat,
                threadId: MAIN_THREAD_ID,
                limit: MESSAGES_PER_CHANNEL,
                offsetDate: maxDate,
            });

            if (result && result.messages) {
                newMessages.push(...result.messages);
                global = getGlobal();
                global = addChatMessagesById(global, cid, buildCollectionByKey(result.messages, 'id'));
                setGlobal(global);
            }
        }));

        console.log(`[Feed] Fetched ${newMessages.length} older messages`);

        if (newMessages.length === 0) {
            global = updateTabState(global, {
                feed: {
                    ...feed,
                    isLoadingMore: false,
                },
            }, tabId);
            setGlobal(global);
            return;
        }

        const existingMessages: ApiMessage[] = [];
        messageIds.forEach(key => {
            const [cid, mid] = parseSearchResultKey(key as any);
            const msg = state.messages.byChatId[cid]?.byId[mid];
            if (msg) existingMessages.push(msg);
        });

        const allMessages = [...newMessages, ...existingMessages];
        allMessages.sort((a, b) => a.date - b.date);

        const uniqueMessages = Array.from(new Map(allMessages.map(m => [getSearchResultKey(m), m])).values());
        uniqueMessages.sort((a, b) => a.date - b.date);

        // Group messages (reuse logic)
        const groupedMessages = new Map<string, ApiMessage[]>();
        const standaloneMessages: ApiMessage[] = [];

        uniqueMessages.forEach((message) => {
            if (message.groupedId) {
                if (!groupedMessages.has(message.groupedId)) {
                    groupedMessages.set(message.groupedId, []);
                }
                groupedMessages.get(message.groupedId)!.push(message);
            } else {
                standaloneMessages.push(message);
            }
        });

        const selectedGroupMessages: ApiMessage[] = [];
        const usedStandaloneIds = new Set<number>();

        groupedMessages.forEach((messages) => {
            let messageWithText = messages.find((msg) =>
                msg.content.text?.text ||
                msg.content.photo?.caption?.text ||
                msg.content.video?.caption?.text
            );

            let selected = messageWithText || messages[0];

            if (!messageWithText) {
                const albumMaxDate = Math.max(...messages.map(m => m.date));
                const nextTextMessage = standaloneMessages.find((msg) =>
                    msg.date > albumMaxDate &&
                    msg.content.text?.text &&
                    !msg.content.photo &&
                    !msg.content.video &&
                    !usedStandaloneIds.has(msg.id)
                );

                if (nextTextMessage) {
                    selected = {
                        ...selected,
                        content: {
                            ...selected.content,
                            text: nextTextMessage.content.text,
                        },
                    };
                    usedStandaloneIds.add(nextTextMessage.id);
                }
            }
            selectedGroupMessages.push(selected);
        });

        const filteredStandaloneMessages = standaloneMessages.filter(msg => !usedStandaloneIds.has(msg.id));
        const filteredMessages = [...filteredStandaloneMessages, ...selectedGroupMessages].sort((a, b) => a.date - b.date);

        const newAllMessageIds = filteredMessages.map(getSearchResultKey);

        // Apply client-side filtering based on current excludedChatIds
        const newMessageIds = excludedChatIds.length > 0
            ? newAllMessageIds.filter((key) => {
                const [chatId] = parseSearchResultKey(key as any);
                return !excludedChatIds.includes(chatId);
            })
            : newAllMessageIds;

        global = getGlobal();
        const finalFeed = selectTabState(global, tabId).feed;

        global = updateTabState(global, {
            feed: {
                ...finalFeed,
                allMessageIds: newAllMessageIds, // Update all messages
                messageIds: newMessageIds, // Update filtered messages
                isLoadingMore: false,
            },
        }, tabId);
        setGlobal(global);

    } catch (err) {
        console.error('[Feed] Error loading more messages:', err);
        global = getGlobal();
        const finalFeed = selectTabState(global, tabId).feed;
        global = updateTabState(global, {
            feed: {
                ...finalFeed,
                isLoadingMore: false,
            },
        }, tabId);
        setGlobal(global);
    }
});
