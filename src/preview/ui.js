import { isValidPreviewData, PREVIEW_CACHE } from './cache.js';
import { fetchImdbPreview } from './imdb.js';
import { fetchDoubanPreview } from './douban.js';

let previewPopoverEl = null;

let hoverHideTimer = null;

let hoverShowTimer = null;

let currentPreviewRequestId = 0;

function getDoubanPageContext() {
        if (!location.hostname.includes('douban.com')) {
            return { chineseTitle: '' };
        }
        try {
            const h1El = document.querySelector('#content h1');
            if (h1El) {
                const titleSpan = h1El.querySelector('[property="v:itemreviewed"]');
                const fullText = titleSpan ? titleSpan.textContent.trim() : h1El.textContent.trim();
                const match = fullText.match(/^([^\w\d\(\)]+)/);
                if (match && match[1]) {
                    return { chineseTitle: match[1].trim() };
                }
                return { chineseTitle: fullText.split(' ')[0] || '' };
            }
        } catch (e) {}
        return { chineseTitle: '' };
    }

function getOrCreatePreviewCard() {
        if (!previewPopoverEl) {
            previewPopoverEl = document.createElement('div');
            previewPopoverEl.id = 'media-preview-card';
            previewPopoverEl.className = 'media-preview-card';
            previewPopoverEl.innerHTML = `
                <div class="mpc-loading">
                    <div class="mpc-spinner"></div>
                    <span>正在加载预览信息...</span>
                </div>
                <div class="mpc-content" style="display:none;">
                    <div class="mpc-poster-wrap">
                        <img class="mpc-poster" src="" alt="Poster">
                    </div>
                    <div class="mpc-info">
                        <div class="mpc-header">
                            <span class="mpc-badge"></span>
                            <span class="mpc-title"></span>
                        </div>
                        <div class="mpc-subtitle"></div>
                        <div class="mpc-rating-row">
                            <span class="mpc-star">★</span>
                            <span class="mpc-rating-score"></span>
                            <span class="mpc-rating-max">/ 10</span>
                            <span class="mpc-rating-votes"></span>
                        </div>
                        <div class="mpc-meta"></div>
                        <p class="mpc-description"></p>
                        <p class="mpc-notice"></p>
                    </div>
                </div>
                <div class="mpc-error" style="display:none;">
                    <span class="mpc-error-text">暂未获取到预览信息</span>
                </div>
            `;
            document.body.appendChild(previewPopoverEl);

            previewPopoverEl.addEventListener('mouseenter', function() {
                if (hoverHideTimer) {
                    clearTimeout(hoverHideTimer);
                    hoverHideTimer = null;
                }
            });

            previewPopoverEl.addEventListener('mouseleave', function() {
                hidePreviewCard();
            });
        }
        return previewPopoverEl;
    }

function positionPreviewCard(targetEl) {
        if (!targetEl) return;
        const card = getOrCreatePreviewCard();
        const rect = targetEl.getBoundingClientRect();
        const cardWidth = 340;
        const margin = 8;

        let left = rect.left;
        if (left + cardWidth > window.innerWidth - 12) {
            left = window.innerWidth - cardWidth - 12;
        }
        if (left < 12) left = 12;

        const cardHeight = card.offsetHeight || 220;
        let top = rect.bottom + margin;
        if (rect.bottom + cardHeight > window.innerHeight && rect.top > cardHeight) {
            top = Math.max(10, rect.top - margin - cardHeight);
        }

        card.style.position = 'fixed';
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    }

function hidePreviewCard() {
        if (hoverShowTimer) {
            clearTimeout(hoverShowTimer);
            hoverShowTimer = null;
        }
        hoverHideTimer = setTimeout(function() {
            if (previewPopoverEl) {
                previewPopoverEl.classList.remove('mpc-visible');
            }
        }, 150);
    }

