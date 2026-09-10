import { CONFIG } from '../core/config.js';

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


export { showToast, showSyncTargetDialog, showConfirmDialog };
