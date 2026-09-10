import { showToast, showSyncTargetDialog, showConfirmDialog } from './dialogs.js';
import { batchSyncCurrentPage } from './batch.js';
import { CONFIG } from '../core/config.js';
import { SyncProgressManager } from './progress.js';
import { updateFloatButtonCount } from './dock.js';

function batchSyncAllPages() {
    // 获取总页数
    const totalPages = parseInt($('.paginator .thispage').attr('data-total-page')) || 1;
    const currentPage = parseInt($('.paginator .thispage').text()) || 1;
    
    if (totalPages === 1) {
        showToast('只有一页，将同步本页', 'success');
        batchSyncCurrentPage();
        return;
    }
    
    // 计算从当前页到最后一页的页数
    const remainingPages = totalPages - currentPage + 1;
    
    // 显示同步目标选择对话框
    showSyncTargetDialog(function(target) {
        if (!target) return; // 用户取消
        
        const targetText = target === CONFIG.SYNC_TARGET.RATING ? '已看(评分)' : '想看(Watchlist)';
        
        // 第一次确认
        showConfirmDialog(
            '确认同步所有页面',
            `确定要从第 ${currentPage} 页同步到第 ${totalPages} 页吗？\n\n共 ${remainingPages} 页，将打开 ${remainingPages - 1} 个新标签页。\n\n同步目标：IMDb ${targetText}`,
            function() {
                // 第二次确认
                showConfirmDialog(
                    '最后确认',
                    `最后确认：\n\n将同步第 ${currentPage}-${totalPages} 页（共 ${remainingPages} 页）\n同步到 IMDb ${targetText}\n\n点击"确定"开始同步，点击"取消"放弃操作。`,
                    function() {
                        // 开始同步
                        startSyncAllPages(target, totalPages, currentPage, targetText, remainingPages);
                    }
                );
            }
        );
    });
}