function loadPosterImage($imgEl, url, referer) {
        if (!url) {
            $imgEl.hide();
            return;
        }

        if (url.startsWith('data:') || url.startsWith('blob:')) {
            $imgEl.attr('src', url).show();
            return;
        }

        // Amazon / IMDb 原生海报 CDN 支持直链，且支持跨域，走原生加载享受极速并行下载与 HTTP 强缓存
        if (url.includes('media-amazon.com') || url.includes('imdb.com')) {
            $imgEl.attr('src', url).show();
            return;
        }

        // 豆瓣本站访问豆瓣图片，直接原生加载即可
        if (location.hostname.includes('douban.com') && url.includes('doubanio.com')) {
            $imgEl.attr('src', url).show();
            return;
        }

        // 跨域豆瓣图片（在 IMDb 站内），通过 GM_xmlhttpRequest 携带合法 Referer 获取 Blob 彻底规避 418 防盗链
        if (url.includes('doubanio.com') || referer) {
            const reqReferer = referer || 'https://movie.douban.com/';
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Referer': reqReferer,
                    'User-Agent': navigator.userAgent
                },
                responseType: 'blob',
                timeout: 5000,
                onload: function(response) {
                    if (response.status === 200 && response.response) {
                        try {
                            const blobUrl = URL.createObjectURL(response.response);
                            $imgEl.attr('src', blobUrl).show();
                        } catch (e) {
                            $imgEl.attr('src', url).show();
                        }
                    } else {
                        $imgEl.attr('src', url).show();
                    }
                },
                onerror: function() {
                    $imgEl.attr('src', url).show();
                },
                ontimeout: function() {
                    $imgEl.attr('src', url).show();
                }
            });
        } else {
            $imgEl.attr('src', url).show();
        }
    }

function renderPreviewCard(data) {
        const card = getOrCreatePreviewCard();
        const $card = $(card);

        if (!data || !isValidPreviewData(data)) {
            $card.find('.mpc-loading').hide();
            $card.find('.mpc-content').hide();
            $card.find('.mpc-error-text').text(data?.previewError || '暂未获取到预览信息，可稍后重试');
            $card.find('.mpc-error').show();
            return;
        }

        $card.find('.mpc-loading').hide();
        $card.find('.mpc-error').hide();

        $card.find('.mpc-badge').text(data.source || 'IMDb').removeClass('imdb douban').addClass(data.sourceClass || 'imdb');
        $card.find('.mpc-title').text(data.title || '未知片名').attr('title', data.title || '');

        if (data.subTitle) {
            $card.find('.mpc-subtitle').text(data.subTitle).show();
        } else {
            $card.find('.mpc-subtitle').hide();
        }

        if (data.rating) {
            $card.find('.mpc-rating-row').show();
            $card.find('.mpc-rating-score').text(data.rating);
            $card.find('.mpc-rating-votes').text(data.votes ? `(${data.votes})` : '');
        } else {
            $card.find('.mpc-rating-row').hide();
        }

        if (data.meta) {
            $card.find('.mpc-meta').text(data.meta).show();
        } else {
            $card.find('.mpc-meta').hide();
        }

        if (data.description) {
            $card.find('.mpc-description').text(data.description).show();
        } else {
            $card.find('.mpc-description').hide();
        }
        $card.find('.mpc-notice').text(data.previewNotice || '').toggle(!!data.previewNotice);

        const $poster = $card.find('.mpc-poster');
        if (data.poster) {
            loadPosterImage($poster, data.poster, data.sourceClass === 'douban' ? 'https://movie.douban.com/' : 'https://www.imdb.com/');
            $card.find('.mpc-poster-wrap').show();
        } else {
            $card.find('.mpc-poster-wrap').hide();
        }

        $card.find('.mpc-content').show();
    }

