import { showToast } from './dialogs.js';
import { extractMovieRatingFromItem } from './ratings.js';
import { showBatchSyncPageDialog } from './selection.js';
import { CONFIG } from '../core/config.js';
import { SyncProgressManager } from './progress.js';
import { updateFloatButtonCount } from './dock.js';

let testSyncStatus = {
        isTestPhase: false,
        testCount: 0,
        successCount: 0,
        failedCount: 0,
        canContinue: false
    };

function batchSyncCurrentPage() {
    const $syncButtons = $('.sync-imdb-btn').not('[data-dbm-page] .sync-imdb-btn, .syncing, .synced, .subject-sync-btn, .subject-info-sync-btn');
    const total = $syncButtons.length;
    
    if (total === 0) {
        showToast('本页没有需要同步的电影', 'error');
        return;
    }

    // 收集本页全部电影信息
    const movieList = [];
    $syncButtons.each(function(idx) {
        const $btn = $(this);
        const $item = $btn.closest('.item');
        const movieTitle = $btn.parent().find('a em').text() || $btn.parent().find('a').text() || $item.find('.title a').text() || '未知电影';
        const movieUrl = $btn.parent().find('a').attr('href') || $item.find('.title a').attr('href') || '';
        const posterUrl = $item.find('.pic img').attr('src') || $item.find('.nbg img').attr('src') || '';
        
        // 智能获取该条目的真实评分（无评分则为 null，不默认满分）
        const realRating = extractMovieRatingFromItem($item);
        
        movieList.push({
            id: idx,
            title: movieTitle.trim(),
            url: movieUrl,
            rating: realRating,
            hasRating: realRating !== null,
            poster: posterUrl,
            button: $btn
        });
    });

    // 弹出本页电影列表多选与目标设置对话框
    showBatchSyncPageDialog(movieList, function(selectedMovies, target) {
        if (!selectedMovies || selectedMovies.length === 0) return;

        const targetText = target === CONFIG.SYNC_TARGET.RATING ? '已看(评分)' : '想看(Watchlist)';
        const count = selectedMovies.length;
        
        // 为选中的电影补充 target
        selectedMovies.forEach(m => m.target = target);
        
        // 初始化进度面板
        SyncProgressManager.init(selectedMovies, target);
        
        showToast(`开始同步本页选中的 ${count} 部电影到${targetText}...`, 'success');
        
        // 生成批次ID
        const batchId = 'batch-' + Date.now();
        localStorage.setItem('douban-sync-batch-id', batchId);
        
        // 标记当前页面为主同步页面
        sessionStorage.setItem('is-main-sync-page', 'true');
        sessionStorage.setItem('main-sync-batch-id', batchId);
        
        // 初始化测试同步状态
        if (CONFIG.TEST_SYNC_ENABLED && count > CONFIG.TEST_SYNC_COUNT) {
            testSyncStatus = {
                isTestPhase: true,
                testCount: CONFIG.TEST_SYNC_COUNT,
                successCount: 0,
                failedCount: 0,
                canContinue: false
            };
            showToast(`先测试同步前 ${CONFIG.TEST_SYNC_COUNT} 部电影...`, 'success');
        } else {
            testSyncStatus = {
                isTestPhase: false,
                testCount: 0,
                successCount: 0,
                failedCount: 0,
                canContinue: true
            };
        }
        
        // 开始同步（测试阶段或全部选中的电影）
        const syncCount = testSyncStatus.isTestPhase ? CONFIG.TEST_SYNC_COUNT : selectedMovies.length;
        const openedTabs = []; // 存储打开的标签页引用
        
        for (let index = 0; index < syncCount; index++) {
            const movie = selectedMovies[index];
            
            setTimeout(() => {
                // 检查是否暂停
                if (SyncProgressManager.isPaused) {
                    console.log('[Douban to IMDb] 同步已暂停，跳过:', movie.title);
                    return;
                }
                
                SyncProgressManager.updateMovie(index, 'syncing');
                movie.button.addClass('syncing').text('同步中...');
                
                console.log('[Douban to IMDb] 批量同步:', movie.title, '目标:', target, 'BatchID:', batchId, 'Index:', index);
                
                // 打开详情页
                const syncRating = (movie.hasRating && movie.rating) ? movie.rating : 5;
                const syncUrl = movie.url + '#sync-' + syncRating + '-' + target + '-' + batchId + '-' + index;
                console.log('[Douban to IMDb] 打开详情页:', syncUrl);
                
                const newTab = window.open(syncUrl, '_blank');
                
                // 立即让主窗口重新获得焦点（实现后台打开效果）
                setTimeout(() => {
                    window.focus();
                }, 100);
                
                // 存储标签页引用和对应的电影索引
                if (newTab) {
                    openedTabs.push({
                        tab: newTab,
                        index: index,
                        movie: movie,
                        startTime: Date.now(),
                        lastResult: ''
                    });
                }
                
                // 尝试让当前页面保持焦点
                setTimeout(() => {
                    window.focus();
                }, 100);
            }, index * CONFIG.MOVIE_SYNC_INTERVAL);
        }
        
        // 定期检查标签页状态
        const checkInterval = setInterval(() => {
            openedTabs.forEach((item, i) => {
                if (item.tab && item.tab.closed) {
                    const movie = item.movie;
                    const index = item.index;
                    const elapsed = Date.now() - item.startTime;
                    
                    // 从 localStorage 读取结果
                    const resultKey = 'douban-sync-result-' + batchId + '-' + index;
                    const resultData = localStorage.getItem(resultKey);
                    
                    console.log('[Douban to IMDb] 标签页已关闭:', movie.title, '耗时:', elapsed + 'ms', 'data:', resultData);
                    
                    // 通过 localStorage 判断结果
                    let isSuccess = false;
                    let failReason = '';
                    
                    if (resultData) {
                        try {
                            const result = JSON.parse(resultData);
                            console.log('[Douban to IMDb] 读取到结果:', result);
                            
                            if (result.success) {
                                isSuccess = true;
                                failReason = 'Marked as success: ' + (result.result || 'success');
                            } else {
                                isSuccess = false;
                                failReason = 'Marked as failed: ' + (result.result || 'unknown');
                            }
                            
                            // 清理已使用的结果
                            localStorage.removeItem(resultKey);
                        } catch (e) {
                            console.error('[Douban to IMDb] 解析结果失败:', e);
                            isSuccess = false;
                            failReason = 'Failed to parse result';
                        }
                    } else if (elapsed > 30000) {
                        // 超过 30 秒仍未读取到结果，判断为超时失败
                        isSuccess = false;
                        failReason = 'Timeout (> 30s), no result found';
                    } else {
                        // 没有读取到结果，判断为失败
                        isSuccess = false;
                        failReason = 'No result found in localStorage';
                    }
                    
                    console.log('[Douban to IMDb] 判断结果:', isSuccess ? '成功' : '失败', '原因:', failReason);
                    
                    // 根据实际结果更新状态
                    if (isSuccess) {
                        movie.button.removeClass('syncing').addClass('synced').text('已同步✓');
                        SyncProgressManager.updateMovie(index, 'success');
                        
                        // 测试阶段统计
                        if (testSyncStatus.isTestPhase) {
                            testSyncStatus.successCount++;
                            console.log('[Douban to IMDb] 测试同步成功:', testSyncStatus.successCount, '/', testSyncStatus.testCount);
                            checkTestPhaseComplete(selectedMovies, batchId);
                        }
                    } else {
                        movie.button.removeClass('syncing').addClass('sync-failed').text('失败✗');
                        SyncProgressManager.updateMovie(index, 'failed');
                        console.error('[Douban to IMDb] 同步失败:', movie.title, '原因:', failReason);
                        
                        // 测试阶段统计
                        if (testSyncStatus.isTestPhase) {
                            testSyncStatus.failedCount++;
                            console.log('[Douban to IMDb] 测试同步失败:', testSyncStatus.failedCount, '/', testSyncStatus.testCount);
                            checkTestPhaseComplete(selectedMovies, batchId);
                        }
                    }
                    
                    updateFloatButtonCount();
                    
                    // 移除已处理的项
                    openedTabs.splice(i, 1);
                }
            });
            
            // 如果所有标签页都已处理，清除定时器
            if (openedTabs.length === 0) {
                clearInterval(checkInterval);
                console.log('[Douban to IMDb] 所有标签页已处理完成');
            }
        }, 1000); // 每秒检查一次
    });
}

