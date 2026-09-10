import { extractMovieRatingFromItem } from '../sync/ratings.js';
import { bindHoverPreview } from '../preview/ui.js';
import { showSyncTargetDialog, showToast } from '../sync/dialogs.js';
import { CONFIG } from '../core/config.js';
import { updateFloatButtonCount, addFloatButton } from '../sync/dock.js';

function initMovieListPage() {
        const path = location.pathname;
        const search = location.search;

        // 精确判定：必须是具体的电影分类列表页，排除个人主页 overview 概览页
        const isCollect = path.includes('/collect') || search.includes('status=collect');
        const isWish = path.includes('/wish') || search.includes('status=wish');
        const isDo = path.includes('/do') || search.includes('status=do');
        const isTagOrDoulist = path.includes('/tag/') || path.includes('/doulist/');
        const isNormalSearch = (path.includes('/search') && !path.includes('/subject_search'));

        const isListPage = isCollect || isWish || isDo || isTagOrDoulist || isNormalSearch;

        // 如果不是具体分类列表（例如单纯的 /mine 概览页，或 /people/xxx/ 个人主页未带分类），直接退出，绝不误弹错误提示！
        if (!isListPage) {
            return;
        }

        // 极速就绪检测：避免硬性死等 2000ms，通常在 50~100ms 即可立即加载
        let checkAttempts = 0;
        const maxChecks = 20; // 20 * 50ms = 最多等待 1 秒
        const checkTimer = setInterval(function() {
            checkAttempts++;
            let $items = $('#content .article .item, .grid-view .item, .list-view .item, #content .item, .article .doulist-item, .article .subject-item');
            if ($items.length > 0) {
                clearInterval(checkTimer);
                setupMovieListPage($items, isWish);
            } else if (checkAttempts >= maxChecks) {
                clearInterval(checkTimer);
                // 达到最大尝试次数仍无项目，静默退出，严禁弹出错误 Toast 骚扰用户
                console.log('[Douban to IMDb] 当前列表未检测到电影项目');
            }
        }, 50);
    }

function setupMovieListPage($items, isWish, { appended = false } = {}) {
        console.log('[Douban to IMDb] 快速初始化电影列表，数量:', $items.length);

        $items.each(function(index) {
            const $item = $(this);
            const $title = $item.find('li.title a, .info h2 a, .title a, .hd a').first();

            if ($title.length) {
                if ($title.parent().find('.sync-imdb-btn').length > 0) {
                    return;
                }

                const movieUrl = $title.attr('href');
                const movieTitle = $title.find('em').text() || $title.text().trim();
                bindHoverPreview($title[0], 'douban', () => ({ title: movieTitle }));
                const rating = extractMovieRatingFromItem($item); // 智能提取评分：1~5，未评分为 null

                // 按钮文案：有实际评分显示“同步(4★)”，无评分在想看页显示“同步(想看)”，其他无评分显示“同步”
                let btnText = '同步';
                if (rating) {
                    btnText = '同步(' + rating + '★)';
                } else if (isWish) {
                    btnText = '同步(想看)';
                } else {
                    btnText = '同步';
                }

                const $btn = $('<button type="button" class="sync-imdb-btn">' + btnText + '</button>');
                $title.parent().append($btn);

                $btn.on('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if ($btn.hasClass('syncing')) return;

                    showSyncTargetDialog(function(target) {
                        if (!target) return; // 用户取消

                        const finalRating = (target === CONFIG.SYNC_TARGET.RATING && !rating) ? 5 : (rating || 5);

                        console.log('[Douban to IMDb] 开始同步:', movieTitle, '评分:', finalRating + '星', '目标:', target);
                        $btn.addClass('syncing').text('同步中...');

                        const syncUrl = movieUrl + '#sync-' + finalRating + '-' + target;
                        const a = document.createElement('a');
                        a.href = syncUrl;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';

                        const evt = new MouseEvent('click', {
                            ctrlKey: true,
                            metaKey: true,
                            bubbles: true,
                            cancelable: true
                        });
                        a.dispatchEvent(evt);

                        const targetText = target === CONFIG.SYNC_TARGET.RATING ? `已看(评分: ${finalRating * 2}分)` : '想看(Watchlist)';
                        showToast(`正在同步到${targetText}: ${movieTitle}`, 'success');

                        setTimeout(() => {
                            $btn.removeClass('syncing').addClass('synced').text('已同步✓');
                            updateFloatButtonCount();
                        }, CONFIG.BUTTON_STATE_UPDATE_DELAY);
                    });
                });
            }
        });

        if (appended) return; // 追加内容只挂载单片操作，不重复启动批量自动同步。
        // 添加右侧悬浮批量同步按钮
        addFloatButton();

        // 自动同步子页面检测与处理
        if (location.hash.startsWith('#auto-sync')) {
            console.log('[Douban to IMDb] 检测到自动同步标记，这是子页面');
            const hashParts = location.hash.split('-');
            const target = hashParts[2] || CONFIG.SYNC_TARGET.RATING;
            const batchId = 'batch-auto-' + Date.now();

            setTimeout(() => {
                const $syncButtons = $('.sync-imdb-btn').not('[data-dbm-page] .sync-imdb-btn, .syncing, .synced, .subject-action-sync-btn');
                const openedTabs = [];

                $syncButtons.each(function(index) {
                    const $btn = $(this);
                    setTimeout(() => {
                        if (!$btn.hasClass('syncing') && !$btn.hasClass('synced')) {
                            const movieTitle = $btn.parent().find('a em').text() || $btn.parent().find('a').text();
                            $btn.addClass('syncing').text('同步中...');

                            const movieUrl = $btn.parent().find('a').attr('href');
                            const $parentItem = $btn.closest('.item');
                            const itemRating = extractMovieRatingFromItem($parentItem) || 5;

                            const syncUrl = movieUrl + '#sync-' + itemRating + '-' + target + '-' + batchId + '-' + index;
                            const newTab = window.open(syncUrl, '_blank');

                            setTimeout(() => {
                                window.focus();
                            }, 100);

                            if (newTab) {
                                openedTabs.push({
                                    tab: newTab,
                                    button: $btn,
                                    startTime: Date.now()
                                });
                            }
                        }
                    }, index * CONFIG.MOVIE_SYNC_INTERVAL);
                });

                const checkInterval = setInterval(() => {
                    openedTabs.forEach((item, i) => {
                        if (item.tab && item.tab.closed) {
                            item.button.removeClass('syncing').addClass('synced').text('已同步✓');
                            openedTabs.splice(i, 1);
                        }
                    });

                    if (openedTabs.length === 0 && $syncButtons.length > 0) {
                        clearInterval(checkInterval);
                        console.log('[Douban to IMDb] 子页面同步完成');
                        document.title = '[已完成] ' + document.title;
                    }
                }, 1000);
            }, CONFIG.AUTO_SYNC_START_DELAY);
        }
    }


export { initMovieListPage, setupMovieListPage };
