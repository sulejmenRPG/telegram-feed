import { useState, useCallback, useRef, useLayoutEffect, useMemo } from '../lib/teact/teact';

interface VirtualizationOptions {
    estimatedItemHeight?: number;
    overscan?: number;
}

const DEFAULT_ITEM_HEIGHT = 350;
const DEFAULT_OVERSCAN = 5;

/**
 * Hook for virtualizing a list of items.
 * Only renders items visible in the viewport + overscan buffer.
 */
export default function useFeedVirtualization<T>(
    items: T[],
    containerRef: { current: HTMLDivElement | null },
    options: VirtualizationOptions = {}
) {
    const {
        estimatedItemHeight = DEFAULT_ITEM_HEIGHT,
        overscan = DEFAULT_OVERSCAN,
    } = options;

    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(800);

    // Update container height on resize
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const updateHeight = () => {
            setContainerHeight(container.clientHeight);
        };

        updateHeight();

        const resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [containerRef]);

    // Calculate visible range
    const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
        if (items.length === 0) {
            return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
        }

        const total = items.length * estimatedItemHeight;

        // Find first visible item
        let start = Math.floor(scrollTop / estimatedItemHeight);
        start = Math.max(0, start - overscan);

        // Find last visible item
        const visibleCount = Math.ceil(containerHeight / estimatedItemHeight);
        let end = Math.floor(scrollTop / estimatedItemHeight) + visibleCount;
        end = Math.min(items.length, end + overscan);

        const offset = start * estimatedItemHeight;

        return {
            startIndex: start,
            endIndex: end,
            offsetY: offset,
            totalHeight: total,
        };
    }, [items.length, containerHeight, scrollTop, overscan, estimatedItemHeight]);

    const handleScroll = useCallback((e: any) => {
        const target = e.currentTarget || e.target;
        if (target) {
            setScrollTop(target.scrollTop);
        }
    }, []);

    const visibleItems = useMemo(() => {
        return items.slice(startIndex, endIndex);
    }, [items, startIndex, endIndex]);

    const virtualContainerStyle = useMemo(() => ({
        height: totalHeight,
        position: 'relative' as const,
    }), [totalHeight]);

    const virtualContentStyle = useMemo(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        transform: `translateY(${offsetY}px)`,
    }), [offsetY]);

    return {
        visibleItems,
        virtualContainerStyle,
        virtualContentStyle,
        handleScroll,
    };
}