function startSyncAllPages(target, totalPages, currentPage, targetText, remainingPages) {
    showToast(`准备同步第 ${currentPage}-${totalPages} 页（共 ${remainingPages} 页）到${targetText}...`, 'success');
    
    // 收集当前页电影信息
    const movieList = [];
    const $syncButtons = $('.sync-imdb-btn').not('[data-dbm-page] .sync-imdb-btn, .syncing, .synced');
    
    $syncButtons.each(function() {
        const $btn = $(this);
        const movieTitle = $btn.parent().find('a em').text() || $btn.parent().find('a').text();
        const movieUrl = $btn.parent().find('a').attr('href');
        const $ratingSpan = $btn.closest('.item').find('span[class*="rating"]');
        let rating = 5;
        if ($ratingSpan.length) {
            const ratingClass = $ratingSpan.attr('class');
            const match = ratingClass.match(/rating(\d)-t/);
            if (match) {
                rating = parseInt(match[1]);
            }
        }
        
        movieList.push({
            title: movieTitle,
            url: movieUrl,
            rating: rating,
            button: $btn,
            page: currentPage
        });
    });
    
    // 添加后续页面的占位符
    for (let page = currentPage + 1; page <= totalPages; page++) {
        const pageMovieCount = CONFIG.MOVIES_PER_PAGE;
        for (let i = 0; i < pageMovieCount; i++) {
            movieList.push({
                title: `第 ${page} 页 - 电影 ${i + 1}`,
                url: '',
                rating: 5,
                button: null,
                page: page
            });
        }
    }
    
    // 初始化进度面板
    SyncProgressManager.init(movieList, target);
    
    // 同步当前页
    let currentIndex = 0;
    const openedTabs = []; // 存储打开的标签页引用
    
    $syncButtons.each(function(index) {
        const $btn = $(this);
        setTimeout(() => {
            SyncProgressManager.updateMovie(currentIndex, 'syncing');
            $btn.addClass('syncing').text('同步中...');
            
            const movie = movieList[currentIndex];
            console.log('[Douban to IMDb] 批量同步所有:', movie.title, '目标:', target);
            
            // 打开详情页（后台标签页）
            const syncUrl = movie.url + '#sync-' + movie.rating + '-' + target;
            const newTab = window.open(syncUrl, '_blank');
            
            // 立即让主窗口重新获得焦点（实现后台打开效果）
            setTimeout(() => {
                window.focus();
            }, 100);
            
            // 存储标签页引用
            if (newTab) {
                openedTabs.push({
                    tab: newTab,
                    index: currentIndex,
                    button: $btn,
                    movie: movie,
                    startTime: Date.now()
                });
            }
            
            currentIndex++;
        }, index * CONFIG.MOVIE_SYNC_INTERVAL);
    });
    
    // 定期检查当前页标签页状态
    const checkCurrentPageInterval = setInterval(() => {
        openedTabs.forEach((item, i) => {
            if (item.tab && item.tab.closed) {
                const elapsed = Date.now() - item.startTime;
                console.log('[Douban to IMDb] 标签页已关闭:', item.movie.title, '耗时:', elapsed + 'ms');
                
                // 标签页关闭，判断为成功
                item.button.removeClass('syncing').addClass('synced').text('已同步✓');
                SyncProgressManager.updateMovie(item.index, 'success');
                updateFloatButtonCount();
                
                // 移除已处理的项
                openedTabs.splice(i, 1);
            }
        });
        
        // 如果所有标签页都已处理，清除定时器
        if (openedTabs.length === 0 && currentIndex === $syncButtons.length) {
            clearInterval(checkCurrentPageInterval);
            console.log('[Douban to IMDb] 当前页所有电影已处理完成');
        }
    }, 1000);
    
    // 获取基础URL
    const baseUrl = location.pathname + location.search.split('?')[0];
    const urlParams = new URLSearchParams(location.search);
    
    // 等待当前页同步完成后，顺序打开后续页面
    const currentPageMovies = $syncButtons.length;
    const delayForCurrentPage = currentPageMovies * CONFIG.MOVIE_SYNC_INTERVAL + CONFIG.AUTO_SYNC_START_DELAY;
    
    setTimeout(() => {
        // 顺序打开页面的函数
        function openNextPage(page) {
            if (page > totalPages) {
                console.log('[Douban to IMDb] 所有页面已打开完成');
                showToast(`所有页面同步完成！`, 'success');
                return;
            }
            
            const start = (page - 1) * CONFIG.MOVIES_PER_PAGE;
            urlParams.set('start', start);
            const pageUrl = baseUrl + '?' + urlParams.toString();
            
            console.log('[Douban to IMDb] 打开第 ' + page + ' 页:', pageUrl);
            
            // 使用 window.open 后台打开，并保存标签页引用
            const newTab = window.open(pageUrl + '#auto-sync-' + target, '_blank');
            
            // 立即让主窗口重新获得焦点（实现后台打开效果）
            setTimeout(() => {
                window.focus();
            }, 100);
            
            // 监听该页面完成（通过检测页面标题变化）
            const checkInterval = setInterval(() => {
                try {
                    // 检查标签页是否已标记为完成
                    if (newTab && !newTab.closed && newTab.document && newTab.document.title.startsWith('[已完成]')) {
                        clearInterval(checkInterval);
                        console.log('[Douban to IMDb] 第 ' + page + ' 页已完成');
                        
                        // 询问用户是否继续下一页
                        const remainingPages = totalPages - page;
                        if (remainingPages > 0) {
                            showConfirmDialog(
                                '继续同步下一页？',
                                `第 ${page} 页已完成！\n\n还剩 ${remainingPages} 页未同步。\n\n是否继续同步第 ${page + 1} 页？`,
                                function() {
                                    // 用户确认，关闭当前子页面，继续下一页
                                    newTab.close();
                                    showToast(`开始同步第 ${page + 1} 页...`, 'success');
                                    openNextPage(page + 1);
                                },
                                function() {
                                    // 用户取消，关闭子页面，停止同步
                                    newTab.close();
                                    showToast(`已停止同步，完成了 ${page - currentPage + 1} 页`, 'success');
                                }
                            );
                        } else {
                            // 已经是最后一页，关闭子页面
                            newTab.close();
                            showToast(`所有页面同步完成！`, 'success');
                        }
                    } else if (newTab && newTab.closed) {
                        // 如果标签页被用户手动关闭，停止检测
                        clearInterval(checkInterval);
                        console.log('[Douban to IMDb] 第 ' + page + ' 页标签页被关闭');
                        showToast(`第 ${page} 页已关闭，停止同步`, 'error');
                    }
                } catch (e) {
                    // 跨域访问限制，无法读取标题，继续检测
                }
            }, 1000); // 每秒检查一次
        }
        
        // 从下一页开始顺序打开
        if (currentPage < totalPages) {
            openNextPage(currentPage + 1);
            showToast(`当前页同步完成，开始顺序同步后续页面...`, 'success');
        } else {
            showToast(`已是最后一页，同步完成！`, 'success');
        }
    }, delayForCurrentPage);
}


export { batchSyncAllPages, startSyncAllPages };