function preloadPreview(type, info) {
        if (!info) return;
        const cacheKey = (type === 'imdb') 
            ? ('imdb_' + (typeof info === 'object' ? info.imdbId : info))
            : ('douban_' + (typeof info === 'object' ? (info.imdbId || info.title) : info));
        
        const cached = PREVIEW_CACHE.get(cacheKey);
        if (cached && !cached.isPartial) return;

        const runPreload = function() {
            if (type === 'imdb') {
                const id = typeof info === 'object' ? info.imdbId : info;
                fetchImdbPreview(id, function(data) {
                    if (data && data.poster) {
                        // 预热海报图片对象
                        const img = new Image();
                        img.src = data.poster;
                    }
                });
            } else if (type === 'douban') {
                fetchDoubanPreview(info, function(data) {
                    if (data && data.poster) {
                        const img = new Image();
                        img.src = data.poster;
                    }
                });
            }
        };

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(runPreload, { timeout: 3000 });
        } else {
            setTimeout(runPreload, 1200);
        }
    }

function bindHoverPreview(element, type, getInfoFn) {
        if (!element) return;
        const $el = $(element);
        $el.off('.doubanPreview');

        $el.on('mouseenter.doubanPreview', function() {
            if (hoverHideTimer) {
                clearTimeout(hoverHideTimer);
                hoverHideTimer = null;
            }

            const info = typeof getInfoFn === 'function' ? getInfoFn($el) : $el.data('imdbId');
            if (!info) return;

            const cacheKey = (type === 'imdb') 
                ? ('imdb_' + (typeof info === 'object' ? info.imdbId : info))
                : ('douban_' + (typeof info === 'object' ? (info.imdbId || info.title) : info));

            const cached = PREVIEW_CACHE.get(cacheKey);
            const hasCompleteCache = cached && !cached.isPartial && isValidPreviewData(cached);

            // 命中完整缓存时使用 60ms 超短防抖瞬间秒开；无缓存使用 150ms 避免用户快速扫过产生不必要开销
            const delay = hasCompleteCache ? 60 : 150;

            hoverShowTimer = setTimeout(function() {
                const reqId = ++currentPreviewRequestId;
                const card = getOrCreatePreviewCard();
                const $card = $(card);

                positionPreviewCard($el[0]);

                if (hasCompleteCache) {
                    renderPreviewCard(cached);
                    positionPreviewCard($el[0]);
                    card.classList.add('mpc-visible');
                    return;
                }

                // 若有 partial 缓存先展示已有内容，否则展示加载动画
                if (cached && isValidPreviewData(cached)) {
                    renderPreviewCard(cached);
                } else {
                    $card.find('.mpc-loading').show();
                    $card.find('.mpc-content').hide();
                    $card.find('.mpc-error').hide();
                }
                card.classList.add('mpc-visible');

                const handleData = function(data) {
                    // 竞态保护：用户若已将鼠标移动至其他链接，或卡片已关闭，则放弃更新
                    if (reqId !== currentPreviewRequestId) return;
                    if (!card.classList.contains('mpc-visible')) return;
                    if (data) {
                        renderPreviewCard(data);
                        positionPreviewCard($el[0]);
                    } else if (!cached) {
                        $card.find('.mpc-loading').hide();
                        $card.find('.mpc-content').hide();
                        $card.find('.mpc-error').show();
                    }
                };

                if (type === 'imdb') {
                    const id = typeof info === 'object' ? info.imdbId : info;
                    fetchImdbPreview(id, handleData);
                } else if (type === 'douban') {
                    fetchDoubanPreview(info, handleData);
                }
            }, delay);
        });

        $el.on('mouseleave.doubanPreview', function() {
            hidePreviewCard();
        });
    }


export { previewPopoverEl, hoverHideTimer, hoverShowTimer, currentPreviewRequestId, getDoubanPageContext, getOrCreatePreviewCard, positionPreviewCard, hidePreviewCard, loadPosterImage, renderPreviewCard, preloadPreview, bindHoverPreview };
