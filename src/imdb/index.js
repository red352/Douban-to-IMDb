import { parseImdbHash } from '../sync/protocol.js';
import { matchesRating } from './rating.js';
import { bindHoverPreview, preloadPreview } from '../preview/ui.js';
import { CONFIG } from '../core/config.js';
import { insertLinks } from '../core/links.js';

let initialized = false;
function initImdb() {
    if (initialized) return;
    initialized = true;

    if (location.pathname.startsWith('/title/')) {
        GM_addStyle('#yt-message{position:absolute;top:0;left:50%; margin-left:-100px;width:200px;height:15px;line-height:15px;background:yellow;border-radius: 2px;text-align:center;font-size:11px;}#yt-links{display:block;border-top: 1px solid #cccccc;padding: 10px 20px;background-color:#EFE3A4;text-align:center}#yt-links a{display:inline-block;margin-right:20px;padding:8px 16px;background-color: #0091EA;color:white;text-transform:capitalize;border-radius: 2px;}');

        let origin = $('li[data-testid="title-details-origin"] ul').text()
        //if (origin.includes('India')) window.close()

        let genres = $('li[data-testid="storyline-genres"] ul').text()
        //if (genres.includes('Documentary') || genres.includes('Animation')) window.close()
        //新版
        let id = location.pathname.split('/')[2]
        window.setTimeout(function () {
            let doubanLink = 'https://movie.douban.com/subject_search?search_text=' + id + '&from_imdb=true';
            let $doubanBtn = $('<li role="presentation" class="ipc-inline-list__item"><a target="_blank" href="' + doubanLink + '" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color douban-preview-link" data-imdb-id="' + id + '" data-testid="hero-subnav-bar-imdb-pro-link">Douban</a></li>');
            $('ul[data-testid="hero-subnav-bar-topic-links"]').append($doubanBtn);
            bindHoverPreview($doubanBtn.find('a')[0], 'douban', function() { return id; });
            preloadPreview('douban', id);
        }, 1000);

        const { score, target, batchId, movieIndex, doubanId } = parseImdbHash(location.hash);
        
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
                        const confirmedValue = $('div[data-testid="hero-rating-bar__user-rating"] .ipc-rating-star--rating').text().trim();
                        const hasRating = confirmedValue === score;
                        
                        // 方法2: 检查评分按钮文字是否变化
                        const ratingButton = $('div[data-testid="hero-rating-bar__user-rating"] button');
                        const buttonText = ratingButton.text();
                        const ratingLabel = ratingButton.attr('aria-label') || '';
                        const hasRatedText = matchesRating(buttonText || ratingLabel, score);
                        
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

                    let $doubanBtn2 = $('<li role="presentation" class="ipc-inline-list__item"><a href="https://movie.douban.com/subject_search?search_text=' + id + '&cat=1002&from_imdb=true" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color douban-preview-link" data-imdb-id="' + id + '">Douban</a></li>');
                    $('ul[data-testid="hero-subnav-bar-topic-links"]').append($doubanBtn2);
                    bindHoverPreview($doubanBtn2.find('a')[0], 'douban', function() { return id; });
                    preloadPreview('douban', id);
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
            var rawTitle = $(this).find('a').text().trim();
            var yearText = $(this).find('.lister-item-year').text();
            var yearMatch = yearText ? yearText.match(/\b(19\d\d|20\d\d)\b/) : null;
            var year = yearMatch ? yearMatch[1] : '';
            var title = rawTitle + (year ? ' ' + year : '');
            var id = $(this).find('a').attr('href').split('/')[2];
            var $links = $(insertLinks(id, title));
            $(this).parent().after($links);
            $links.find('.douban-preview-link').each(function() {
                bindHoverPreview(this, 'douban', function() {
                    return { imdbId: id, title: rawTitle, year: year };
                });
            });
        })
    }

}


export { initImdb };
