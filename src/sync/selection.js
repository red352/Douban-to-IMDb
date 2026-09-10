import { CONFIG } from '../core/config.js';

function showBatchSyncPageDialog(movieList, onConfirm) {
    if (!movieList || movieList.length === 0) return;

    // 默认目标：根据当前页面判断，若在想看(wish)页面默认选中 watchlist，否则默认 rating
    const isWishPage = location.pathname.includes('/wish') || location.search.includes('status=wish');
    let currentTarget = isWishPage ? CONFIG.SYNC_TARGET.WATCHLIST : CONFIG.SYNC_TARGET.RATING;

    const totalCount = movieList.length;
    const selectedSet = new Set(movieList.map(m => m.id)); // 默认全选

    let itemsHtml = '';
    movieList.forEach((movie, index) => {
        let metaHtml = '';
        if (movie.hasRating) {
            const ratingStars = '★'.repeat(movie.rating) + '☆'.repeat(5 - movie.rating);
            metaHtml = `<span class="sync-movie-star">${ratingStars}</span> <span class="sync-movie-score">${movie.rating}星 (${movie.rating * 2}分)</span>`;
        } else {
            metaHtml = `<span class="sync-movie-unrated">未评分</span>`;
        }

        const posterHtml = movie.poster 
            ? `<img class="sync-movie-thumb" src="${movie.poster}" alt="poster">`
            : `<div class="sync-movie-thumb placeholder">🎬</div>`;

        itemsHtml += `
            <div class="sync-movie-item selected" data-id="${movie.id}" data-index="${index}">
                <div class="sync-movie-cb-wrap">
                    <input type="checkbox" class="sync-movie-cb" id="sync-cb-${movie.id}" checked>
                </div>
                <span class="sync-movie-num">${index + 1}</span>
                ${posterHtml}
                <div class="sync-movie-details">
                    <div class="sync-movie-title" title="${movie.title}">${movie.title}</div>
                    <div class="sync-movie-meta">
                        ${metaHtml}
                    </div>
                </div>
            </div>
        `;
    });

    const dialog = $(`
        <div class="sync-target-dialog-overlay">
            <div class="sync-target-dialog sync-batch-page-dialog">
                <div class="sync-batch-head">
                    <div class="sync-batch-title-row">
                        <h3>选择同步电影与目标</h3>
                        <button class="sync-dialog-close" title="关闭">×</button>
                    </div>
                    <p class="sync-batch-desc">已检测到本页 ${totalCount} 部待同步电影，请选择目标并按需勾选：</p>
                </div>

                <!-- 目标选择 Tabs -->
                <div class="sync-target-tabs">
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.RATING ? 'active' : ''}" data-target="rating">
                        <span class="tab-icon">⭐</span>
                        <div class="tab-info">
                            <span class="tab-title">已看（评分）</span>
                            <span class="tab-desc">同步评分到 IMDb History</span>
                        </div>
                    </div>
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.WATCHLIST ? 'active' : ''}" data-target="watchlist">
                        <span class="tab-icon">📋</span>
                        <div class="tab-info">
                            <span class="tab-title">想看（Watchlist）</span>
                            <span class="tab-desc">添加到 IMDb Watchlist</span>
                        </div>
                    </div>
                </div>

                <!-- 列表工具栏 -->
                <div class="sync-list-toolbar">
                    <div class="sync-toolbar-left">
                        <label class="sync-select-all-label">
                            <input type="checkbox" id="sync-select-all-cb" checked>
                            <span class="sync-select-all-text">全选</span>
                        </label>
                        <button type="button" class="sync-action-link" id="sync-invert-btn">反选</button>
                    </div>
                    <div class="sync-toolbar-right">
                        已选 <strong id="sync-selected-count">${totalCount}</strong> / ${totalCount} 部
                    </div>
                </div>

                <!-- 电影多选滚动列表 -->
                <div class="sync-movies-scroll-list">
                    ${itemsHtml}
                </div>

                <!-- 底部操作按钮 -->
                <div class="sync-batch-foot">
                    <button class="sync-btn-cancel">取消</button>
                    <button class="sync-btn-submit">开始同步 (${totalCount}部)</button>
                </div>
            </div>
        </div>
    `);

    $('body').append(dialog);

    setTimeout(() => {
        dialog.addClass('show');
    }, 10);

    const updateSelectionState = function() {
        const count = selectedSet.size;
        dialog.find('#sync-selected-count').text(count);

        const $submitBtn = dialog.find('.sync-btn-submit');
        if (count > 0) {
            $submitBtn.prop('disabled', false).removeClass('disabled').text(`开始同步 (${count}部)`);
        } else {
            $submitBtn.prop('disabled', true).addClass('disabled').text('请至少选择一部电影');
        }

        const $allCb = dialog.find('#sync-select-all-cb');
        if (count === totalCount) {
            $allCb.prop('checked', true).prop('indeterminate', false);
        } else if (count === 0) {
            $allCb.prop('checked', false).prop('indeterminate', false);
        } else {
            $allCb.prop('checked', false).prop('indeterminate', true);
        }
    };

    // 目标切换
    dialog.find('.sync-target-tab').on('click', function() {
        dialog.find('.sync-target-tab').removeClass('active');
        $(this).addClass('active');
        currentTarget = $(this).attr('data-target');
    });

    // 单项点击整行切换
    dialog.find('.sync-movie-item').on('click', function(e) {
        if ($(e.target).is('input[type="checkbox"]')) {
            return;
        }
        const $item = $(this);
        const $cb = $item.find('.sync-movie-cb');
        const newState = !$cb.prop('checked');
        $cb.prop('checked', newState);
        const id = parseInt($item.attr('data-id'));
        if (newState) {
            selectedSet.add(id);
            $item.addClass('selected');
        } else {
            selectedSet.delete(id);
            $item.removeClass('selected');
        }
        updateSelectionState();
    });

    // 单独点击 checkbox
    dialog.find('.sync-movie-cb').on('change', function() {
        const $cb = $(this);
        const $item = $cb.closest('.sync-movie-item');
        const id = parseInt($item.attr('data-id'));
        if ($cb.prop('checked')) {
            selectedSet.add(id);
            $item.addClass('selected');
        } else {
            selectedSet.delete(id);
            $item.removeClass('selected');
        }
        updateSelectionState();
    });

    // 全选切换
    dialog.find('#sync-select-all-cb').on('change', function() {
        const checked = $(this).prop('checked');
        dialog.find('.sync-movie-cb').prop('checked', checked);
        if (checked) {
            movieList.forEach(m => selectedSet.add(m.id));
            dialog.find('.sync-movie-item').addClass('selected');
        } else {
            selectedSet.clear();
            dialog.find('.sync-movie-item').removeClass('selected');
        }
        updateSelectionState();
    });

    // 反选按钮
    dialog.find('#sync-invert-btn').on('click', function(e) {
        e.preventDefault();
        dialog.find('.sync-movie-item').each(function() {
            const $item = $(this);
            const id = parseInt($item.attr('data-id'));
            const $cb = $item.find('.sync-movie-cb');
            const newState = !$cb.prop('checked');
            $cb.prop('checked', newState);
            if (newState) {
                selectedSet.add(id);
                $item.addClass('selected');
            } else {
                selectedSet.delete(id);
                $item.removeClass('selected');
            }
        });
        updateSelectionState();
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
        if (selectedSet.size === 0) return;
        const selectedMovies = movieList.filter(m => selectedSet.has(m.id));
        closeDialog(() => {
            if (onConfirm) onConfirm(selectedMovies, currentTarget);
        });
    });
}


export { showBatchSyncPageDialog };
