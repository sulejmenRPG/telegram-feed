import type { FC } from '../../lib/teact/teact';
import React from '../../lib/teact/teact';

import './FeedItemSkeleton.scss';

const FeedItemSkeleton: FC = () => {
    return (
        <div className="feed-item">
            <div className="feed-item-bubble skeleton">
                <div className="feed-item-header">
                    <div className="skeleton-avatar" />
                    <div className="feed-item-info">
                        <div className="skeleton-title" />
                        <div className="skeleton-date" />
                    </div>
                </div>
                <div className="skeleton-text">
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                </div>
                <div className="skeleton-media" />
            </div>
        </div>
    );
};

export default FeedItemSkeleton;