function checkTestPhaseComplete(movieList, batchId) {
    const completed = testSyncStatus.successCount + testSyncStatus.failedCount;
    
    if (completed >= testSyncStatus.testCount) {
        testSyncStatus.isTestPhase = false;
        
        console.log('[Douban to IMDb] 测试阶段完成，成功:', testSyncStatus.successCount, '失败:', testSyncStatus.failedCount);
        
        if (testSyncStatus.successCount > 0) {
            // 至少有一个成功，继续同步剩余电影
            testSyncStatus.canContinue = true;
            showToast(`测试成功！${testSyncStatus.successCount}/${testSyncStatus.testCount} 部成功，继续同步剩余电影...`, 'success');
            
            // 继续同步剩余电影，target 已经在 movieList 中
            const target = movieList[0].target;
            console.log('[Douban to IMDb] 继续同步，使用 target:', target);
            continueRemainingSync(movieList, batchId, target);
        } else {
            // 全部失败，停止同步
            testSyncStatus.canContinue = false;
            showToast(`测试失败！前 ${testSyncStatus.testCount} 部全部失败，已停止同步`, 'error');
            SyncProgressManager.panel.find('.sync-progress-text').text(
                `测试失败，已停止同步（0/${testSyncStatus.testCount} 成功）`
            );
        }
    }
}

