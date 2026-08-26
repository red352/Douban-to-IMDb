// ==UserScript==
// @name         Douban to IMDb
// @version      2026.02.07
// @author       ryen
// @description  Sync Douban movie ratings to IMDb automatically - 自动同步豆瓣电影评分到IMDb
// @icon         https://pic1.zhimg.com/50/088ce5111d2958266db8675dfdba226c_720w.jpg
// @include      http*://www.imdb.com/*
// @include      http*://movie.douban.com/*
// @include      http*://search.douban.com/* 
// @copyright    2019+
// @run-at       document-idle
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.1.1/jquery.min.js
// @require      https://cdn.rawgit.com/jprichardson/string.js/master/dist/string.min.js
// ==/UserScript==

(function() {
    'use strict';
    
    // ==================== IMDb Link Back 功能 ====================
    // 将豆瓣电影页面的 IMDb 编号转换为可点击链接
    function addImdbLinkBack() {
        var items = document.querySelectorAll('#info .pl');
        var filtered = Array.from(items).filter(function(el) {
            return el.textContent.startsWith('IMDb'); // 找 IMDb 行
        });
        
        if (filtered.length) {
            var imdb = filtered[0].nextSibling;
            if (imdb && imdb.nodeType === 3) { // 3 = TEXT_NODE
                var imdbcode = imdb.textContent.trim(); // like "tt10370822"
                if (imdbcode && imdbcode.startsWith('tt')) {
                    var imdblink = document.createElement('span');
                    imdblink.innerHTML = ' <a href="https://www.imdb.com/title/' + imdbcode + '" target="_blank" rel="noopener noreferrer">' + imdbcode + '</a>';
                    imdb.parentNode.insertBefore(imdblink, imdb);
                    imdb.parentNode.removeChild(imdb);
                    console.log('[Douban to IMDb] IMDb 链接已添加:', imdbcode);
                }
            }
        }
    }
    // ============================================================
    
    // ==================== 配置参数 ====================
    const CONFIG = {
        // 同步延时设置
        MOVIE_SYNC_INTERVAL: 3000,        // 每部电影同步间隔（毫秒）默认3秒
        PAGE_OPEN_INTERVAL: 20000,        // 每页打开间隔（毫秒）默认20秒
        AUTO_CLOSE_DELAY: 5000,           // 自动同步完成后关闭标签页延迟（毫秒）默认5秒
        
        // 页面加载延时
        PAGE_LOAD_DELAY: 2000,            // 页面加载后等待时间（毫秒）默认2秒
        AUTO_SYNC_START_DELAY: 3000,      // 自动同步开始前延迟（毫秒）默认3秒
        
        // Toast 提示设置
        TOAST_DURATION: 3000,             // Toast 显示时长（毫秒）默认3秒
        TOAST_FADE_DURATION: 300,         // Toast 淡出动画时长（毫秒）
        
        // 按钮状态更新延时
        BUTTON_STATE_UPDATE_DELAY: 1500,  // 按钮状态更新延迟（毫秒）
        SYNC_COMPLETE_TOAST_DELAY: 1000,  // 同步完成提示延迟（毫秒）
        
        // IMDb 评分设置
        IMDB_RATE_CLICK_DELAY: 6000,      // IMDb 打开评分弹窗延迟（毫秒）
        IMDB_RATE_SELECT_DELAY: 7000,     // IMDb 选择评分延迟（毫秒）
        IMDB_RATE_SUBMIT_DELAY: 8000,     // IMDb 提交评分延迟（毫秒）
        IMDB_RATE_CHECK_INTERVAL: 500,    // IMDb 检查评分成功间隔（毫秒）
        IMDB_RATE_MAX_CHECK_TIME: 15000,  // IMDb 最大检查时间（毫秒）
        IMDB_RATE_SUCCESS_CLOSE_DELAY: 2000, // IMDb 评分成功后关闭延迟（毫秒）
        
        // IMDb Watchlist 设置
        IMDB_WATCHLIST_CLICK_DELAY: 3000, // IMDb 点击添加到 Watchlist 延迟（毫秒）
        IMDB_WATCHLIST_CLOSE_DELAY: 5000, // IMDb 添加到 Watchlist 后关闭延迟（毫秒）
        
        // 页面估算设置
        MOVIES_PER_PAGE: 15,              // 每页电影数量
        
        // 悬浮按钮位置
        FLOAT_BUTTON_RIGHT: 30,           // 悬浮按钮距离右侧距离（像素）
        FLOAT_BUTTON_GAP: 15,             // 悬浮按钮之间间距（像素）
        
        // 同步测试设置
        TEST_SYNC_COUNT: 3,               // 测试同步的电影数量（前N个）
        TEST_SYNC_ENABLED: true,          // 是否启用测试同步
        
        // 同步目标类型
        SYNC_TARGET: {
            RATING: 'rating',             // 同步到已看（评分）
            WATCHLIST: 'watchlist'        // 同步到想看（Watchlist）
        }
    };
    // ================================================
    
    // 测试同步状态
    let testSyncStatus = {
        isTestPhase: false,
        testCount: 0,
        successCount: 0,
        failedCount: 0,
        canContinue: false
    };
    
    console.log('[Douban to IMDb] 脚本已加载');
    console.log('[Douban to IMDb] 配置参数:', CONFIG);
    console.log('[Douban to IMDb] jQuery 版本:', typeof $ !== 'undefined' ? $.fn.jquery : '未加载');
    console.log('[Douban to IMDb] 当前 URL:', location.href);

//使用说明在最下面
let pathname = location.pathname

// Toast 提示函数
function showToast(message, type = 'success') {
    const toast = $('<div class="douban-toast"></div>');
    toast.text(message);
    toast.addClass(type === 'success' ? 'toast-success' : 'toast-error');
    $('body').append(toast);
    
    setTimeout(() => {
        toast.addClass('show');
    }, 100);
    
    setTimeout(() => {
        toast.removeClass('show');
        setTimeout(() => toast.remove(), CONFIG.TOAST_FADE_DURATION);
    }, CONFIG.TOAST_DURATION);
}

// 显示同步目标选择对话框
function showSyncTargetDialog(callback) {
    const dialog = $(`
        <div class="sync-target-dialog-overlay">
            <div class="sync-target-dialog">
                <h3>选择同步目标</h3>
                <p>请选择要同步到 IMDb 的位置：</p>
                <div class="sync-target-options">
                    <button class="sync-target-option" data-target="rating">
                        <span class="option-icon">⭐</span>
                        <span class="option-title">已看（评分）</span>
                        <span class="option-desc">同步评分到 IMDb History</span>
                    </button>
                    <button class="sync-target-option" data-target="watchlist">
                        <span class="option-icon">📋</span>
                        <span class="option-title">想看（Watchlist）</span>
                        <span class="option-desc">添加到 IMDb Watchlist</span>
                    </button>
                </div>
                <button class="sync-target-cancel">取消</button>
            </div>
        </div>
    `);
    
    $('body').append(dialog);
    
    setTimeout(() => {
        dialog.addClass('show');
    }, 10);
    
    // 显示同步目标选择对话框
    dialog.find('.sync-target-option').on('click', function() {
        const target = $(this).attr('data-target');
        // 不再修改全局变量，直接通过回调返回
        
        dialog.removeClass('show');
        setTimeout(() => {
            dialog.remove();
            callback(target);
        }, 300);
    });
    
    // 取消
    dialog.find('.sync-target-cancel').on('click', function() {
        dialog.removeClass('show');
        setTimeout(() => {
            dialog.remove();
            callback(null);
        }, 300);
    });
}

// 显示确认对话框
function showConfirmDialog(title, message, onConfirm, onCancel) {
    const dialog = $(`
        <div class="sync-target-dialog-overlay">
            <div class="sync-target-dialog confirm-dialog">
                <h3>${title}</h3>
                <p class="confirm-message">${message}</p>
                <div class="confirm-buttons">
                    <button class="confirm-btn confirm-yes">确定</button>
                    <button class="confirm-btn confirm-no">取消</button>
                </div>
            </div>
        </div>
    `);
    
    $('body').append(dialog);
    
    setTimeout(() => {
        dialog.addClass('show');
    }, 10);
    
    // 确定
    dialog.find('.confirm-yes').on('click', function() {
        dialog.removeClass('show');
        setTimeout(() => {
            dialog.remove();
            if (onConfirm) onConfirm();
        }, 300);
    });
    
    // 取消
    dialog.find('.confirm-no').on('click', function() {
        dialog.removeClass('show');
        setTimeout(() => {
            dialog.remove();
            if (onCancel) onCancel();
        }, 300);
    });
}

// 同步进度管理器
const SyncProgressManager = {
    panel: null,
    movies: [],
    stats: {
        total: 0,
        success: 0,
        failed: 0,
        pending: 0
    },
    isPaused: false,
    
    init: function(movieList, target) {
        this.movies = movieList.map(movie => ({
            ...movie,
            status: 'pending',
            target: target
        }));
        this.stats = {
            total: this.movies.length,
            success: 0,
            failed: 0,
            pending: this.movies.length
        };
        this.isPaused = false;
        this.createPanel();
        this.show();
    },
    
    createPanel: function() {
        const targetText = this.movies[0].target === CONFIG.SYNC_TARGET.RATING ? '已看(评分)' : '想看(Watchlist)';
        this.panel = $(`
            <div class="sync-progress-panel">
                <div class="sync-progress-header">
                    <h3>同步进度 - ${targetText}</h3>
                    <button class="sync-progress-close">×</button>
                </div>
                <div class="sync-progress-stats">
                    <div class="sync-stat-item">
                        <div class="sync-stat-number total">${this.stats.total}</div>
                        <div class="sync-stat-label">总计</div>
                    </div>
                    <div class="sync-stat-item">
                        <div class="sync-stat-number success">${this.stats.success}</div>
                        <div class="sync-stat-label">成功</div>
                    </div>
                    <div class="sync-stat-item">
                        <div class="sync-stat-number failed">${this.stats.failed}</div>
                        <div class="sync-stat-label">失败</div>
                    </div>
                    <div class="sync-stat-item">
                        <div class="sync-stat-number pending">${this.stats.pending}</div>
                        <div class="sync-stat-label">待处理</div>
                    </div>
                </div>
                <div class="sync-progress-bar-container">
                    <div class="sync-progress-bar">
                        <div class="sync-progress-bar-fill"></div>
                    </div>
                    <div class="sync-progress-text">准备开始...</div>
                </div>
                <div class="sync-progress-list"></div>
                <div class="sync-progress-actions">
                    <button class="sync-progress-btn primary sync-progress-pause-btn">⏸ 暂停</button>
                    <button class="sync-progress-btn secondary sync-progress-close-btn">关闭</button>
                </div>
            </div>
        `);
        
        $('body').append(this.panel);
        
        // 关闭按钮
        this.panel.find('.sync-progress-close, .sync-progress-close-btn').on('click', () => {
            this.hide();
        });
        
        // 暂停/继续按钮
        this.panel.find('.sync-progress-pause-btn').on('click', () => {
            this.togglePause();
        });
        
        // 渲染电影列表
        this.renderList();
    },
    
    togglePause: function() {
        this.isPaused = !this.isPaused;
        const $btn = this.panel.find('.sync-progress-pause-btn');
        
        if (this.isPaused) {
            $btn.html('▶ 继续');
            showToast('同步已暂停', 'success');
        } else {
            $btn.html('⏸ 暂停');
            showToast('同步已继续', 'success');
        }
    },
    
    renderList: function() {
        const list = this.panel.find('.sync-progress-list');
        list.empty();
        
        this.movies.forEach((movie, index) => {
            const statusText = movie.status === 'pending' ? '等待中' : 
                             movie.status === 'syncing' ? '同步中...' :
                             movie.status === 'success' ? '成功' : '失败';
            const icon = movie.status === 'pending' ? '⏳' :
                        movie.status === 'syncing' ? '🔄' :
                        movie.status === 'success' ? '✅' : '❌';
            
            const item = $(`
                <div class="sync-progress-item" data-index="${index}">
                    <span class="sync-progress-icon">${icon}</span>
                    <span class="sync-progress-movie">${movie.title}</span>
                    <span class="sync-progress-status ${movie.status}">${statusText}</span>
                </div>
            `);
            list.append(item);
        });
    },
    
    updateMovie: function(index, status) {
        if (index >= 0 && index < this.movies.length) {
            const oldStatus = this.movies[index].status;
            this.movies[index].status = status;
            
            // 更新统计
            if (oldStatus === 'pending') this.stats.pending--;
            if (status === 'success') this.stats.success++;
            if (status === 'failed') this.stats.failed++;
            
            this.updateStats();
            this.updateProgress();
            this.renderList();
        }
    },
    
    updateStats: function() {
        this.panel.find('.sync-stat-number.success').text(this.stats.success);
        this.panel.find('.sync-stat-number.failed').text(this.stats.failed);
        this.panel.find('.sync-stat-number.pending').text(this.stats.pending);
    },
    
    updateProgress: function() {
        const completed = this.stats.success + this.stats.failed;
        const percentage = Math.round((completed / this.stats.total) * 100);
        
        this.panel.find('.sync-progress-bar-fill').css('width', percentage + '%');
        this.panel.find('.sync-progress-text').text(
            `${completed} / ${this.stats.total} (${percentage}%)`
        );
        
        // 如果全部完成
        if (completed === this.stats.total) {
            this.panel.find('.sync-progress-text').text(
                `同步完成！成功 ${this.stats.success} 部，失败 ${this.stats.failed} 部`
            );
            this.panel.find('.sync-progress-pause-btn').prop('disabled', true).css('opacity', '0.5');
        }
    },
    
    show: function() {
        if (this.panel) {
            this.panel.addClass('show');
        }
    },
    
    hide: function() {
        if (this.panel) {
            this.panel.removeClass('show');
            setTimeout(() => {
                this.panel.remove();
                this.panel = null;
            }, 300);
        }
    }
};

// 批量同步本页函数
function batchSyncCurrentPage() {
    const $syncButtons = $('.sync-imdb-btn').not('.syncing, .synced');
    const total = $syncButtons.length;
    
    if (total === 0) {
        showToast('本页没有需要同步的电影', 'error');
        return;
    }
    
    // 显示同步目标选择对话框（不需要二次确认）
    showSyncTargetDialog(function(target) {
        if (!target) return; // 用户取消
        
        const targetText = target === CONFIG.SYNC_TARGET.RATING ? '已看(评分)' : '想看(Watchlist)';
        
        // 收集电影信息
        const movieList = [];
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
                target: target  // 添加 target 属性
            });
        });
        
        // 初始化进度面板
        SyncProgressManager.init(movieList, target);
        
        showToast(`开始同步本页 ${total} 部电影到${targetText}...`, 'success');
        
        // 生成批次ID
        const batchId = 'batch-' + Date.now();
        localStorage.setItem('douban-sync-batch-id', batchId);
        
        // 标记当前页面为主同步页面
        sessionStorage.setItem('is-main-sync-page', 'true');
        sessionStorage.setItem('main-sync-batch-id', batchId);
        
        // 初始化测试同步状态
        if (CONFIG.TEST_SYNC_ENABLED && total > CONFIG.TEST_SYNC_COUNT) {
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
        
        // 开始同步（测试阶段或全部）
        const syncCount = testSyncStatus.isTestPhase ? CONFIG.TEST_SYNC_COUNT : movieList.length;
        const openedTabs = []; // 存储打开的标签页引用
        
        for (let index = 0; index < syncCount; index++) {
            const movie = movieList[index];
            
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
                const syncUrl = movie.url + '#sync-' + movie.rating + '-' + target + '-' + batchId + '-' + index;
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
                // 不再读取 window.name，改为检查 localStorage
                
                if (item.tab && item.tab.closed) {
                    const movie = item.movie;
                    const index = item.index;
                    const elapsed = Date.now() - item.startTime;
                    
                    // 从 localStorage 读取结果
                    const resultKey = 'douban-sync-result-' + batchId + '-' + index;
                    const resultData = localStorage.getItem(resultKey);
                    
                    // 调试：打印所有相关的 localStorage 键
                    console.log('[Douban to IMDb] 检查 localStorage，key:', resultKey);
                    console.log('[Douban to IMDb] localStorage 中所有键:', Object.keys(localStorage));
                    const allSyncKeys = Object.keys(localStorage).filter(k => k.startsWith('douban-sync-result-'));
                    console.log('[Douban to IMDb] 所有同步结果键:', allSyncKeys);
                    allSyncKeys.forEach(k => {
                        console.log('[Douban to IMDb] -', k, '=', localStorage.getItem(k));
                    });
                    
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
                    
                    console.log('[Douban to IMDb] 判断结果:', isSuccess ? '成功' : '失败', '原因:', failReason);
                    
                    // 根据实际结果更新状态
                    if (isSuccess) {
                        movie.button.removeClass('syncing').addClass('synced').text('已同步✓');
                        SyncProgressManager.updateMovie(index, 'success');
                        
                        // 测试阶段统计
                        if (testSyncStatus.isTestPhase) {
                            testSyncStatus.successCount++;
                            console.log('[Douban to IMDb] 测试同步成功:', testSyncStatus.successCount, '/', testSyncStatus.testCount);
                            checkTestPhaseComplete(movieList, batchId);
                        }
                    } else {
                        movie.button.removeClass('syncing').addClass('sync-failed').text('失败✗');
                        SyncProgressManager.updateMovie(index, 'failed');
                        console.error('[Douban to IMDb] 同步失败:', movie.title, '原因:', failReason);
                        
                        // 测试阶段统计
                        if (testSyncStatus.isTestPhase) {
                            testSyncStatus.failedCount++;
                            console.log('[Douban to IMDb] 测试同步失败:', testSyncStatus.failedCount, '/', testSyncStatus.testCount);
                            checkTestPhaseComplete(movieList, batchId);
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

// 检查测试阶段是否完成
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

// 继续同步剩余电影
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

// 批量同步所有页函数
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

// 执行同步所有页面
function startSyncAllPages(target, totalPages, currentPage, targetText, remainingPages) {
    showToast(`准备同步第 ${currentPage}-${totalPages} 页（共 ${remainingPages} 页）到${targetText}...`, 'success');
    
    // 收集当前页电影信息
    const movieList = [];
    const $syncButtons = $('.sync-imdb-btn').not('.syncing, .synced');
    
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

// 添加悬浮按钮
function addFloatButton() {
    // 获取总页数和当前页
    const totalPages = parseInt($('.paginator .thispage').attr('data-total-page')) || 1;
    const currentPage = parseInt($('.paginator .thispage').text()) || 1;
    const remainingPages = totalPages - currentPage + 1; // 计算剩余页数
    
    const $container = $(`
        <div class="batch-sync-float-container">
            <button class="batch-sync-float-btn sync-current">
                <span class="icon">⚡</span>
                <span class="text">同步本页</span>
                <span class="count">0</span>
            </button>
            <button class="batch-sync-float-btn sync-all">
                <span class="icon">🚀</span>
                <span class="text">同步所有</span>
                <span class="total-info">(${remainingPages}页)</span>
            </button>
        </div>
    `);
    
    $('body').append($container);
    
    // 更新待同步数量
    updateFloatButtonCount();
    
    // 同步本页按钮点击事件
    $container.find('.sync-current').on('click', function() {
        const $btn = $(this);
        if ($btn.hasClass('syncing')) return;
        
        $btn.addClass('syncing');
        $btn.find('.text').text('同步中...');
        
        batchSyncCurrentPage();
        
        setTimeout(() => {
            $btn.removeClass('syncing');
            $btn.find('.text').text('同步本页');
            updateFloatButtonCount();
        }, 3000);
    });
    
    // 同步所有按钮点击事件
    $container.find('.sync-all').on('click', function() {
        const $btn = $(this);
        if ($btn.hasClass('syncing')) return;
        
        $btn.addClass('syncing');
        $btn.find('.text').text('同步中...');
        
        batchSyncAllPages();
        
        setTimeout(() => {
            $btn.removeClass('syncing');
            $btn.find('.text').text('同步所有');
        }, 5000);
    });
}

// 更新悬浮按钮的待同步数量
function updateFloatButtonCount() {
    const count = $('.sync-imdb-btn').not('.synced').length;
    $('.sync-current .count').text(count);
    
    if (count === 0) {
        $('.sync-current').css('opacity', '0.5');
    } else {
        $('.sync-current').css('opacity', '1');
    }
}

// 添加 Toast 样式
GM_addStyle(`
    .douban-toast {
        position: fixed;
        bottom: 30px;
        right: 30px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 99999;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 300px;
    }
    .douban-toast.show {
        opacity: 1;
        transform: translateY(0);
    }
    .douban-toast.toast-success {
        background-color: #52c41a;
    }
    .douban-toast.toast-error {
        background-color: #ff4d4f;
    }
    
    /* 同步目标选择对话框样式 */
    .sync-target-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 100002;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    .sync-target-dialog-overlay.show {
        opacity: 1;
    }
    .sync-target-dialog {
        background: white;
        border-radius: 12px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        transform: scale(0.9);
        transition: transform 0.3s ease;
    }
    .sync-target-dialog-overlay.show .sync-target-dialog {
        transform: scale(1);
    }
    .sync-target-dialog h3 {
        margin: 0 0 10px 0;
        font-size: 24px;
        color: #333;
    }
    .sync-target-dialog p {
        margin: 0 0 20px 0;
        color: #666;
        font-size: 14px;
    }
    .sync-target-options {
        display: flex;
        gap: 15px;
        margin-bottom: 20px;
    }
    .sync-target-option {
        flex: 1;
        padding: 20px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }
    .sync-target-option:hover {
        border-color: #667eea;
        background: #f8f9ff;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }
    .sync-target-option .option-icon {
        font-size: 32px;
    }
    .sync-target-option .option-title {
        font-size: 16px;
        font-weight: bold;
        color: #333;
    }
    .sync-target-option .option-desc {
        font-size: 12px;
        color: #999;
        text-align: center;
    }
    .sync-target-cancel {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: white;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.3s ease;
    }
    .sync-target-cancel:hover {
        background: #f5f5f5;
        border-color: #999;
    }
    
    /* 确认对话框样式 */
    .confirm-dialog {
        max-width: 450px;
    }
    .confirm-message {
        font-size: 15px;
        line-height: 1.6;
        color: #333;
        margin-bottom: 25px;
        white-space: pre-line;
    }
    .confirm-buttons {
        display: flex;
        gap: 10px;
    }
    .confirm-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    .confirm-yes {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    .confirm-yes:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .confirm-no {
        background: #f5f5f5;
        color: #666;
        border: 1px solid #ddd;
    }
    .confirm-no:hover {
        background: #e8e8e8;
        border-color: #999;
    }
    
    .sync-imdb-btn {
        display: inline-block;
        margin-left: 10px;
        padding: 4px 10px;
        background: #0091EA;
        color: white;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
        border: none;
        transition: background 0.3s;
    }
    .sync-imdb-btn:hover {
        background: #0277BD;
    }
    .sync-imdb-btn.syncing {
        background: #999;
        cursor: not-allowed;
    }
    .sync-imdb-btn.synced {
        background: #52c41a;
        cursor: default;
    }
    .sync-imdb-btn.sync-failed {
        background: #ff4d4f;
        cursor: pointer;
    }
    .sync-imdb-btn.sync-failed:hover {
        background: #ff7875;
    }
    
    /* 悬浮按钮样式 */
    .batch-sync-float-container {
        position: fixed;
        right: ${CONFIG.FLOAT_BUTTON_RIGHT}px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: ${CONFIG.FLOAT_BUTTON_GAP}px;
    }
    .batch-sync-float-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 15px 25px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }
    .batch-sync-float-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }
    .batch-sync-float-btn:active {
        transform: scale(0.95);
    }
    .batch-sync-float-btn.syncing {
        background: linear-gradient(135deg, #999 0%, #666 100%);
        cursor: not-allowed;
    }
    .batch-sync-float-btn.sync-all {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
    }
    .batch-sync-float-btn.sync-all:hover {
        box-shadow: 0 6px 20px rgba(245, 87, 108, 0.6);
    }
    .batch-sync-float-btn .icon {
        font-size: 18px;
    }
    .batch-sync-float-btn .count {
        background: rgba(255, 255, 255, 0.3);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
    }
    .batch-sync-float-btn .total-info {
        font-size: 11px;
        opacity: 0.9;
    }
    
    /* 同步进度面板样式 */
    .sync-progress-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        padding: 30px;
        min-width: 500px;
        max-width: 700px;
        max-height: 80vh;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 100001;
        display: none;
    }
    .sync-progress-panel.show {
        display: block;
    }
    .sync-progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }
    .sync-progress-header h3 {
        margin: 0;
        font-size: 20px;
        color: #333;
    }
    .sync-progress-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #999;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        line-height: 30px;
        text-align: center;
        border-radius: 50%;
        transition: all 0.3s;
    }
    .sync-progress-close:hover {
        background: #f5f5f5;
        color: #333;
    }
    .sync-progress-stats {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
        padding: 15px;
        background: #f8f9ff;
        border-radius: 8px;
    }
    .sync-stat-item {
        flex: 1;
        text-align: center;
    }
    .sync-stat-number {
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 5px;
    }
    .sync-stat-number.total { color: #667eea; }
    .sync-stat-number.success { color: #52c41a; }
    .sync-stat-number.failed { color: #ff4d4f; }
    .sync-stat-number.pending { color: #999; }
    .sync-stat-label {
        font-size: 12px;
        color: #666;
    }
    .sync-progress-bar-container {
        margin-bottom: 20px;
    }
    .sync-progress-bar {
        height: 8px;
        background: #e8e8e8;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 10px;
    }
    .sync-progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        width: 0%;
        transition: width 0.3s ease;
    }
    .sync-progress-text {
        font-size: 14px;
        color: #666;
        text-align: center;
    }
    .sync-progress-list {
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 20px;
    }
    .sync-progress-item {
        padding: 10px;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .sync-progress-item:last-child {
        border-bottom: none;
    }
    .sync-progress-icon {
        font-size: 16px;
        width: 20px;
        text-align: center;
    }
    .sync-progress-movie {
        flex: 1;
        font-size: 14px;
        color: #333;
    }
    .sync-progress-status {
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 3px;
    }
    .sync-progress-status.syncing {
        background: #e6f7ff;
        color: #1890ff;
    }
    .sync-progress-status.success {
        background: #f6ffed;
        color: #52c41a;
    }
    .sync-progress-status.failed {
        background: #fff1f0;
        color: #ff4d4f;
    }
    .sync-progress-actions {
        display: flex;
        gap: 10px;
    }
    .sync-progress-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
    }
    .sync-progress-btn.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    .sync-progress-btn.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .sync-progress-btn.secondary {
        background: #f5f5f5;
        color: #666;
    }
    .sync-progress-btn.secondary:hover {
        background: #e8e8e8;
    }
`);

if (location.hostname == 'movie.douban.com' || location.hostname == 'search.douban.com') {

    GM_addStyle('#dale_movie_subject_inner_middle{display:none!important}');

    // 豆瓣搜索页面：如果来自 IMDb 或搜索词为 IMDb ID，则自动直达第一条电影详情页
    if (location.pathname.includes('/subject_search')) {
        const urlParams = new URLSearchParams(location.search);
        const searchText = (urlParams.get('search_text') || '').trim();
        const fromImdb = urlParams.get('from_imdb') === 'true';
        const isImdbId = /^tt\d+$/i.test(searchText);

        if (fromImdb || isImdbId) {
            console.log('[Douban to IMDb] 检测到 IMDb ID 搜索，准备自动直达详情页:', searchText);
            let redirected = false;

            const tryRedirect = function () {
                if (redirected) return true;
                
                const linkSelectors = [
                    '.item-root a.title-text',
                    '.item-root a[href*="/subject/"]',
                    '.result-list a[href*="/subject/"]',
                    '#root a[href*="/subject/"]'
                ];
                
                for (const selector of linkSelectors) {
                    const links = document.querySelectorAll(selector);
                    for (let i = 0; i < links.length; i++) {
                        const href = links[i].getAttribute('href');
                        if (href && /\/subject\/\d+/.test(href)) {
                            redirected = true;
                            console.log('[Douban to IMDb] 找到目标电影详情页，正在跳转:', href);
                            window.location.replace(href);
                            return true;
                        }
                    }
                }
                return false;
            };

            if (!tryRedirect()) {
                let attempts = 0;
                const maxAttempts = 60; // 最多等待 6 秒 (60 * 100ms)
                const timer = setInterval(function () {
                    attempts++;
                    if (tryRedirect() || attempts >= maxAttempts) {
                        clearInterval(timer);
                    }
                }, 100);

                const observer = new MutationObserver(function () {
                    if (tryRedirect()) {
                        observer.disconnect();
                        clearInterval(timer);
                    }
                });

                if (document.body) {
                    observer.observe(document.body, { childList: true, subtree: true });
                } else {
                    document.addEventListener('DOMContentLoaded', function () {
                        observer.observe(document.body, { childList: true, subtree: true });
                    });
                }
            }
        }
    }
    
    // 在"我看过的电影"页面和列表页面添加同步按钮
    if (location.pathname.includes('/mine') || 
        location.pathname.includes('/collect') || 
        location.pathname.includes('/wish') || 
        location.pathname.includes('/people/') ||
        (location.pathname.includes('/search') && !location.pathname.includes('/subject_search')) ||
        location.pathname.includes('/tag/')) {
        // 等待页面加载完成
        setTimeout(function() {
            console.log('[Douban to IMDb] 脚本开始执行');
            console.log('[Douban to IMDb] 当前URL:', location.href);
            
            // 尝试多种选择器
            let $items = $('#content .article .item');
            if ($items.length === 0) {
                $items = $('.grid-view .item');
            }
            if ($items.length === 0) {
                $items = $('.list-view .item');
            }
            if ($items.length === 0) {
                $items = $('#content .item');
            }
            
            console.log('[Douban to IMDb] 找到电影数量:', $items.length);
            
            if ($items.length === 0) {
                console.error('[Douban to IMDb] 未找到电影列表，请检查页面结构');
                showToast('未找到电影列表', 'error');
                return;
            }
            
            $items.each(function(index) {
                const $item = $(this);
                const $title = $item.find('li.title a, .info h2 a, .title a').first();
                
                if ($title.length) {
                    const movieUrl = $title.attr('href');
                    let rating = 5; // 默认5星
                    
                    // 查找评分 span (rating1-t 到 rating5-t)
                    const $ratingSpan = $item.find('span[class*="rating"]');
                    if ($ratingSpan.length) {
                        const ratingClass = $ratingSpan.attr('class');
                        const match = ratingClass.match(/rating(\d)-t/);
                        if (match) {
                            rating = parseInt(match[1]);
                        }
                    }
                    
                    const movieTitle = $title.find('em').text() || $title.text();
                    console.log('[Douban to IMDb] 处理电影 #' + (index + 1) + ':', movieTitle, '评分:', rating + '星');
                    
                    // 检查是否已添加按钮
                    if ($title.parent().find('.sync-imdb-btn').length > 0) {
                        console.log('[Douban to IMDb] 按钮已存在，跳过');
                        return;
                    }
                    
                    const $btn = $('<button class="sync-imdb-btn">同步(' + rating + '★)</button>');
                    $title.parent().append($btn);
                    console.log('[Douban to IMDb] 按钮已添加');
                    
                    $btn.on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if ($btn.hasClass('syncing')) return;
                        
                        // 显示同步目标选择对话框
                        showSyncTargetDialog(function(target) {
                            if (!target) return; // 用户取消
                            
                            console.log('[Douban to IMDb] 开始同步:', movieTitle, '评分:', rating + '星', '目标:', target);
                            $btn.addClass('syncing').text('同步中...');
                            
                            // 在后台打开电影详情页，并通过 hash 传递评分和目标信息
                            const syncUrl = movieUrl + '#sync-' + rating + '-' + target;
                            console.log('[Douban to IMDb] 打开详情页:', syncUrl);
                            
                            // 后台打开详情页
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
                            
                            const targetText = target === CONFIG.SYNC_TARGET.RATING ? '已看(评分)' : '想看(Watchlist)';
                            showToast(`正在同步到${targetText}: ${movieTitle} (${rating * 2}分)`, 'success');
                            
                            setTimeout(() => {
                                $btn.removeClass('syncing').addClass('synced').text('已同步✓');
                                updateFloatButtonCount();
                            }, CONFIG.BUTTON_STATE_UPDATE_DELAY);
                        });
                    });
                }
            });
            
            console.log('[Douban to IMDb] 脚本执行完成');
            
            // 添加悬浮批量同步按钮
            addFloatButton();
            
            // 如果URL带有 #auto-sync 标记，自动开始同步（不显示进度弹窗）
            if (location.hash.startsWith('#auto-sync')) {
                console.log('[Douban to IMDb] 检测到自动同步标记，这是子页面，不显示进度弹窗');
                
                // 从 hash 中提取目标类型
                const hashParts = location.hash.split('-');
                const target = hashParts[2] || CONFIG.SYNC_TARGET.RATING;
                // 不再修改全局变量
                
                // 生成批次ID（用于标签页检测）
                const batchId = 'batch-auto-' + Date.now();
                
                setTimeout(() => {
                    // 收集电影信息并自动同步
                    const $syncButtons = $('.sync-imdb-btn').not('.syncing, .synced');
                    const openedTabs = [];
                    
                    $syncButtons.each(function(index) {
                        const $btn = $(this);
                        setTimeout(() => {
                            if (!$btn.hasClass('syncing') && !$btn.hasClass('synced')) {
                                const movieTitle = $btn.parent().find('a em').text() || $btn.parent().find('a').text();
                                console.log('[Douban to IMDb] 自动同步:', movieTitle, '目标:', target);
                                $btn.addClass('syncing').text('同步中...');
                                
                                // 获取电影信息
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
                                
                                const syncUrl = movieUrl + '#sync-' + rating + '-' + target + '-' + batchId + '-' + index;
                                const newTab = window.open(syncUrl, '_blank');
                                
                                // 立即让主窗口重新获得焦点（实现后台打开效果）
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
                    
                    // 检查标签页状态
                    const checkInterval = setInterval(() => {
                        openedTabs.forEach((item, i) => {
                            if (item.tab && item.tab.closed) {
                                // 这里的 batchId 是子页面自己生成的，无法获取详情页的结果
                                // 所以子页面的检测保持简单，只标记为已同步
                                // 实际的成功/失败判断由主页面的批量同步逻辑处理
                                item.button.removeClass('syncing').addClass('synced').text('已同步✓');
                                openedTabs.splice(i, 1);
                            }
                        });
                        
                        // 所有标签页都关闭后，标记页面完成（不自动关闭）
                        if (openedTabs.length === 0 && $syncButtons.length > 0) {
                            clearInterval(checkInterval);
                            console.log('[Douban to IMDb] 子页面同步完成，标记为已完成');
                            // 在页面标题中添加完成标记，让主页面可以检测
                            document.title = '[已完成] ' + document.title;
                            // 不自动关闭，等待主页面关闭
                        }
                    }, 1000);
                }, CONFIG.AUTO_SYNC_START_DELAY);
            }
        }, CONFIG.PAGE_LOAD_DELAY);
    }

    // 在电影详情页添加 IMDb 链接
    if (location.pathname.includes('/subject/')) {
        // 等待页面加载完成后添加 IMDb 链接
        setTimeout(function() {
            addImdbLinkBack();
        }, 500);
    }
    
    // 在电影详情页自动同步（从列表页点击按钮跳转过来的）
    if (location.pathname.includes('/subject/') && location.hash.startsWith('#sync-')) {
        console.log('[Douban to IMDb] 检测到同步请求，等待页面加载...');
        
        // 等待页面加载完成
        setTimeout(function() {
            // 解析 hash: #sync-5-watchlist-batch-1770415236571-0
            // 格式: #sync-{rating}-{target}-{batchId}-{movieIndex}
            // 注意：batchId 本身包含 '-'，所以需要特殊处理
            const hash = location.hash.substring(6); // 移除 #sync-
            const parts = hash.split('-');
            
            // parts[0] = rating
            // parts[1] = target
            // parts[2] = 'batch'
            // parts[3] = timestamp (batchId 的一部分)
            // parts[4] = movieIndex
            
            const rating = parseInt(parts[0]) || 5;
            const target = parts[1] || CONFIG.SYNC_TARGET.RATING;
            const batchId = parts[2] + '-' + parts[3]; // 重新组合 batchId
            const movieIndex = parseInt(parts[4]) || 0;
            
            let id = location.pathname.split('/')[2];
            
            // 检查是否是从 IMDb 返回的（URL 中有 from-imdb 参数）
            const urlParams = new URLSearchParams(location.search);
            const fromImdb = urlParams.get('from-imdb');
            const imdbResult = urlParams.get('result');
            
            if (fromImdb === 'true' && imdbResult) {
                // 从 IMDb 返回，从 URL 参数中读取 batchId 和 movieIndex
                const urlBatchId = urlParams.get('batchId') || batchId;
                const urlMovieIndex = parseInt(urlParams.get('index')) || movieIndex;
                
                console.log('[Douban to IMDb] 从 IMDb 返回，结果:', imdbResult, 'batchId:', urlBatchId, 'index:', urlMovieIndex);
                
                const resultKey = 'douban-sync-result-' + urlBatchId + '-' + urlMovieIndex;
                if (imdbResult === 'success' || imdbResult === 'already-in-list') {
                    localStorage.setItem(resultKey, JSON.stringify({
                        success: true,
                        result: imdbResult,
                        timestamp: Date.now()
                    }));
                    console.log('[Douban to IMDb] 已保存成功结果到:', resultKey);
                } else {
                    localStorage.setItem(resultKey, JSON.stringify({
                        success: false,
                        result: imdbResult,
                        timestamp: Date.now()
                    }));
                    console.log('[Douban to IMDb] 已保存失败结果到:', resultKey);
                }
                
                // 延迟关闭，让主页面有时间读取
                setTimeout(() => {
                    console.log('[Douban to IMDb] 准备关闭页面');
                    window.close();
                }, 2000);
                
                return; // 不再继续执行下面的代码
            }
            
            console.log('[Douban to IMDb] 开始提取 IMDb ID...');
            console.log('[Douban to IMDb] Hash参数:', { rating, target, batchId, movieIndex });
            
            // 提取 IMDb ID
            let imdbId = '';
            $('#info a').each(function() {
                const href = $(this).attr('href');
                const text = $(this).text().trim();
                console.log('[Douban to IMDb] 检查链接:', href, text);
                
                if (href && href.includes('imdb.com/title/')) {
                    const match = href.match(/tt\d+/);
                    if (match) {
                        imdbId = match[0];
                        console.log('[Douban to IMDb] 从链接找到 IMDb ID:', imdbId);
                        return false;
                    }
                } else if (text && text.match(/^tt\d+$/)) {
                    imdbId = text;
                    console.log('[Douban to IMDb] 从文本找到 IMDb ID:', imdbId);
                    return false;
                }
            });
            
            console.log('[Douban to IMDb] 最终 IMDb ID:', imdbId);
            
            if (imdbId && imdbId.includes('tt')) {
                const score = rating * 2;
                const imdbLink = 'https://www.imdb.com/title/' + imdbId + '/#' + score + '-' + target + '-' + batchId + '-' + movieIndex + '-' + id;
                
                const targetText = target === CONFIG.SYNC_TARGET.RATING ? '已看(评分)' : '想看(Watchlist)';
                console.log('[Douban to IMDb] 准备跳转到 IMDb:', imdbLink);
                showToast(`正在同步到 IMDb ${targetText}: ${score}分`, 'success');
                
                // 在 localStorage 中标记为处理中
                const resultKey = 'douban-sync-result-' + batchId + '-' + movieIndex;
                localStorage.setItem(resultKey, JSON.stringify({
                    status: 'processing',
                    movieId: id,
                    imdbId: imdbId,
                    timestamp: Date.now()
                }));
                console.log('[Douban to IMDb] 已标记为处理中:', resultKey);
                
                setTimeout(() => {
                    console.log('[Douban to IMDb] 执行跳转...');
                    // 直接跳转到 IMDb
                    window.location.href = imdbLink;
                }, 1000);
            } else {
                console.error('[Douban to IMDb] 未找到 IMDb ID');
                console.log('[Douban to IMDb] #info 元素数量:', $('#info').length);
                console.log('[Douban to IMDb] #info a 元素数量:', $('#info a').length);
                showToast('未找到 IMDb ID', 'error');
                
                // 保存失败结果到 localStorage
                const resultKey = 'douban-sync-result-' + batchId + '-' + movieIndex;
                localStorage.setItem(resultKey, JSON.stringify({
                    success: false,
                    result: 'no-imdb-id',
                    timestamp: Date.now()
                }));
                console.log('[Douban to IMDb] 已保存失败结果到 localStorage:', resultKey);
                
                // 延迟关闭，让主页面有时间读取
                setTimeout(() => {
                    console.log('[Douban to IMDb] 准备关闭页面');
                    window.close();
                }, 2000);
            }
        }, 3000); // 等待3秒让页面完全加载
    }

    // 获取电影 ID 用于下载和字幕链接
    let id = location.pathname.split('/')[2];

    let title = $('html head title').text();
    title = title.replace('(豆瓣)', '').trim()
    let title_en = $('span[property="v:itemreviewed"]').text() + ' ' + $('.year').eq(0).text().replace('(', '').replace(')', '')
    title_en = title_en.replace(title, '').trim()
    
    // 获取 IMDb ID 用于下载和字幕链接
    let imdbForLinks = '';
    $('#info a').each(function() {
        const href = $(this).attr('href');
        const text = $(this).text().trim();
        if (href && href.includes('imdb.com/title/')) {
            const match = href.match(/tt\d+/);
            if (match) {
                imdbForLinks = match[0];
                return false;
            }
        } else if (text && text.match(/^tt\d+$/)) {
            imdbForLinks = text;
            return false;
        }
    });
    
    if (!imdbForLinks) {
        imdbForLinks = title; // 如果没找到 IMDb ID，使用标题
    }

    $('.aside').prepend('<div class="tags"><h2><i>下载</i>· · · · · ·</h2><div id="dl-sites" class="tags-body"></div></div><div class="tags"><h2><i>字幕</i>· · · · · ·</h2><div id="sub-sites" class="tags-body"></div></div>')

    let dl_sites = {
        'IMBT': 'https://imbt.one/i/' + imdbForLinks,
        '观影': 'https://www.gying.net/s/1---1/' + imdbForLinks,
        '片源': 'https://pianyuan.org/search?q=' + imdbForLinks,
        '片吧': 'http://so.pianbar.net/search.aspx?s=movie&q=' + title,
        //'下片片': 'http://search.xiepp.com/search.aspx?s=movie&q=' + title,
        'BT之家': 'https://www.1lou.me/search-' + title + '.htm',
        '音范丝4K': 'https://www.yinfans.me/?s=' + title,
        '极影': 'https://www.jiyingw.net/?s=' + title,
        'Mini4K': 'https://www.mini4k.com/search?term=' + title,
        'XueSouSou': 'https://www.xuesousou.net/search?q=' + title,
        'BTSOW': 'https://btsow.lol/search/' + title_en,
        'BTDigg': 'https://www.btdig.com/search?order=0&q=' + title_en,
        'RARBG': 'https://rargb.to/search/?search=' + title_en + '&order=size&by=DESC',
        '1377X': 'https://www.1377x.to/sort-search/' + title_en + '/size/desc/1/',
        'ThePirateBay': 'https://thepiratebay10.info/search/' + title_en + '/1/5/0',
        'IBit': 'https://ibit.to/torrent-search/' + title_en + '/Movies/size:desc/1/',
        'YaPan': 'https://pan.ccof.cc/search?keyword=' + title,
        'AliPanSou': 'https://www.alipansou.com/search?s=2&t=1&k=' + title,
        'Google Alipan': 'https://www.google.com/search?q=阿里云盘+' + title,
        'shareAliyun': 'https://t.me/s/shareAliyun?q=' + title,
        'YunPanPan': 'https://t.me/s/YunPanPan?q=' + title
    }
    for (let name in dl_sites) {
        let link = dl_sites[name];
        link = $('<a></a>').attr('href', link);
        link.attr('target', '_blank').attr('rel', 'nofollow');
        link.html(name);
        $('#dl-sites').append(link);
    }

    let sub_sites = {
        'SubHD': 'https://subhd.tv/d/' + id,
        '字幕库': 'https://zimuku.org/search?chost=zimuku.org&q=' + imdbForLinks,
        'A4K': 'https://www.a4k.net/search?term=' + title,
        '伪射手': 'http://assrt.net/sub/?searchword=' + title
    };
    for (let name in sub_sites) {
        let link = sub_sites[name];
        link = $('<a></a>').attr('href', link);
        link.attr('target', '_blank').attr('rel', 'nofollow');
        link.html(name);
        $('#sub-sites').append(link);
    }
}

if (location.hostname == 'www.imdb.com') {
    if (S(location.pathname).startsWith('/title/')) {
        GM_addStyle('#yt-message{position:absolute;top:0;left:50%; margin-left:-100px;width:200px;height:15px;line-height:15px;background:yellow;border-radius: 2px;text-align:center;font-size:11px;}#yt-links{display:block;border-top: 1px solid #cccccc;padding: 10px 20px;background-color:#EFE3A4;text-align:center}#yt-links a{display:inline-block;margin-right:20px;padding:8px 16px;background-color: #0091EA;color:white;text-transform:capitalize;border-radius: 2px;}');

        let origin = $('li[data-testid="title-details-origin"] ul').text()
        //if (origin.includes('India')) window.close()

        let genres = $('li[data-testid="storyline-genres"] ul').text()
        //if (genres.includes('Documentary') || genres.includes('Animation')) window.close()
        //新版
        let id = location.pathname.split('/')[2]
        window.setTimeout(function () {
            let doubanLink = 'https://movie.douban.com/subject_search?search_text=' + id + '&from_imdb=true'
            $('ul[data-testid="hero-subnav-bar-topic-links"]').append('<li role="presentation" class="ipc-inline-list__item"><a target="_blank" href="' + doubanLink + '" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color" data-testid="hero-subnav-bar-imdb-pro-link">Douban</a></li>')
        }, 1000);

        // 解析 hash: #10-watchlist-batch-1770416024180-1-30455615
        // 格式: #{score}-{target}-{batchId}-{movieIndex}-{doubanId}
        // 注意：batchId 本身包含 '-'，格式为 batch-{timestamp}
        const hash = location.hash.replace('#', '');
        const parts = hash.split('-');
        
        // parts[0] = score
        // parts[1] = target
        // parts[2] = 'batch'
        // parts[3] = timestamp (batchId 的一部分)
        // parts[4] = movieIndex
        // parts[5] = doubanId
        
        let score = parts[0];
        const target = parts[1] || CONFIG.SYNC_TARGET.RATING;
        const batchId = parts[2] + '-' + parts[3]; // 重新组合 batchId
        const movieIndex = parseInt(parts[4]) || 0;
        const doubanId = parts[5] || '';
        
        console.log('[Douban to IMDb] IMDb 页面加载，Hash参数:', { score, target, batchId, movieIndex, doubanId });
        
        // 设置初始状态
        if (score.length > 0) {
            window.name = 'processing';
            console.log('[Douban to IMDb] 设置初始 window.name:', window.name);
        }
        
        // 构造返回豆瓣的 URL
        const backToDoubanUrl = 'https://movie.douban.com/subject/' + doubanId + '/?from-imdb=true&result=';
        
        if (score.length > 0) {
            if (target === CONFIG.SYNC_TARGET.WATCHLIST) {
                // 添加到 Watchlist
                window.setTimeout(function () {
                    console.log('[Douban to IMDb] 开始处理 Watchlist');
                    
                    // 等待按钮加载，最多等待 10 秒
                    let waitCount = 0;
                    const maxWaitCount = 20; // 10秒 / 500ms
                    
                    const waitForButton = setInterval(function() {
                        waitCount++;
                        
                        // 尝试多种选择器来找到 Watchlist 按钮
                        let $watchlistBtn = $('button[data-testid="tm-box-wl-button"]');
                        if ($watchlistBtn.length === 0) {
                            $watchlistBtn = $('button[aria-label="Add to Watchlist"]');
                        }
                        if ($watchlistBtn.length === 0) {
                            $watchlistBtn = $('button:contains("Add to Watchlist")');
                        }
                        
                        if ($watchlistBtn.length > 0) {
                            clearInterval(waitForButton);
                            console.log('[Douban to IMDb] 找到 Watchlist 按钮');
                            
                            // 检查是否已经在 Watchlist 中
                            const isAlreadyInWatchlist = $watchlistBtn.attr('aria-pressed') === 'true' || 
                                                        $watchlistBtn.find('[data-testid="tm-box-wl-text"]').text().includes('In Watchlist');
                            
                            if (isAlreadyInWatchlist) {
                                console.log('[Douban to IMDb] ✓ 已经在 Watchlist 中，无需添加');
                                
                                // 跳转回豆瓣
                                console.log('[Douban to IMDb] 准备跳转回豆瓣');
                                window.location.href = backToDoubanUrl + 'already-in-list&batchId=' + batchId + '&index=' + movieIndex + '#sync-' + score + '-' + target + '-' + batchId + '-' + movieIndex;
                            } else {
                                console.log('[Douban to IMDb] 不在 Watchlist 中，准备点击按钮');
                                $watchlistBtn[0].click();
                                
                                // 开始检查是否添加成功
                                let checkCount = 0;
                                const maxChecks = CONFIG.IMDB_RATE_MAX_CHECK_TIME / CONFIG.IMDB_RATE_CHECK_INTERVAL;
                                
                                const checkInterval = setInterval(function() {
                                    checkCount++;
                                    
                                    // 检查按钮状态
                                    const $btn = $('button[data-testid="tm-box-wl-button"]');
                                    const isPressed = $btn.attr('aria-pressed') === 'true';
                                    const hasInWatchlistText = $btn.find('[data-testid="tm-box-wl-text"]').text().includes('In Watchlist');
                                    const hasCheckIcon = $btn.find('.ipc-icon--done').length > 0;
                                    
                                    console.log('[Douban to IMDb] 检查 Watchlist 状态 (' + checkCount + '/' + maxChecks + '):', {
                                        isPressed: isPressed,
                                        hasInWatchlistText: hasInWatchlistText,
                                        hasCheckIcon: hasCheckIcon,
                                        buttonText: $btn.find('[data-testid="tm-box-wl-text"]').text()
                                    });
                                    
                                    if (isPressed || hasInWatchlistText || hasCheckIcon || checkCount >= maxChecks) {
                                        clearInterval(checkInterval);
                                        
                                        if (isPressed || hasInWatchlistText || hasCheckIcon) {
                                            console.log('[Douban to IMDb] ✓ 添加到 Watchlist 成功！准备跳转回豆瓣');
                                            
                                            // 跳转回豆瓣
                                            window.location.href = backToDoubanUrl + 'success&batchId=' + batchId + '&index=' + movieIndex + '#sync-' + score + '-' + target + '-' + batchId + '-' + movieIndex;
                                        } else {
                                            console.log('[Douban to IMDb] ✗ Watchlist 状态未确认，但已达到最大检查次数');
                                            
                                            // 跳转回豆瓣，标记失败
                                            window.location.href = backToDoubanUrl + 'failed-timeout&batchId=' + batchId + '&index=' + movieIndex + '#sync-' + score + '-' + target + '-' + batchId + '-' + movieIndex;
                                        }
                                    }
                                }, CONFIG.IMDB_RATE_CHECK_INTERVAL);
                            }
                        } else if (waitCount >= maxWaitCount) {
                            clearInterval(waitForButton);
                            console.error('[Douban to IMDb] ✗ 等待超时，未找到 Watchlist 按钮');
                            
                            // 跳转回豆瓣，标记失败
                            window.location.href = backToDoubanUrl + 'failed-no-button&batchId=' + batchId + '&index=' + movieIndex + '#sync-' + score + '-' + target + '-' + batchId + '-' + movieIndex;
                        } else {
                            console.log('[Douban to IMDb] 等待 Watchlist 按钮加载... (' + waitCount + '/' + maxWaitCount + ')');
                        }
                    }, 500); // 每 500ms 检查一次
                }, 2000); // 先等待 2 秒让页面基本加载
            } else {
                // 评分到 History
                window.setTimeout(function () {
                    console.log('[Douban to IMDb] 打开评分弹窗');
                    $('div[data-testid="hero-rating-bar__user-rating"] button').click();
                }, CONFIG.IMDB_RATE_CLICK_DELAY);
                
                window.setTimeout(function () {
                    console.log('[Douban to IMDb] 选择评分:', score);
                    $('button[aria-label="Rate ' + score + '"]').click();
                }, CONFIG.IMDB_RATE_SELECT_DELAY);
                
                window.setTimeout(function () {
                    console.log('[Douban to IMDb] 提交评分');
                    $('.ipc-starbar + button').click();
                    
                    // 开始检查评分是否成功
                    let checkCount = 0;
                    const maxChecks = CONFIG.IMDB_RATE_MAX_CHECK_TIME / CONFIG.IMDB_RATE_CHECK_INTERVAL;
                    
                    const checkInterval = setInterval(function() {
                        checkCount++;
                        
                        // 检查评分是否成功的标志
                        // 方法1: 检查是否有已评分的星星显示
                        const hasRating = $('div[data-testid="hero-rating-bar__user-rating"]').find('.ipc-starbar').length > 0;
                        
                        // 方法2: 检查评分按钮文字是否变化
                        const ratingButton = $('div[data-testid="hero-rating-bar__user-rating"] button');
                        const buttonText = ratingButton.text();
                        const hasRatedText = buttonText.includes(score) || buttonText.includes('Rate') === false;
                        
                        // 方法3: 检查是否有评分成功的提示
                        const hasSuccessMessage = $('.ipc-promptable-base__panel').length === 0;
                        
                        console.log('[Douban to IMDb] 检查评分状态 (' + checkCount + '/' + maxChecks + '):', {
                            hasRating: hasRating,
                            hasRatedText: hasRatedText,
                            hasSuccessMessage: hasSuccessMessage,
                            buttonText: buttonText
                        });
                        
                        if (hasRating || hasRatedText || checkCount >= maxChecks) {
                            clearInterval(checkInterval);
                            
                            if (hasRating || hasRatedText) {
                                console.log('[Douban to IMDb] ✓ 评分成功！准备跳转回豆瓣');
                                
                                // 跳转回豆瓣
                                window.location.href = backToDoubanUrl + 'success&batchId=' + batchId + '&index=' + movieIndex + '#sync-' + score + '-' + target + '-' + batchId + '-' + movieIndex;
                            } else {
                                console.log('[Douban to IMDb] ✗ 评分状态未确认，但已达到最大检查次数');
                                
                                // 跳转回豆瓣，标记失败
                                window.location.href = backToDoubanUrl + 'failed-timeout&batchId=' + batchId + '&index=' + movieIndex + '#sync-' + score + '-' + target + '-' + batchId + '-' + movieIndex;
                            }
                        }
                    }, CONFIG.IMDB_RATE_CHECK_INTERVAL);

                    $('ul[data-testid="hero-subnav-bar-topic-links"]').append('<li role="presentation" class="ipc-inline-list__item"><a href="https://movie.douban.com/subject_search?search_text=' + id + '&cat=1002&from_imdb=true" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color">Douban</a></li>');
                }, CONFIG.IMDB_RATE_SUBMIT_DELAY);
            }
        }
    }
    if (location.pathname.includes('/search/') || location.pathname.includes('/list/')) {
        GM_addStyle('#yt-links a{display:inline-block;margin-right:6px;text-transform:capitalize;}');
        $('.rating-star.user-rating').each(function () {
            $(this).parents('.lister-item').hide()
        })
        $('.ipl-rating-interactive__star').each(function () {
            if ($(this).is(':visible')) {
                $(this).parents('.lister-item').hide()
            }
        })
        $('.genre').each(function () {
            if ($(this).text().includes('Animation') || $(this).text().includes('Documentary')) {
                $(this).parents('.lister-item').hide()
            }
        })
        $('.lister-item-header a').each(function () {
            $(this).attr('target', '_blank')
        })
        $('.lister-item-header').each(function () {
            var title = $(this).find('a').text() + ' ' + $(this).find('.lister-item-year').text()
            var id = $(this).find('a').attr('href').split('/')[2]
            $(this).parent().after(insertLinks(id, title))
        })
    }
}
function insertLinks(id, title) {
    var entitle = encodeURIComponent(title)
    var douban = '<a href="https://movie.douban.com/subject_search?search_text=' + id + '&cat=1002&from_imdb=true" target="_blank">douban</a>'
    var sub1 = '<a href="https://www.zimuku.org/search?q=' + id + '" target="_blank">zimuku</a>'
    var sub2 = '<a href="https://subhd.tv/search0/' + entitle + '" target="_blank">subhd</a>'
    var dl1 = '<a href="http://search.xiepp.com/search.aspx?q=' + entitle + '" target="_blank">xiepp</a>'
    var dl2 = '<a href="https://www.88btbtt.com/search-index-keyword-' + entitle + '.htm" target="_blank">btbtt</a>'

    return '<span id="yt-links">' + douban + '</span>';
}
function openNewBackgroundTab(url) {
    var a = document.createElement("a");
    a.href = url
    var evt = document.createEvent("MouseEvents");
    //the tenth parameter of initMouseEvent sets ctrl key
    evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
        true, false, false, false, 0, null);
    a.dispatchEvent(evt);
}
/*
使用说明：

新版使用方法（推荐）：
1. 打开豆瓣"我看过的电影"页面
2. 每部电影标题后会出现"同步(X★)"按钮，显示当前评分
3. 点击按钮即可自动同步评分到 IMDb
4. 右下角会显示同步状态提示
5. 没有评分的电影默认按5星同步

旧版使用方法：
1. 安装扩展 https://chrome.google.com/webstore/detail/lfpjkncokllnfokkgpkobnkbkmelfefj 此扩展的作用是按 shift + 鼠标左键批量打开链接，注意设置页面打开间隔为3秒以上
2. 在我看过的电影页面批量打开看过电影，脚本就开始执行了，执行完会自动关闭页面。没做自动翻页，需手动翻页
3. 转移完成后记得关闭脚本
*/

})(); // 结束 IIFE
