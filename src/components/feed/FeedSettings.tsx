import React, { FC, memo, useCallback, useState, useMemo, useEffect } from '../../lib/teact/teact';

import { GlobalState } from '../../global/types';
import { selectTabState } from '../../global/selectors';
import { getActions, withGlobal } from '../../global';

import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import InputText from '../ui/InputText';

import './FeedSettings.scss';

type OwnProps = {
    isOpen: boolean;
    onClose: () => void;
};

type StateProps = {
    channelList: Array<{ id: string; title: string; isExcluded: boolean }>;
    savedFilters: { id: string; name: string; excludedChatIds: string[] }[];
    activeFilterId?: string;
    excludedChatIds: string[];
};

const FeedSettings: FC<OwnProps & StateProps> = ({
    isOpen,
    onClose,
    channelList,
    savedFilters,
    activeFilterId,
    excludedChatIds,
}) => {
    const {
        toggleFeedChannelExclusion,
        saveFeedFilter,
        deleteFeedFilter,
        applyFeedFilter,
        renameFeedFilter,
        updateFeedFilter,
        clearFeedFilter,
        detachFeedFilter,
        loadFeedMessages,
        showNotification,
    } = getActions();

    const [filterName, setFilterName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setShowSaveInput(false);
            setFilterName('');
            setEditingFilterId(null);
            setEditingName('');
            setSearchQuery('');
        }
    }, [isOpen]);

    // Update filter name input when active filter changes
    useEffect(() => {
        if (activeFilterId) {
            const activeFilter = savedFilters.find(f => f.id === activeFilterId);
            if (activeFilter) {
                setFilterName(activeFilter.name);
                setShowSaveInput(true);
            }
        } else {
            setFilterName('');
            setShowSaveInput(false);
        }
    }, [activeFilterId, savedFilters]);

    const filteredChannelList = useMemo(() => {
        if (!searchQuery) return channelList;
        const lowerQuery = searchQuery.toLowerCase();
        return channelList.filter(c => c.title.toLowerCase().includes(lowerQuery));
    }, [channelList, searchQuery]);

    const handleToggle = useCallback((chatId: string) => {
        toggleFeedChannelExclusion({ chatId });
    }, [toggleFeedChannelExclusion]);

    const handleSaveFilter = useCallback(() => {
        if (!filterName.trim()) return;

        console.log('[FeedSettings] Saving filter. Active filter ID:', activeFilterId);
        console.log('[FeedSettings] Current excludedChatIds:', excludedChatIds);

        if (activeFilterId) {
            // Update existing filter
            updateFeedFilter({ filterId: activeFilterId });
            // Also rename if name changed
            const activeFilter = savedFilters.find(f => f.id === activeFilterId);
            if (activeFilter && activeFilter.name !== filterName) {
                renameFeedFilter({ filterId: activeFilterId, newName: filterName });
            }
            // Reload feed to apply changes immediately
            loadFeedMessages();
            showNotification({ message: 'Фильтр сохранен' });
        } else {
            // Create new filter
            console.log('[FeedSettings] Creating new filter with excludedChatIds:', excludedChatIds);
            saveFeedFilter({ name: filterName });
            showNotification({ message: 'Новый фильтр создан' });
        }
    }, [filterName, activeFilterId, savedFilters, excludedChatIds, updateFeedFilter, renameFeedFilter, saveFeedFilter, loadFeedMessages, showNotification]);

    const handleCreateNew = useCallback(() => {
        detachFeedFilter({});
        setFilterName('');
        setShowSaveInput(true);
    }, [detachFeedFilter]);

    const handleDeleteFilter = useCallback((filterId: string) => {
        deleteFeedFilter({ filterId });
    }, [deleteFeedFilter]);

    const handleApplyFilter = useCallback((filterId: string) => {
        applyFeedFilter({ filterId });
    }, [applyFeedFilter]);

    const handleStartEditing = useCallback((filterId: string, currentName: string) => {
        setEditingFilterId(filterId);
        setEditingName(currentName);
    }, []);

    const handleSaveRename = useCallback(() => {
        if (!editingName.trim() || !editingFilterId) return;
        renameFeedFilter({ filterId: editingFilterId, newName: editingName });
        setEditingFilterId(null);
        setEditingName('');
    }, [editingFilterId, editingName, renameFeedFilter]);

    const handleCancelRename = useCallback(() => {
        setEditingFilterId(null);
        setEditingName('');
    }, []);

    const handleSelectAll = useCallback(() => {
        filteredChannelList.forEach(({ id, isExcluded }) => {
            if (isExcluded) {
                handleToggle(id);
            }
        });
    }, [filteredChannelList, handleToggle]);

    const handleDeselectAll = useCallback(() => {
        filteredChannelList.forEach(({ id, isExcluded }) => {
            if (!isExcluded) {
                handleToggle(id);
            }
        });
    }, [filteredChannelList, handleToggle]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            className="FeedSettings"
            title="Фильтр ленты"
        >
            <div className="FeedSettings-content custom-scroll">
                {savedFilters.length > 0 && (
                    <div className="FeedSettings-filters">
                        <div className="FeedSettings-filters-header">
                            <h4>Сохраненные фильтры</h4>
                        </div>
                        <div className="FeedSettings-filters-list">
                            {savedFilters.map((filter) => (
                                <div
                                    key={filter.id}
                                    className={`FeedSettings-filter-item ${activeFilterId === filter.id ? 'active' : ''} ${editingFilterId === filter.id ? 'editing' : ''}`}
                                    onClick={() => {
                                        if (editingFilterId === filter.id) return;
                                        console.log('[FeedSettings] Filter clicked:', filter.name, 'Active:', activeFilterId === filter.id);
                                        if (activeFilterId === filter.id) {
                                            clearFeedFilter();
                                        } else {
                                            handleApplyFilter(filter.id);
                                        }
                                    }}
                                >
                                    {editingFilterId === filter.id ? (
                                        <>
                                            <InputText
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveRename();
                                                    if (e.key === 'Escape') handleCancelRename();
                                                }}
                                            />
                                            <Button
                                                size="tiny"
                                                color="primary"
                                                ariaLabel="Сохранить"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSaveRename();
                                                }}
                                            >
                                                <i className="icon icon-check" />
                                            </Button>
                                            <Button
                                                size="tiny"
                                                color="translucent"
                                                ariaLabel="Отмена"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCancelRename();
                                                }}
                                            >
                                                <i className="icon icon-close" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            {activeFilterId === filter.id && (
                                                <i className="icon icon-check active-check" />
                                            )}
                                            <span>{filter.name}</span>
                                            <Button
                                                size="tiny"
                                                color="translucent"
                                                ariaLabel="Переименовать фильтр"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStartEditing(filter.id, filter.name);
                                                }}
                                            >
                                                <i className="icon icon-edit" />
                                            </Button>
                                            <Button
                                                size="tiny"
                                                color="translucent"
                                                ariaLabel="Удалить фильтр"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteFilter(filter.id);
                                                }}
                                            >
                                                <i className="icon icon-delete" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="FeedSettings-channels">
                    <div className="FeedSettings-channels-header">
                        <h4>Каналы ({filteredChannelList.length})</h4>
                    </div>

                    <div className="FeedSettings-search">
                        <InputText
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск каналов и групп..."
                        />
                    </div>

                    <div className="FeedSettings-save-input">
                        {activeFilterId ? (
                            <div className="FeedSettings-active-header">
                                <h4>Список каналов фильтра «{filterName}»</h4>
                            </div>
                        ) : (
                            <InputText
                                value={filterName}
                                onChange={(e) => setFilterName(e.target.value)}
                                placeholder="Название фильтра"
                            />
                        )}

                        <div className="FeedSettings-save-input-buttons">
                            <Button
                                size="smaller"
                                onClick={handleSaveFilter}
                                disabled={!activeFilterId && !filterName.trim()}
                            >
                                {activeFilterId ? 'Сохранить фильтр' : 'Сохранить фильтр'}
                            </Button>
                            {!activeFilterId && (
                                <Button
                                    size="smaller"
                                    color="translucent"
                                    onClick={() => {
                                        setFilterName('');
                                    }}
                                >
                                    Очистить
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="FeedSettings-channels-actions">
                        <Button
                            size="tiny"
                            color="translucent"
                            onClick={handleSelectAll}
                        >
                            Выбрать все
                        </Button>
                        <Button
                            size="tiny"
                            color="translucent"
                            onClick={handleDeselectAll}
                        >
                            Снять выделение
                        </Button>
                    </div>

                    <div className="FeedSettings-channels-list">
                        {filteredChannelList.map(({ id, title, isExcluded }) => (
                            <label key={id} className="FeedSettings-channel-item">
                                <Checkbox
                                    checked={!isExcluded}
                                    onCheck={() => handleToggle(id)}
                                />
                                <span className="FeedSettings-channel-title">{title}</span>
                            </label>
                        ))}
                        {filteredChannelList.length === 0 && (
                            <div className="FeedSettings-empty-search">
                                Ничего не найдено
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="FeedSettings-footer">
                <Button onClick={onClose}>Закрыть</Button>
            </div>
        </Modal>
    );
};

function mapStateToProps(global: GlobalState): StateProps {
    const state = selectTabState(global);
    const { excludedChatIds, savedFilters = [], activeFilterId } = state.feed;
    const activeChatIds = global.chats.listIds.active || [];
    const archivedChatIds = global.chats.listIds.archived || [];
    // Combine active and archived chats, removing duplicates just in case
    const allChatIds = Array.from(new Set([...activeChatIds, ...archivedChatIds]));

    const channelList = allChatIds
        .map((chatId) => {
            const chat = global.chats.byId[chatId];
            if (!chat) return null;

            // Include channels, supergroups, and basic groups
            const isApplicable =
                chat.type === 'chatTypeChannel' ||
                chat.type === 'chatTypeSuperGroup' ||
                chat.type === 'chatTypeBasicGroup';

            if (!isApplicable) return null;

            return {
                id: chatId,
                title: chat.title,
                isExcluded: excludedChatIds.includes(chatId),
            };
        })
        .filter(Boolean) as Array<{ id: string; title: string; isExcluded: boolean }>;

    return {
        channelList,
        savedFilters,
        activeFilterId,
        excludedChatIds,
    };
}

export default memo(withGlobal(mapStateToProps)(FeedSettings));
