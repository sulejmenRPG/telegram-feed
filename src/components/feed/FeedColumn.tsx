import type { FC } from '../../lib/teact/teact';
import React, { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';
import type { ApiMessage, ApiChat } from '../../api/types';
import { selectTabState, selectChatMessage, selectChat } from '../../global/selectors';
import { parseSearchResultKey } from '../../util/keys/searchResultKey';
import { getMessageMediaHash, getMediaThumbUri } from '../../global/helpers/messageMedia';
import useMedia from '../../hooks/useMedia';
import { requestMeasure, requestMutation } from '../../lib/fasterdom/fasterdom';

import Avatar from '../common/Avatar';
import Loading from '../ui/Loading';
import Button from '../ui/Button';
import FeedSettings from './FeedSettings';
import FeedItemSkeleton from './FeedItemSkeleton';
import FeedMessage from './FeedMessage';
import useFeedVirtualization from '../../hooks/useFeedVirtualization';

import './FeedColumn.scss';

type StateProps = {
    messageIds: string[];
    isLoading: boolean;
    messagesById: Record<string, { message: ApiMessage; chat: ApiChat }>;
    scrollPosition: number;
    savedFilters: any[];
    activeFilterId?: string;
    hasInitialScroll: boolean;
    isLoadingMore: boolean;
    isClosing: boolean;
};

const SCROLL_THRESHOLD = 500;

const FeedColumn: FC<StateProps> = ({
    messageIds,
    isLoading,
    messagesById,
    scrollPosition,
    savedFilters,
    activeFilterId,
    hasInitialScroll,
    isLoadingMore,
    isClosing,
}) => {
    const {
        loadFeedMessages,
        loadMoreFeedMessages,
        openChat,
        focusMessage,
        toggleFeed,
        setPreviousView,
        saveFeedScrollPosition,
        clearFeedFilter,
        setFeedInitialScroll,
        applyFeedFilter,
    } = getActions();

    // Fix: useRef<HTMLDivElement | null>
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const isScrollRestoredRef = useRef(false);
    const prevScrollHeightRef = useRef(0);
    const prevMessageCountRef = useRef(messageIds.length);

    // Swipe-to-Close state
    const [swipeDistance, setSwipeDistance] = useState(0);
    const mainRef = useRef<HTMLDivElement | null>(null);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const isSwipingRef = useRef(false);

    // Pull-to-Refresh state
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const pullStartY = useRef<number | null>(null);
    const PULL_THRESHOLD = 80;

    // New Posts Badge state
    const [newPostsCount, setNewPostsCount] = useState(0);
    const prevLastMessageIdRef = useRef<string | undefined>(undefined);

    // Polling for new messages
    useEffect(() => {
        const interval = setInterval(() => {
            if (!isLoading && !isLoadingMore) {
                loadFeedMessages();
            }
        }, 60000);
        return () => clearInterval(interval);
    }, [isLoading, isLoadingMore, loadFeedMessages]);

    // Track new posts
    useEffect(() => {
        const currentLastId = messageIds[messageIds.length - 1];
        const prevLastId = prevLastMessageIdRef.current;

        if (prevLastId && currentLastId && prevLastId !== currentLastId) {
            // If not loading history and length increased, assume new posts at bottom
            if (!isLoadingMore && messageIds.length > prevMessageCountRef.current) {
                const diff = messageIds.length - prevMessageCountRef.current;
                const container = containerRef.current;
                if (container) {
                    const { scrollTop, scrollHeight, clientHeight } = container;
                    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

                    if (distanceFromBottom > SCROLL_THRESHOLD) {
                        setNewPostsCount((prev) => prev + diff);
                    }
                }
            }
        }

        prevLastMessageIdRef.current = currentLastId;
    }, [messageIds, isLoadingMore]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const container = containerRef.current;
        if (!container) return;

        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        isSwipingRef.current = false;

        if (container.scrollTop === 0) {
            pullStartY.current = e.touches[0].clientY;
        } else {
            pullStartY.current = null;
        }
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (touchStartX.current === null || touchStartY.current === null) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartX.current;
        const diffY = currentY - touchStartY.current;

        // Determine if scrolling horizontally (swipe to close) or vertically
        if (!isSwipingRef.current && !pullStartY.current) {
            if (diffX > 10 && Math.abs(diffY) < diffX) {
                isSwipingRef.current = true;
                pullStartY.current = null; // Cancel pull-to-refresh if swiping horizontally
            }
        }

        if (isSwipingRef.current) {
            if (diffX > 0) {
                setSwipeDistance(diffX);
                if (e.cancelable) e.preventDefault();
            }
            return;
        }

        // Pull-to-refresh logic
        if (pullStartY.current !== null) {
            const pullDiff = currentY - pullStartY.current;
            if (pullDiff > 0 && Math.abs(diffX) < pullDiff) {
                // Add resistance
                const newDistance = Math.min(pullDiff * 0.5, 150);
                setPullDistance(newDistance);

                if (e.cancelable && pullDiff < 200) {
                    // e.preventDefault(); 
                }
            }
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        // Handle Swipe-to-Close
        if (isSwipingRef.current) {
            if (swipeDistance > 100) { // Threshold to close
                setPreviousView({ view: 'chat' }); // Or just close
                toggleFeed();
            }
            setSwipeDistance(0);
            isSwipingRef.current = false;
        }

        // Handle Pull-to-Refresh
        if (pullStartY.current !== null) {
            if (pullDistance > PULL_THRESHOLD) {
                setIsRefreshing(true);
                setPullDistance(60);
                loadFeedMessages();
                setTimeout(() => {
                    setIsRefreshing(false);
                    setPullDistance(0);
                }, 1500);
            } else {
                setPullDistance(0);
            }
            pullStartY.current = null;
        }

        touchStartX.current = null;
        touchStartY.current = null;
    }, [swipeDistance, pullDistance, loadFeedMessages, toggleFeed, setPreviousView]);

    // Handle scroll position adjustment when loading more messages
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Use requestMeasure to avoid stricterdom warnings
        requestMeasure(() => {
            const { scrollHeight } = container;
            const prevScrollHeight = prevScrollHeightRef.current;
            const prevMessageCount = prevMessageCountRef.current;

            if (messageIds.length > prevMessageCount && prevScrollHeight > 0) {
                const heightDifference = scrollHeight - prevScrollHeight;
                requestMeasure(() => {
                    const { scrollTop } = container;
                    if (heightDifference > 0 && scrollTop < 100) {
                        // Use requestMutation for DOM writes
                        requestMutation(() => {
                            container.scrollTop += heightDifference;
                        });
                    }
                });
            }

            prevScrollHeightRef.current = scrollHeight;
            prevMessageCountRef.current = messageIds.length;
        });
    }, [messageIds.length]);

    useEffect(() => {
        loadFeedMessages();
    }, []);

    // Auto-apply first saved filter on feed open if no active filter
    useEffect(() => {
        if (savedFilters.length > 0 && !activeFilterId && messageIds.length > 0) {
            applyFeedFilter({ filterId: savedFilters[0].id });
        }
    }, [savedFilters, activeFilterId, messageIds.length, applyFeedFilter]);

    // Restore saved scroll position when messages are loaded
    useEffect(() => {
        if (!isScrollRestoredRef.current && containerRef.current && scrollPosition > 0 && messageIds.length > 0) {
            // Use setTimeout to ensure DOM is updated
            setTimeout(() => {
                if (containerRef.current) {
                    containerRef.current.scrollTop = scrollPosition;
                    isScrollRestoredRef.current = true;
                }
            }, 100);
        }
    }, [scrollPosition, messageIds.length]);

    // Save scroll position when component unmounts
    useEffect(() => {
        return () => {
            isScrollRestoredRef.current = false;
            if (containerRef.current) {
                saveFeedScrollPosition({ scrollPosition: containerRef.current.scrollTop });
            }
        };
    }, [saveFeedScrollPosition]);

    // Initial scroll to bottom on first open (only if no saved position)
    useEffect(() => {
        if (!hasInitialScroll && messageIds.length > 0 && containerRef.current && scrollPosition === 0) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            setFeedInitialScroll();
        }
    }, [hasInitialScroll, messageIds.length, setFeedInitialScroll, scrollPosition]);

    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        setShowScrollButton(distanceFromBottom > SCROLL_THRESHOLD);

        if (distanceFromBottom < SCROLL_THRESHOLD) {
            setNewPostsCount(0);
        }

        // Load more when close to top (history)
        // Increased threshold to 1000px for smoother experience
        if (scrollTop < 1000 && !isLoadingMore && !isLoading && messageIds.length > 0) {
            loadMoreFeedMessages();
        }
    }, [isLoadingMore, isLoading, messageIds.length]);

    const scrollToBottom = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
        });
        setNewPostsCount(0);
    }, []);

    const handleNavigate = useCallback(
        (chatId: string, messageId: number) => {
            // Save scroll position BEFORE closing feed
            if (containerRef.current) {
                saveFeedScrollPosition({ scrollPosition: containerRef.current.scrollTop });
            }
            setPreviousView({ view: 'feed' });
            toggleFeed();
            openChat({ id: chatId });
            setTimeout(() => {
                focusMessage({ chatId, threadId: -1, messageId });
            }, 100);
        },
        [openChat, focusMessage, toggleFeed, setPreviousView, saveFeedScrollPosition]
    );

    const handleClearFilter = useCallback(() => {
        clearFeedFilter();
    }, [clearFeedFilter]);

    const activeFilter = savedFilters.find((f) => f.id === activeFilterId);

    // Prepare items for virtualization
    const feedItems = useMemo(() => {
        return messageIds.map((key) => {
            const data = messagesById[key];
            if (!data) return null;
            return { key, message: data.message, chat: data.chat };
        }).filter(Boolean) as Array<{ key: string; message: ApiMessage; chat: ApiChat }>;
    }, [messageIds, messagesById]);

    // Virtualization hook
    const {
        visibleItems,
        virtualContainerStyle,
        virtualContentStyle,
        handleScroll: handleVirtualScroll,
    } = useFeedVirtualization(feedItems, containerRef, {
        estimatedItemHeight: 350,
        overscan: 5,
    });

    // Combined scroll handler
    const handleCombinedScroll = useCallback((e: any) => {
        handleScroll();
        handleVirtualScroll(e);
    }, [handleScroll, handleVirtualScroll]);

    const content = useMemo(() => {
        if (isLoading && !messageIds.length) {
            // Show 5 skeleton items while loading
            return (
                <>
                    <FeedItemSkeleton />
                    <FeedItemSkeleton />
                    <FeedItemSkeleton />
                    <FeedItemSkeleton />
                    <FeedItemSkeleton />
                </>
            );
        }

        if (!messageIds.length) {
            return <div className="feed-empty">Нет сообщений</div>;
        }

        // Virtualized rendering - only render visible items with native Message!
        return (
            <div style={virtualContainerStyle as any}>
                <div style={virtualContentStyle as any}>
                    {visibleItems.map((item, idx) => (
                        <FeedMessage
                            key={item.key}
                            message={item.message}
                            chat={item.chat}
                            onNavigate={handleNavigate}
                            isFirstInGroup
                            isLastInGroup
                            appearanceOrder={visibleItems.length - idx}
                        />
                    ))}
                </div>
            </div>
        );
    }, [messageIds.length, isLoading, handleNavigate, visibleItems, virtualContainerStyle, virtualContentStyle]);

    return (
        <div className={`FeedColumn${isClosing ? ' closing' : ''}`}
            ref={mainRef}
            // Fix: cast style to any to avoid CSSProperties errors
            style={{ transform: swipeDistance > 0 ? `translateX(${swipeDistance}px)` : undefined } as any}
        >
            <div className="FeedColumn-header">
                <div className="FeedColumn-header-title">
                    <h3>Лента</h3>
                    {activeFilter && (
                        <span className="FeedColumn-active-filter">
                            <i className="icon icon-filter" />
                            {activeFilter.name}
                        </span>
                    )}
                </div>
                <div className="FeedColumn-header-actions">
                    {activeFilterId && (
                        <Button
                            round
                            size="smaller"
                            color="translucent"
                            ariaLabel="Очистить фильтр"
                            onClick={handleClearFilter}
                        >
                            <i className="icon icon-close" />
                        </Button>
                    )}
                    <Button
                        round
                        size="smaller"
                        color="translucent"
                        ariaLabel="Настройки ленты"
                        onClick={() => setIsSettingsOpen(true)}
                    >
                        <i className="icon icon-settings" />
                    </Button>
                    <Button
                        round
                        size="smaller"
                        color="translucent"
                        ariaLabel="Закрыть"
                        onClick={() => toggleFeed()}
                    >
                        <i className="icon icon-close" />
                    </Button>
                </div>
            </div>
            <div
                className="FeedColumn-content custom-scroll"
                ref={containerRef}
                onScroll={handleCombinedScroll}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div
                    className={`pull-to-refresh ${isRefreshing ? 'refreshing' : ''}`}
                    style={{ height: isRefreshing ? 60 : pullDistance } as any}
                >
                    <div className="pull-indicator" style={{ opacity: isRefreshing ? 1 : Math.min(pullDistance / 40, 1) } as any}>
                        {isRefreshing ? (
                            <Loading />
                        ) : (
                            <i
                                className="icon icon-arrow-down"
                                style={{ transform: `rotate(${pullDistance > 80 ? 180 : 0}deg)` } as any}
                            />
                        )}
                    </div>
                </div>

                {isLoadingMore && (
                    <div className="feed-loading-more">
                        <Loading />
                    </div>
                )}
                {content}
            </div>
            {showScrollButton && (
                <Button
                    className="FeedColumn-scroll-button"
                    round
                    size="smaller"
                    color="translucent"
                    ariaLabel="Scroll to bottom"
                    onClick={scrollToBottom}
                >
                    <i className="icon icon-arrow-down" />
                    {newPostsCount > 0 && (
                        <span className="scroll-button-badge">{newPostsCount}</span>
                    )}
                </Button>
            )}
            <FeedSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
};

function mapStateToProps(global: GlobalState): StateProps {
    const state = selectTabState(global);
    const { feed } = state;
    const { messageIds, isLoading, scrollPosition, savedFilters = [], activeFilterId, hasInitialScroll, isLoadingMore } = feed;

    const messagesById: Record<string, { message: ApiMessage; chat: ApiChat }> = {};

    messageIds.forEach((key) => {
        // Fix: cast key to any
        const [chatId, messageId] = parseSearchResultKey(key as any);
        const message = selectChatMessage(global, chatId, messageId);
        const chat = selectChat(global, chatId);

        if (message && chat) {
            messagesById[key] = {
                message,
                chat,
            };
        }
    });

    return {
        messageIds,
        isLoading,
        messagesById,
        scrollPosition,
        savedFilters,
        activeFilterId,
        hasInitialScroll,
        isLoadingMore,
        // Fix: cast feed to any to access isClosing if missing in type
        isClosing: (feed as any).isClosing || false,
    };
}

export default withGlobal(mapStateToProps)(FeedColumn);
