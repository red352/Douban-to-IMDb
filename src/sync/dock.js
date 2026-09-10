import { batchSyncCurrentPage } from './batch.js';
import { batchSyncAllPages } from './pages.js';

function addFloatButton() {
    if (document.querySelector('.batch-sync-float-container')) return;
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

function updateFloatButtonCount() {
    const count = $('.sync-imdb-btn').not('[data-dbm-page] .sync-imdb-btn, .synced').length;
    $('.sync-current .count').text(count);
    
    if (count === 0) {
        $('.sync-current').css('opacity', '0.5');
    } else {
        $('.sync-current').css('opacity', '1');
    }
}


export { addFloatButton, updateFloatButtonCount };