function continueRemainingSync(movieList, batchId, target) {
    const startIndex = CONFIG.TEST_SYNC_COUNT;
    
    console.log('[Douban to IMDb] 开始同步剩余电影，从索引', startIndex, '开始');
    
    const openedTabs = []; // 存储打开的标签页引用
    
    for (let i = startIndex; i < movieList.length; i++) {
        const movie = movieList[i];
        const index = i;
        
        setTimeout(() => {
            // 检查是否暂停
            if (SyncProgressManager.isPaused) {
                console.log('[Douban to IMDb] 同步已暂停，跳过:', movie.title);
                return;
            }
            
            SyncProgressManager.updateMovie(index, 'syncing');
            movie.button.addClass('syncing').text('同步中...');
            
            console.log('[Douban to IMDb] 批量同步:', movie.title, '目标:', target, 'BatchID:', batchId, 'Index:', index);
            
            const syncUrl = movie.url + '#sync-' + movie.rating + '-' + target + '-' + batchId + '-' + index;
            console.log('[Douban to IMDb] 打开详情页:', syncUrl);
            
            const newTab = window.open(syncUrl, '_blank');
            
            // 立即让主窗口重新获得焦点（实现后台打开效果）
            setTimeout(() => {
                window.focus();
            }, 100);
            
            // 存储标签页引用
            if (newTab) {
                openedTabs.push({
                    tab: newTab,
                    index: index,
                    movie: movie,
                    startTime: Date.now(),
                    lastResult: ''
                });
            }
            
            setTimeout(() => {
                window.focus();
            }, 100);
        }, (index - startIndex) * CONFIG.MOVIE_SYNC_INTERVAL);
    }
    
    // 定期检查标签页状态
    const checkInterval = setInterval(() => {
        openedTabs.forEach((item, i) => {
            if (item.tab && item.tab.closed) {
                const movie = item.movie;
                const index = item.index;
                const elapsed = Date.now() - item.startTime;
                
                // 从 localStorage 读取结果
                const resultKey = 'douban-sync-result-' + batchId + '-' + index;
                const resultData = localStorage.getItem(resultKey);
                
                console.log('[Douban to IMDb] 标签页已关闭:', movie.title, '耗时:', elapsed + 'ms', 'localStorage key:', resultKey);
                
                // 通过 localStorage 判断结果
                let isSuccess = false;
                let failReason = '';
                
                if (resultData) {
                    try {
                        const result = JSON.parse(resultData);
                        console.log('[Douban to IMDb] 读取到结果:', result);
                        
                        if (result.success) {
                            isSuccess = true;
                            failReason = 'Marked as success: ' + (result.result || 'success');
                        } else {
                            isSuccess = false;
                            failReason = 'Marked as failed: ' + (result.result || 'unknown');
                        }
                        
                        // 清理已使用的结果
                        localStorage.removeItem(resultKey);
                    } catch (e) {
                        console.error('[Douban to IMDb] 解析结果失败:', e);
                        isSuccess = false;
                        failReason = 'Failed to parse result';
                    }
                } else if (elapsed > 30000) {
                    // 超过 30 秒仍未读取到结果，判断为超时失败
                    isSuccess = false;
                    failReason = 'Timeout (> 30s), no result found';
                } else {
                    // 没有读取到结果，判断为失败
                    isSuccess = false;
                    failReason = 'No result found in localStorage';
                }
                
                console.log('[Douban to IMDb] 判断结果:', isSuccess ? '成功' : '失败', '原因:', failReason);
                
                // 根据实际结果更新状态
                if (isSuccess) {
                    movie.button.removeClass('syncing').addClass('synced').text('已同步✓');
                    SyncProgressManager.updateMovie(index, 'success');
                } else {
                    movie.button.removeClass('syncing').addClass('sync-failed').text('失败✗');
                    SyncProgressManager.updateMovie(index, 'failed');
                    console.error('[Douban to IMDb] 同步失败:', movie.title, '原因:', failReason);
                }
                
                updateFloatButtonCount();
                
                // 移除已处理的项
                openedTabs.splice(i, 1);
            }
        });
        
        // 如果所有标签页都已处理，清除定时器
        if (openedTabs.length === 0) {
            clearInterval(checkInterval);
            console.log('[Douban to IMDb] 所有剩余电影已处理完成');
        }
    }, 1000);
}


export { testSyncStatus, batchSyncCurrentPage, checkTestPhaseComplete, continueRemainingSync };
