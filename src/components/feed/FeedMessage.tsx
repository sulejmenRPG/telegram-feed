import type { FC } from '../../lib/teact/teact';
import React, { memo, useCallback, useRef } from '../../lib/teact/teact';
import type { ApiMessage, ApiChat } from '../../api/types';
import type { ThreadId } from '../../types';
import { MAIN_THREAD_ID } from '../../api/types';

import Message from '../middle/message/Message';
import Avatar from '../common/Avatar';
import Button from '../ui/Button';

import './FeedMessage.scss';

type OwnProps = {
    message: ApiMessage;
    chat: ApiChat;
    onNavigate: (chatId: string, messageId: number) => void;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    appearanceOrder?: number;
};

const FeedMessage: FC<OwnProps> = ({
    message,
    chat,
    onNavigate,
    isFirstInGroup = true,
    isLastInGroup = true,
    appearanceOrder = 0,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleNavigateClick = useCallback(() => {
        onNavigate(chat.id, message.id);
    }, [chat.id, message.id, onNavigate]);

    return (
        <div className="FeedMessage" ref={containerRef}>
            {/* Channel header */}
            <div className="FeedMessage-header">
                <Avatar size="small" peer={chat} />
                <div className="FeedMessage-info">
                    <div className="FeedMessage-title">{chat.title}</div>
                    <div className="FeedMessage-date">
                        {new Date(message.date * 1000).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </div>
                </div>
            </div>

            {/* Native Message component */}
            <div className="FeedMessage-content">
                <Message
                    message={message}
                    threadId={MAIN_THREAD_ID as ThreadId}
                    messageListType="thread"
                    noComments
                    noReplies
                    appearanceOrder={appearanceOrder}
                    isJustAdded={false}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    isFirstInDocumentGroup={false}
                    isLastInDocumentGroup={true}
                    isLastInList={false}
                    noAvatars
                />
            </div>

            {/* Navigation button */}
            <div className="FeedMessage-footer">
                <Button
                    className="FeedMessage-goto"
                    size="tiny"
                    color="translucent"
                    onClick={handleNavigateClick}
                >
                    Перейти →
                </Button>
            </div>
        </div>
    );
};

export default memo(FeedMessage);
