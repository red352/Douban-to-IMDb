import { CONFIG } from '../core/config.js';
import { showToast } from './dialogs.js';

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


export { SyncProgressManager };
