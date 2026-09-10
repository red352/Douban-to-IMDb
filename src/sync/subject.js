import { CONFIG } from '../core/config.js';
import { showToast } from './dialogs.js';
import { extractSubjectUserRating } from './ratings.js';

function showSubjectMovieSyncDialog(movieInfo, onConfirm) {
    // 自动识别的评分：1~5 或 null
    const autoDetectedRating = (movieInfo.userRating && movieInfo.userRating >= 1 && movieInfo.userRating <= 5) 
        ? movieInfo.userRating 
        : null;

    // 当前选中的评分：未打分时默认 null，绝不默认满分！
    let selectedRating = autoDetectedRating;

    // 默认目标：若自动识别到评分，默认 rating；若标记了想看且无评分，默认 watchlist；否则默认 rating
    let currentTarget = autoDetectedRating 
        ? CONFIG.SYNC_TARGET.RATING 
        : (movieInfo.isWish ? CONFIG.SYNC_TARGET.WATCHLIST : CONFIG.SYNC_TARGET.RATING);

    const posterHtml = movieInfo.poster 
        ? `<img class="subject-sync-thumb" src="${movieInfo.poster}" alt="poster">`
        : `<div class="subject-sync-thumb placeholder">🎬</div>`;

    const getScoreHintHtml = (rating) => {
        if (rating) {
            return `${rating} 星 (${rating * 2} 分)` + (rating === autoDetectedRating ? ' <span class="sync-auto-badge">已自动识别</span>' : '');
        }
        return '<span class="subject-unselected-hint">未评分（请点击下方选择分值）</span>';
    };

    const dialog = $(`
        <div class="sync-target-dialog-overlay">
            <div class="sync-target-dialog subject-single-sync-dialog">
                <div class="sync-batch-head">
                    <div class="sync-batch-title-row">
                        <h3>同步此电影到 IMDb</h3>
                        <button class="sync-dialog-close" title="关闭">×</button>
                    </div>
                    <p class="sync-batch-desc">将当前豆瓣电影自动同步至 IMDb 评分记录或想看列表：</p>
                </div>

                <!-- 电影卡片预览 -->
                <div class="subject-sync-media-card">
                    ${posterHtml}
                    <div class="subject-sync-media-info">
                        <div class="subject-sync-media-title" title="${movieInfo.title}">${movieInfo.title}</div>
                        <div class="subject-sync-media-meta">
                            <span>IMDb ID: <strong>${movieInfo.imdbId}</strong></span>
                            ${movieInfo.year ? ` • <span>${movieInfo.year}年</span>` : ''}
                        </div>
                    </div>
                </div>

                <!-- 目标选择 Tabs -->
                <div class="sync-target-tabs">
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.RATING ? 'active' : ''}" data-target="rating">
                        <span class="tab-icon">⭐</span>
                        <div class="tab-info">
                            <span class="tab-title">已看（评分）</span>
                            <span class="tab-desc">同步评分到 IMDb 评分记录</span>
                        </div>
                    </div>
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.WATCHLIST ? 'active' : ''}" data-target="watchlist">
                        <span class="tab-icon">📋</span>
                        <div class="tab-info">
                            <span class="tab-title">想看（Watchlist）</span>
                            <span class="tab-desc">添加到 IMDb 待看列表</span>
                        </div>
                    </div>
                </div>

                <!-- 评分选择器（仅当目标为 rating 时可见） -->
                <div class="subject-sync-rating-selector" style="${currentTarget === CONFIG.SYNC_TARGET.RATING ? '' : 'display:none;'}">
                    <div class="subject-sync-rating-label">
                        <span>同步评分分值</span>
                        <span class="subject-sync-rating-text">${getScoreHintHtml(selectedRating)}</span>
                    </div>
                    <div class="subject-rating-stars-bar">
                        ${[1, 2, 3, 4, 5].map(r => `
                            <button type="button" class="subject-star-opt ${r === selectedRating ? 'active' : ''}" data-star="${r}">
                                ${'★'.repeat(r)}<br>${r * 2}分
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- 底部操作按钮 -->
                <div class="sync-batch-foot">
                    <button class="sync-btn-cancel">取消</button>
                    <button class="sync-btn-submit">立即同步到 IMDb</button>
                </div>
            </div>
        </div>
    `);

    $('body').append(dialog);

    setTimeout(() => {
        dialog.addClass('show');
    }, 10);

    // 目标切换
    dialog.find('.sync-target-tab').on('click', function() {
        dialog.find('.sync-target-tab').removeClass('active');
        $(this).addClass('active');
        currentTarget = $(this).attr('data-target');
        if (currentTarget === CONFIG.SYNC_TARGET.RATING) {
            dialog.find('.subject-sync-rating-selector').slideDown(200);
        } else {
            dialog.find('.subject-sync-rating-selector').slideUp(200);
        }
    });

    // 评分星级手动选择
    dialog.find('.subject-star-opt').on('click', function() {
        dialog.find('.subject-star-opt').removeClass('active');
        $(this).addClass('active');
        selectedRating = parseInt($(this).attr('data-star'));
        dialog.find('.subject-sync-rating-text').html(getScoreHintHtml(selectedRating));
    });

    const closeDialog = function(callback) {
        dialog.removeClass('show');
        setTimeout(() => {
            dialog.remove();
            if (callback) callback();
        }, 300);
    };

    dialog.find('.sync-btn-cancel, .sync-dialog-close').on('click', function() {
        closeDialog();
    });

    dialog.find('.sync-btn-submit').on('click', function() {
        // 如果用户选择了“已看评分”，必须选择分值
        if (currentTarget === CONFIG.SYNC_TARGET.RATING) {
            if (!selectedRating) {
                showToast('请在下方点击选择需要同步的评分分值（1~5星）', 'error');
                return;
            }
        }
        closeDialog(() => {
            if (onConfirm) onConfirm(currentTarget, selectedRating);
        });
    });
}

function triggerSubjectMovieSync() {
    let imdbId = '';
    // 从页面 #info 区域查找有效 IMDb ID
    $('#info a').each(function() {
        const href = $(this).attr('href') || '';
        const text = $(this).text().trim();
        if (href.includes('imdb.com/title/')) {
            const m = href.match(/tt\d+/);
            if (m) { imdbId = m[0]; return false; }
        } else if (text.match(/^tt\d+$/)) {
            imdbId = text;
            return false;
        }
    });

    if (!imdbId) {
        showToast('未在当前电影页面找到有效的 IMDb 编号', 'error');
        return;
    }

    const doubanId = location.pathname.split('/')[2];
    const movieTitle = $('span[property="v:itemreviewed"]').text().trim() || $('h1').text().replace('(豆瓣)', '').trim();
    const yearText = $('.year').text().replace(/[\(\)]/g, '').trim();
    const poster = $('#mainpic img').attr('src') || '';

    // 智能提取用户在豆瓣的实际评分（未评分为 null）
    const userRating = extractSubjectUserRating();
    const isWish = $('#interest_sect_level').text().includes('已想看');

    showSubjectMovieSyncDialog({
        title: movieTitle,
        year: yearText,
        poster: poster,
        imdbId: imdbId,
        doubanId: doubanId,
        userRating: userRating,
        isWish: isWish
    }, function(target, rating) {
        const score = (rating || 5) * 2;
        const batchId = 'batch-' + Date.now();
        const targetText = target === CONFIG.SYNC_TARGET.RATING ? `已看(评分: ${score}分)` : '想看(Watchlist)';
        
        showToast(`正在将《${movieTitle}》同步到 IMDb ${targetText}...`, 'success');

        const imdbUrl = `https://www.imdb.com/title/${imdbId}/#${score}-${target}-${batchId}-0-${doubanId}`;
        window.open(imdbUrl, '_blank');
    });
}

function addSubjectPageSyncButtons() {
    if (!location.pathname.includes('/subject/')) return;

    const $sect = $('#interest_sect_level');
    if ($sect.length && !$sect.find('.subject-action-sync-btn').length) {
        const $btnWrap = $(`
            <div class="subject-sync-action-wrap">
                <button type="button" class="subject-action-sync-btn" title="将此电影评分或想看同步到 IMDb">
                    <span class="subject-sync-imdb-badge">IMDb</span>
                    <span class="subject-sync-btn-label">⚡ 同步到 IMDb</span>
                </button>
            </div>
        `);
        $sect.append($btnWrap);
        $btnWrap.find('.subject-action-sync-btn').on('click', function(e) {
            e.preventDefault();
            triggerSubjectMovieSync();
        });
    }
}


export { showSubjectMovieSyncDialog, triggerSubjectMovieSync, addSubjectPageSyncButtons };
