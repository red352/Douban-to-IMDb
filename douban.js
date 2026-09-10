// ==UserScript==
// @name         Douban to IMDb
// @version      2026.09.10
// @author       ryen
// @description  Sync Douban movie ratings to IMDb automatically - 自动同步豆瓣电影评分到IMDb
// @icon         https://pic1.zhimg.com/50/088ce5111d2958266db8675dfdba226c_720w.jpg
// @include      http*://www.imdb.com/*
// @include      http*://movie.douban.com/*
// @include      http*://search.douban.com/* 
// @copyright    2019+
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      www.imdb.com
// @connect      imdb.com
// @connect      *.imdb.com
// @connect      v3.sg.media-imdb.com
// @connect      movie.douban.com
// @connect      search.douban.com
// @connect      doubanio.com
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
                    imdblink.innerHTML = ' <a href="https://www.imdb.com/title/' + imdbcode + '" target="_blank" rel="noopener noreferrer" class="douban-imdb-link" data-imdb-id="' + imdbcode + '">' + imdbcode + '</a>';
                    imdb.parentNode.insertBefore(imdblink, imdb);
                    imdb.parentNode.removeChild(imdb);
                    console.log('[Douban to IMDb] IMDb 链接已添加:', imdbcode);

                    var $a = imdblink.querySelector('a');
                    if ($a) {
                        bindHoverPreview($a, 'imdb', function() { return imdbcode; });
                        preloadPreview('imdb', imdbcode);
                    }
                }
            }
        }
    }
    // ============================================================

    // ==================== Hover 悬停预览功能 ====================
    const PREVIEW_CACHE = new Map();
    const PREVIEW_STORAGE_KEY = 'douban_imdb_preview_cache_v2';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7天缓存
    let previewPopoverEl = null;
    let hoverHideTimer = null;
    let hoverShowTimer = null;
    let currentPreviewRequestId = 0;

    // 数据合法性校验：严禁只有 ID、没有实质内容的残缺数据进入系统或缓存
    function isValidPreviewData(data) {
        if (!data || typeof data !== 'object') return false;
        if (!data.title) return false;
        const cleanTitle = String(data.title).trim();
        if (/^tt\d+$/i.test(cleanTitle) && !data.poster && !data.rating && !data.meta && !data.description) {
            return false;
        }
        return true;
    }

    // 初始化二级持久化缓存（从 localStorage 恢复）
    (function initPreviewCache() {
        try {
            const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const now = Date.now();
            for (const key of Object.keys(parsed)) {
                const item = parsed[key];
                if (item && item.data && (now - item.timestamp < CACHE_TTL)) {
                    if (isValidPreviewData(item.data)) {
                        PREVIEW_CACHE.set(key, item.data);
                    }
                }
            }
        } catch (e) {
            // 忽略存储读取异常
        }
    })();

    // 将内存缓存持久化到 localStorage（限制条目上限，防膨胀）
    function saveCacheToStorage() {
        try {
            const cacheObj = {};
            const now = Date.now();
            let count = 0;
            const maxEntries = 120;
            for (const [key, data] of PREVIEW_CACHE.entries()) {
                if (isValidPreviewData(data) && !data.isPartial) {
                    cacheObj[key] = {
                        data: data,
                        timestamp: now
                    };
                    count++;
                    if (count >= maxEntries) break;
                }
            }
            localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(cacheObj));
        } catch (e) {
            // 忽略存储写入异常
        }
    }

    // 获取当前豆瓣电影详情页的上下文（用于给 IMDb 预览卡片补充中文对照副标题）
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
                    </div>
                </div>
                <div class="mpc-error" style="display:none;">
                    <span>暂未获取到预览信息，可尝试刷新</span>
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

        const $poster = $card.find('.mpc-poster');
        if (data.poster) {
            loadPosterImage($poster, data.poster, data.sourceClass === 'douban' ? 'https://movie.douban.com/' : 'https://www.imdb.com/');
            $card.find('.mpc-poster-wrap').show();
        } else {
            $card.find('.mpc-poster-wrap').hide();
        }

        $card.find('.mpc-content').show();
    }

    // 双轨渐进式获取 IMDb 信息：轻量 CDN Suggestion API 极速响应 + 完整详情页解析评分
    function fetchImdbPreview(imdbId, callback) {
        imdbId = (imdbId || '').trim();
        if (!imdbId) {
            callback(null);
            return;
        }

        const cacheKey = 'imdb_' + imdbId;
        const cached = PREVIEW_CACHE.get(cacheKey);
        // 若有完整（非 partial）有效缓存，直接同步返回
        if (cached && !cached.isPartial && isValidPreviewData(cached)) {
            callback(cached);
            return;
        }

        let suggestionDone = false;
        let detailDone = false;
        let currentBestData = (cached && isValidPreviewData(cached)) ? Object.assign({}, cached) : null;
        const doubanContext = getDoubanPageContext();

        const checkCompletion = function() {
            if (suggestionDone && detailDone) {
                if (currentBestData && isValidPreviewData(currentBestData)) {
                    PREVIEW_CACHE.set(cacheKey, currentBestData);
                    saveCacheToStorage();
                    callback(currentBestData);
                } else {
                    callback(null);
                }
            }
        };

        // 轨道 1：IMDb 官方全球 CloudFront CDN Suggestion API（100-200ms，极速稳定，免 WAF 挑战）
        const reqSuggestion = function() {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://v3.sg.media-imdb.com/suggestion/t/' + encodeURIComponent(imdbId) + '.json',
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                },
                timeout: 3000,
                onload: function(res) {
                    suggestionDone = true;
                    if (res.status === 200 && res.responseText) {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.d && Array.isArray(json.d) && json.d.length > 0) {
                                const item = json.d.find(function(it) { return it.id === imdbId; }) || json.d[0];
                                if (item && item.l) {
                                    const metaParts = [];
                                    if (item.y) metaParts.push(String(item.y));
                                    if (item.qid === 'tvSeries') {
                                        metaParts.push('剧集');
                                    } else if (item.q === 'feature' || item.qid === 'movie') {
                                        metaParts.push('电影');
                                    } else if (item.q) {
                                        metaParts.push(item.q);
                                    }
                                    if (item.s) metaParts.push(item.s);

                                    const sData = {
                                        source: 'IMDb',
                                        sourceClass: 'imdb',
                                        title: item.l,
                                        subTitle: doubanContext.chineseTitle || '',
                                        poster: item.i ? item.i.imageUrl : '',
                                        rating: null,
                                        votes: null,
                                        meta: metaParts.join(' • '),
                                        description: '',
                                        isPartial: true
                                    };

                                    // 如果此时完整详情尚未到达，先回传基础卡片（迅速呈现海报、标题、年份与主演）
                                    if (!detailDone) {
                                        currentBestData = Object.assign({}, currentBestData || {}, sData);
                                        PREVIEW_CACHE.set(cacheKey, currentBestData);
                                        callback(currentBestData, true);
                                    }
                                    return;
                                }
                            }
                        } catch (e) {
                            console.warn('[Preview] 解析 IMDb Suggestion 异常:', e);
                        }
                    }
                    checkCompletion();
                },
                onerror: function() {
                    suggestionDone = true;
                    checkCompletion();
                },
                ontimeout: function() {
                    suggestionDone = true;
                    checkCompletion();
                }
            });
        };

        // 轨道 2：IMDb 完整页面请求（提取真实评分、评价人数与剧情简介）
        const reqDetail = function() {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://www.imdb.com/title/' + imdbId + '/',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
                    'Referer': 'https://www.imdb.com/',
                    'User-Agent': navigator.userAgent
                },
                timeout: 4200,
                onload: function(response) {
                    detailDone = true;
                    // 严格检验状态码与返回内容长度：非 200 或被 WAF 挑战页（如 202/403 等）坚决不当做有效页面
                    if (response.status === 200 && response.responseText && response.responseText.length > 1500) {
                        try {
                            const html = response.responseText;
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(html, 'text/html');

                            let parsedData = null;
                            const ldScript = doc.querySelector('script[type="application/ld+json"]');
                            if (ldScript) {
                                try {
                                    const json = JSON.parse(ldScript.textContent);
                                    if (json.name) {
                                        parsedData = {
                                            source: 'IMDb',
                                            sourceClass: 'imdb',
                                            title: json.name,
                                            subTitle: doubanContext.chineseTitle || json.alternateName || '',
                                            poster: json.image || '',
                                            rating: json.aggregateRating ? String(json.aggregateRating.ratingValue) : null,
                                            votes: json.aggregateRating ? `${Number(json.aggregateRating.ratingCount).toLocaleString()} 评价` : null,
                                            meta: [
                                                json.datePublished ? json.datePublished.substring(0, 4) : '',
                                                Array.isArray(json.genre) ? json.genre.slice(0, 3).join(' / ') : json.genre
                                            ].filter(Boolean).join(' • '),
                                            description: json.description ? S(json.description).unescapeHTML().s : '',
                                            isPartial: false
                                        };
                                    }
                                } catch (e) {
                                    console.warn('[Preview] 解析 IMDb JSON-LD 异常:', e);
                                }
                            }

                            // 备用 2.1：从 __NEXT_DATA__ 解析
                            if (!parsedData) {
                                const nextScript = doc.querySelector('script#__NEXT_DATA__');
                                if (nextScript) {
                                    try {
                                        const nextJson = JSON.parse(nextScript.textContent);
                                        const titleData = nextJson.props?.pageProps?.aboveTheFoldData;
                                        if (titleData && titleData.titleText?.text) {
                                            parsedData = {
                                                source: 'IMDb',
                                                sourceClass: 'imdb',
                                                title: titleData.titleText.text,
                                                subTitle: doubanContext.chineseTitle || titleData.originalTitleText?.text || '',
                                                poster: titleData.primaryImage?.url || '',
                                                rating: titleData.ratingsSummary?.aggregateRating ? String(titleData.ratingsSummary.aggregateRating) : null,
                                                votes: titleData.ratingsSummary?.voteCount ? `${Number(titleData.ratingsSummary.voteCount).toLocaleString()} 评价` : null,
                                                meta: [
                                                    titleData.releaseYear?.year ? String(titleData.releaseYear.year) : '',
                                                    titleData.genres?.genres?.map(function(g) { return g.text; }).slice(0, 3).join(' / ') || ''
                                                ].filter(Boolean).join(' • '),
                                                description: titleData.plot?.plotText?.plainText || '',
                                                isPartial: false
                                            };
                                        }
                                    } catch (e) {
                                        console.warn('[Preview] 解析 IMDb __NEXT_DATA__ 异常:', e);
                                    }
                                }
                            }

                            // 备用 2.2：从 DOM 选择器解析（严格校验真实标题，绝不使用 imdbId 充数）
                            if (!parsedData) {
                                const heroTitle = doc.querySelector('h1[data-testid="hero__pageTitle"]')?.textContent?.trim();
                                if (heroTitle && heroTitle !== imdbId) {
                                    const rating = doc.querySelector('div[data-testid="hero-rating-bar__aggregate-rating__score"] span')?.textContent?.trim() || null;
                                    const poster = doc.querySelector('img.ipc-image')?.getAttribute('src') || '';
                                    parsedData = {
                                        source: 'IMDb',
                                        sourceClass: 'imdb',
                                        title: heroTitle,
                                        subTitle: doubanContext.chineseTitle || '',
                                        poster: poster,
                                        rating: rating,
                                        votes: null,
                                        meta: '',
                                        description: '',
                                        isPartial: false
                                    };
                                }
                            }

                            if (parsedData && isValidPreviewData(parsedData)) {
                                currentBestData = Object.assign({}, currentBestData || {}, parsedData);
                                currentBestData.isPartial = false;
                                PREVIEW_CACHE.set(cacheKey, currentBestData);
                                saveCacheToStorage();
                                callback(currentBestData);
                                return;
                            }
                        } catch (err) {
                            console.warn('[Preview] 处理 IMDb 详情页异常:', err);
                        }
                    }
                    checkCompletion();
                },
                onerror: function() {
                    detailDone = true;
                    checkCompletion();
                },
                ontimeout: function() {
                    detailDone = true;
                    checkCompletion();
                }
            });
        };

        // 并发触发两个轨道
        reqSuggestion();
        reqDetail();
    }

    function getImdbPageMediaInfo() {
        let title = $('h1[data-testid="hero__pageTitle"]').text().trim();
        let year = '';

        const metaText = $('ul.ipc-inline-list--show-dividers').first().text();
        const yearMatch = metaText ? metaText.match(/\b(19\d\d|20\d\d)\b/) : null;
        if (yearMatch) {
            year = yearMatch[1];
        }

        if (!title) {
            const docTitle = document.title || '';
            const match = docTitle.match(/^(.*?)\s*\((\d{4})\)/);
            if (match) {
                title = match[1].trim();
                year = match[2];
            } else {
                title = docTitle.replace(/ - IMDb.*$/i, '').trim();
            }
        }
        return { title: title, year: year };
    }

    function splitDoubanTitle(rawTitle) {
        let clean = (rawTitle || '').replace(/\u200e/g, '').trim();
        const match = clean.match(/^([\u4e00-\u9fa5\d\s·：:！!？?·\-—～~]+?)\s+([A-Za-z0-9\s:·'’\-—.,!?~]+(?:\s*\(\d{4}\))?)$/);
        if (match && match[1] && match[2]) {
            return {
                title: match[1].trim(),
                subTitle: match[2].trim()
            };
        }
        return {
            title: clean,
            subTitle: ''
        };
    }

    function fetchDoubanPreview(params, callback) {
        let imdbId = '';
        let queryTitle = '';
        let queryYear = '';

        if (typeof params === 'object' && params !== null) {
            imdbId = params.imdbId || '';
            queryTitle = params.title || '';
            queryYear = params.year || '';
        } else if (typeof params === 'string') {
            imdbId = params;
        }

        const cacheKey = 'douban_' + (imdbId || queryTitle);
        const cached = PREVIEW_CACHE.get(cacheKey);
        if (cached && isValidPreviewData(cached)) {
            callback(cached);
            return;
        }

        // 优先方案：直接通过 IMDb ID 请求豆瓣搜索页，提取 window.__DATA__
        if (imdbId && /^tt\d+$/i.test(imdbId.trim())) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://movie.douban.com/subject_search?search_text=' + encodeURIComponent(imdbId.trim()) + '&cat=1002',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': navigator.userAgent,
                    'Referer': 'https://movie.douban.com/'
                },
                timeout: 4500,
                onload: function(response) {
                    if (response.status === 200 && response.responseText) {
                        try {
                            const html = response.responseText;
                            const match = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\});/);
                            if (match) {
                                const dataJson = JSON.parse(match[1]);
                                if (dataJson.items && dataJson.items.length > 0) {
                                    const item = dataJson.items[0];
                                    const parsed = splitDoubanTitle(item.title);

                                    const data = {
                                        source: '豆瓣电影',
                                        sourceClass: 'douban',
                                        title: parsed.title || imdbId,
                                        subTitle: parsed.subTitle,
                                        poster: item.cover_url || '',
                                        rating: item.rating && item.rating.value ? item.rating.value.toFixed(1) : null,
                                        votes: item.rating && item.rating.count ? `${Number(item.rating.count).toLocaleString()} 评价` : null,
                                        meta: item.abstract || '',
                                        description: item.abstract_2 || '',
                                        isPartial: false
                                    };

                                    if (isValidPreviewData(data)) {
                                        PREVIEW_CACHE.set(cacheKey, data);
                                        saveCacheToStorage();
                                        callback(data);
                                        return;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[Preview] 解析豆瓣搜索页 __DATA__ 异常:', e);
                        }
                    }
                    fallbackDoubanSuggest(imdbId, queryTitle, queryYear, cacheKey, callback);
                },
                onerror: function() {
                    fallbackDoubanSuggest(imdbId, queryTitle, queryYear, cacheKey, callback);
                },
                ontimeout: function() {
                    fallbackDoubanSuggest(imdbId, queryTitle, queryYear, cacheKey, callback);
                }
            });
            return;
        }

        fallbackDoubanSuggest(imdbId, queryTitle, queryYear, cacheKey, callback);
    }

    function fallbackDoubanSuggest(imdbId, queryTitle, queryYear, cacheKey, callback) {
        if (!queryTitle) {
            const pageInfo = getImdbPageMediaInfo();
            queryTitle = pageInfo.title;
            if (!queryYear) queryYear = pageInfo.year;
        }

        const searchQuery = queryTitle || imdbId;
        if (!searchQuery) {
            callback(null);
            return;
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://movie.douban.com/j/subject_suggest?q=' + encodeURIComponent(searchQuery),
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'User-Agent': navigator.userAgent
            },
            timeout: 4000,
            onload: function(response) {
                if (response.status === 200 && response.responseText) {
                    try {
                        const list = JSON.parse(response.responseText);
                        if (Array.isArray(list) && list.length > 0) {
                            let matched = list[0];
                            if (queryYear) {
                                const yearMatched = list.find(function(item) {
                                    return item.year && String(item.year).trim() === String(queryYear).trim();
                                });
                                if (yearMatched) matched = yearMatched;
                            }

                            const data = {
                                source: '豆瓣电影',
                                sourceClass: 'douban',
                                title: matched.title,
                                subTitle: matched.sub_title || '',
                                poster: matched.img || '',
                                rating: null,
                                votes: null,
                                meta: matched.year ? `${matched.year} 年` : '',
                                description: '',
                                isPartial: true
                            };

                            if (isValidPreviewData(data)) {
                                PREVIEW_CACHE.set(cacheKey, data);
                                saveCacheToStorage();
                                callback(data);
                                return;
                            }
                        }
                    } catch (err) {
                        console.warn('[Preview] 豆瓣备用解析异常:', err);
                    }
                }
                callback(null);
            },
            onerror: function() {
                callback(null);
            },
            ontimeout: function() {
                callback(null);
            }
        });
    }

    // 智能闲时预取：在页面空闲时提前把预览数据拉取到本地缓存，鼠标悬停时 0ms 秒开
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

        $el.on('mouseenter', function() {
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

        $el.on('mouseleave', function() {
            hidePreviewCard();
        });
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

// 智能提取列表项中用户的实际豆瓣评分（有评分为 1~5 星，未评分为 null）
function extractMovieRatingFromItem($item) {
    if (!$item || !$item.length) return null;

    // 1. 查找评分 span (如 rating1-t 到 rating5-t)
    const $ratingSpan = $item.find('span[class*="rating"]');
    for (let i = 0; i < $ratingSpan.length; i++) {
        const cls = $ratingSpan.eq(i).attr('class') || '';
        const m = cls.match(/rating([1-5])-t/);
        if (m) return parseInt(m[1]);
    }

    // 2. 查找 allstar10 到 allstar50，或 stars1 到 stars5
    const $allstarSpan = $item.find('span[class*="allstar"], span[class*="stars"]');
    for (let i = 0; i < $allstarSpan.length; i++) {
        const cls = $allstarSpan.eq(i).attr('class') || '';
        let m = cls.match(/allstar([1-5])0/);
        if (m) return parseInt(m[1]);
        m = cls.match(/stars([1-5])\b/);
        if (m) return parseInt(m[1]);
    }

    // 3. 查找 title 属性（“力荐/推荐/还行/较差/很差”）
    const $titled = $item.find('[title*="力荐"], [title*="推荐"], [title*="还行"], [title*="较差"], [title*="很差"]');
    for (let i = 0; i < $titled.length; i++) {
        const t = $titled.eq(i).attr('title') || '';
        if (t.includes('力荐')) return 5;
        if (t.includes('推荐')) return 4;
        if (t.includes('还行')) return 3;
        if (t.includes('较差')) return 2;
        if (t.includes('很差')) return 1;
    }

    return null;
}

// 智能提取详情页中用户的实际豆瓣评分（有评分为 1~5 星，未评分为 null）
function extractSubjectUserRating() {
    // 策略 1：在 #interest_sect_level 操作区内检索
    const $sect = $('#interest_sect_level');
    if ($sect.length) {
        // 1.1 精准查找 span/div 中的 allstar 类（如 allstar50 ~ allstar10）
        const $allstars = $sect.find('[class*="allstar"]');
        for (let i = 0; i < $allstars.length; i++) {
            const cls = $allstars.eq(i).attr('class') || '';
            const m = cls.match(/allstar([1-5])0/);
            if (m) {
                const r = parseInt(m[1]);
                console.log('[Douban to IMDb] 成功从 #interest_sect_level allstar 识别用户评分:', r);
                return r;
            }
        }

        // 1.2 检查已打分星星的 starstop / a_stars / n_rating / rating_stars 类
        const $stars = $sect.find('.starstop, .j.a_stars span, #n_rating, .rating_stars, span[class*="stars"]');
        for (let i = 0; i < $stars.length; i++) {
            const cls = $stars.eq(i).attr('class') || '';
            let m = cls.match(/allstar([1-5])0/) || cls.match(/stars([1-5])\b/) || cls.match(/rating([1-5])\b/);
            if (m) {
                const r = parseInt(m[1]);
                console.log('[Douban to IMDb] 成功从星星类名识别用户评分:', r);
                return r;
            }
        }

        // 1.3 检查 title 属性（“力荐/推荐/还行/较差/很差”）
        const $titled = $sect.find('[title*="力荐"], [title*="推荐"], [title*="还行"], [title*="较差"], [title*="很差"]');
        if ($titled.length) {
            for (let i = 0; i < $titled.length; i++) {
                const t = $titled.eq(i).attr('title') || '';
                if (t.includes('力荐')) return 5;
                if (t.includes('推荐')) return 4;
                if (t.includes('还行')) return 3;
                if (t.includes('较差')) return 2;
                if (t.includes('很差')) return 1;
            }
        }

        // 1.4 检查操作区完整文本（同时兼容全角冒号、半角冒号与空格）
        const text = $sect.text() || '';
        if (text.includes('力荐')) return 5;
        if (text.includes('推荐')) return 4;
        if (text.includes('还行')) return 3;
        if (text.includes('较差')) return 2;
        if (text.includes('很差')) return 1;
    }

    // 策略 2：全页面排除全网平均分框 (#interest_sectl)，在整个页面文章主体中查找用户的实际打分痕迹
    const $article = $('#content .article, #content');
    if ($article.length) {
        // 查找包含 allstar 的元素，排除 #interest_sectl 下的全网平均分
        const $outsideStars = $article.find('[class*="allstar"]').not('#interest_sectl *');
        for (let i = 0; i < $outsideStars.length; i++) {
            const cls = $outsideStars.eq(i).attr('class') || '';
            const m = cls.match(/allstar([1-5])0/);
            if (m) {
                const r = parseInt(m[1]);
                console.log('[Douban to IMDb] 成功从页面主体识别用户评分:', r);
                return r;
            }
        }

        // 查找包含“你的评价/我的评价”文本的容器
        const $evalTextEls = $article.find('*').filter(function() {
            const t = $(this).text();
            return (t.includes('你的评价') || t.includes('我的评价')) && $(this).children().length <= 2;
        });
        for (let i = 0; i < $evalTextEls.length; i++) {
            const t = $evalTextEls.eq(i).text() || '';
            if (t.includes('力荐')) return 5;
            if (t.includes('推荐')) return 4;
            if (t.includes('还行')) return 3;
            if (t.includes('较差')) return 2;
            if (t.includes('很差')) return 1;
        }
    }

    console.log('[Douban to IMDb] 未检测到详情页当前用户豆瓣评分');
    return null;
}

// 显示本页批量同步选择对话框（包含电影多选列表、全选选择器、同步目标选择）
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

// 电影详情页单片同步对话框
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

// 触发当前电影详情页同步
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

// 在电影详情页注入同步按钮（只在海报下方的想看/看过操作区保留唯一的同步按钮，完美融入豆瓣排版）
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
    const $syncButtons = $('.sync-imdb-btn').not('.syncing, .synced, .subject-sync-btn, .subject-info-sync-btn');
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
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.6) !important;
        z-index: 99999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0;
        transition: opacity 0.25s ease;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 20px !important;
        overflow-y: auto !important;
    }
    .sync-target-dialog-overlay.show {
        opacity: 1;
    }
    .sync-target-dialog {
        background: white !important;
        border-radius: 12px !important;
        padding: 30px !important;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 16px 48px rgba(0,0,0,0.3) !important;
        transform: scale(0.92);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        margin: auto !important;
        box-sizing: border-box !important;
        position: relative !important;
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

    /* 批量同步本页选择对话框样式 */
    .sync-batch-page-dialog {
        max-width: 620px;
        width: 92%;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        padding: 24px !important;
        border-radius: 12px !important;
        box-sizing: border-box !important;
        margin: auto !important;
        position: relative !important;
    }
    .sync-batch-head h3 {
        margin: 0;
        font-size: 20px;
        color: #222;
        font-weight: 700;
    }
    .sync-batch-title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .sync-dialog-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #999;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        transition: color 0.2s;
    }
    .sync-dialog-close:hover {
        color: #333;
    }
    .sync-batch-desc {
        margin: 6px 0 16px 0;
        font-size: 13px;
        color: #666;
    }
    .sync-target-tabs {
        display: flex;
        gap: 12px;
        margin-bottom: 14px;
    }
    .sync-target-tab {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        cursor: pointer;
        background: #fafafa;
        transition: all 0.2s ease;
        box-sizing: border-box;
    }
    .sync-target-tab:hover {
        border-color: #667eea;
        background: #f8f9ff;
    }
    .sync-target-tab.active {
        border-color: #667eea;
        background: #f0f3ff;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
    }
    .sync-target-tab .tab-icon {
        font-size: 22px;
        flex-shrink: 0;
    }
    .sync-target-tab .tab-title {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: #333;
    }
    .sync-target-tab .tab-desc {
        display: block;
        font-size: 11px;
        color: #888;
        margin-top: 2px;
    }
    .sync-list-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #f3f4f6;
        border-radius: 6px;
        font-size: 13px;
        color: #4b5563;
        margin-bottom: 8px;
        box-sizing: border-box;
    }
    .sync-toolbar-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .sync-select-all-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-weight: 600;
        user-select: none;
        color: #374151;
    }
    .sync-action-link {
        background: none;
        border: none;
        color: #667eea;
        cursor: pointer;
        font-size: 12px;
        padding: 0;
        text-decoration: underline;
    }
    .sync-action-link:hover {
        color: #4c51bf;
    }
    .sync-toolbar-right strong {
        color: #667eea;
        font-size: 14px;
    }
    .sync-movies-scroll-list {
        flex: 1;
        overflow-y: auto;
        max-height: 300px;
        min-height: 160px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 4px;
        background: #fff;
        box-sizing: border-box;
    }
    .sync-movie-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        transition: background 0.15s;
        user-select: none;
    }
    .sync-movie-item:last-child {
        border-bottom: none;
    }
    .sync-movie-item:hover {
        background: #f9fafb;
    }
    .sync-movie-item.selected {
        background: #f4f6ff;
    }
    .sync-movie-cb-wrap {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .sync-movie-cb {
        cursor: pointer;
        width: 15px;
        height: 15px;
    }
    .sync-movie-num {
        font-size: 11px;
        color: #9ca3af;
        min-width: 18px;
        text-align: center;
        flex-shrink: 0;
    }
    .sync-movie-thumb {
        width: 30px;
        height: 42px;
        object-fit: cover;
        border-radius: 4px;
        background: #e5e7eb;
        flex-shrink: 0;
    }
    .sync-movie-thumb.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
    }
    .sync-movie-details {
        flex: 1;
        min-width: 0;
    }
    .sync-movie-title {
        font-size: 13px;
        font-weight: 600;
        color: #1f2937;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .sync-movie-meta {
        font-size: 11px;
        color: #6b7280;
        margin-top: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .sync-movie-star {
        color: #f59e0b;
        letter-spacing: 0.5px;
    }
    .sync-movie-score {
        color: #4b5563;
    }
    .sync-movie-unrated {
        display: inline-block;
        padding: 1px 6px;
        background: #f3f4f6;
        color: #9ca3af;
        border-radius: 4px;
        font-size: 11px;
    }
    .sync-auto-badge {
        display: inline-block;
        padding: 1px 6px;
        background: #ecfdf5;
        color: #059669;
        border: 1px solid #a7f3d0;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        margin-left: 6px;
        vertical-align: middle;
    }
    .subject-unselected-hint {
        color: #d97706;
        font-size: 12px;
        font-weight: normal;
    }
    .sync-batch-foot {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
    }
    .sync-btn-cancel {
        padding: 8px 18px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #fff;
        color: #4b5563;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .sync-btn-cancel:hover {
        background: #f3f4f6;
    }
    .sync-btn-submit {
        padding: 8px 22px;
        border: none;
        border-radius: 6px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
    }
    .sync-btn-submit:hover {
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transform: translateY(-1px);
    }
    .sync-btn-submit.disabled, .sync-btn-submit:disabled {
        background: #9ca3af;
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
    }

    /* 电影详情页单片同步弹窗样式 */
    .subject-single-sync-dialog {
        max-width: 460px;
        width: 90%;
        padding: 22px !important;
        border-radius: 12px !important;
        box-sizing: border-box !important;
        margin: auto !important;
        position: relative !important;
    }
    .subject-sync-media-card {
        display: flex;
        align-items: center;
        gap: 14px;
        background: #f9fafb;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        margin-bottom: 14px;
    }
    .subject-sync-thumb {
        width: 48px;
        height: 68px;
        object-fit: cover;
        border-radius: 4px;
        background: #e5e7eb;
        flex-shrink: 0;
    }
    .subject-sync-thumb.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
    }
    .subject-sync-media-info {
        flex: 1;
        min-width: 0;
    }
    .subject-sync-media-title {
        font-size: 15px;
        font-weight: 700;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .subject-sync-media-meta {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
    }
    .subject-sync-media-meta strong {
        color: #111827;
    }
    .subject-sync-rating-selector {
        margin-bottom: 6px;
        padding: 12px;
        background: #f9fafb;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
    }
    .subject-sync-rating-label {
        font-size: 13px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
    }
    .subject-sync-rating-text {
        color: #d97706;
        font-weight: 700;
    }
    .subject-rating-stars-bar {
        display: flex;
        gap: 6px;
    }
    .subject-star-opt {
        flex: 1;
        text-align: center;
        padding: 6px 2px;
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        line-height: 1.3;
        color: #4b5563;
        transition: all 0.15s;
    }
    .subject-star-opt:hover {
        border-color: #f59e0b;
        color: #f59e0b;
    }
    .subject-star-opt.active {
        background: #fffbeb;
        border-color: #f59e0b;
        color: #d97706;
        font-weight: bold;
    }

    /* 详情页专属同步按钮 */
    .subject-info-sync-btn {
        margin-left: 8px !important;
        vertical-align: middle;
        font-size: 11px !important;
        padding: 2px 8px !important;
        background: #0091EA !important;
        color: white !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        border: none !important;
        transition: background 0.2s !important;
        line-height: 1.4 !important;
    }
    .subject-info-sync-btn:hover {
        background: #0277BD !important;
    }
    .subject-sync-action-wrap {
        clear: both !important;
        display: block !important;
        margin-top: 8px !important;
        margin-bottom: 4px !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }
    .subject-action-sync-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        width: 100% !important;
        max-width: 155px !important;
        padding: 4px 8px !important;
        background: #fbfbf8 !important;
        color: #37a !important;
        border: 1px solid #d4d8db !important;
        border-radius: 3px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        line-height: 1.5 !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        transition: all 0.2s ease !important;
        text-decoration: none !important;
        outline: none !important;
    }
    .subject-action-sync-btn:hover {
        background: #ffffff !important;
        border-color: #e2b616 !important;
        box-shadow: 0 1px 4px rgba(226, 182, 22, 0.2) !important;
    }
    .subject-action-sync-btn:active {
        background: #f3f3ee !important;
        transform: translateY(1px) !important;
    }
    .subject-sync-imdb-badge {
        display: inline-block !important;
        background: #f5c518 !important;
        color: #000000 !important;
        font-family: Impact, "Arial Black", Arial, Helvetica, sans-serif !important;
        font-size: 10px !important;
        font-weight: 800 !important;
        padding: 0 4px !important;
        border-radius: 2px !important;
        line-height: 14px !important;
        letter-spacing: 0.2px !important;
    }
    .subject-sync-btn-label {
        font-size: 12px !important;
        color: #3377aa !important;
        font-weight: 500 !important;
    }
    .subject-action-sync-btn:hover .subject-sync-btn-label {
        color: #111111 !important;
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

    /* ==================== 悬停预览卡片 Popover 样式 ==================== */
    .media-preview-card {
        position: fixed;
        z-index: 9999999;
        width: 330px;
        background: #ffffff;
        color: #1a1a1a;
        border-radius: 10px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.15);
        padding: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        opacity: 0;
        visibility: hidden;
        transform: translateY(6px);
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
        pointer-events: auto;
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-sizing: border-box;
    }

    .media-preview-card * {
        box-sizing: border-box;
    }

    .media-preview-card.mpc-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    .mpc-loading, .mpc-error {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px 10px;
        color: #666;
        font-size: 12px;
    }

    .mpc-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e0e0e0;
        border-top-color: #3377aa;
        border-radius: 50%;
        animation: mpc-spin 0.7s linear infinite;
    }

    @keyframes mpc-spin {
        to { transform: rotate(360deg); }
    }

    .mpc-content {
        display: flex;
        gap: 12px;
    }

    .mpc-poster-wrap {
        flex-shrink: 0;
        width: 80px;
        height: 116px;
        border-radius: 6px;
        overflow: hidden;
        background: #eee;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }

    .mpc-poster {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .mpc-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    .mpc-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
        width: 100%;
        min-width: 0;
    }

    .mpc-badge {
        display: inline-block;
        flex-shrink: 0;
        white-space: nowrap;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        line-height: 1.2;
        height: fit-content;
        box-sizing: border-box;
    }

    .mpc-badge.imdb {
        background: #f5c518;
        color: #000000;
    }

    .mpc-badge.douban {
        background: #007722;
        color: #ffffff;
    }

    .mpc-title {
        font-size: 14px;
        font-weight: 600;
        color: #111;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
        flex: 1;
    }

    .mpc-subtitle {
        font-size: 11px;
        color: #777;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
        min-width: 0;
        width: 100%;
    }

    .mpc-rating-row {
        display: flex;
        align-items: baseline;
        gap: 4px;
        margin-bottom: 4px;
    }

    .mpc-star {
        color: #f5a623;
        font-size: 14px;
    }

    .mpc-rating-score {
        font-size: 15px;
        font-weight: 700;
        color: #e09015;
    }

    .mpc-rating-max {
        font-size: 11px;
        color: #999;
    }

    .mpc-rating-votes {
        font-size: 11px;
        color: #888;
        margin-left: 4px;
    }

    .mpc-meta {
        font-size: 11px;
        color: #666;
        margin-bottom: 6px;
    }

    .mpc-description {
        font-size: 11px;
        color: #555;
        line-height: 1.4;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
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
    
    // 在"我看过的电影"、"我想看的电影"等真实列表页面添加同步按钮
    function initMovieListPage() {
        const path = location.pathname;
        const search = location.search;

        // 精确判定：必须是具体的电影分类列表页，排除个人主页 overview 概览页
        const isCollect = path.includes('/collect') || search.includes('status=collect');
        const isWish = path.includes('/wish') || search.includes('status=wish');
        const isDo = path.includes('/do') || search.includes('status=do');
        const isTagOrDoulist = path.includes('/tag/') || path.includes('/doulist/');
        const isNormalSearch = (path.includes('/search') && !path.includes('/subject_search'));

        const isListPage = isCollect || isWish || isDo || isTagOrDoulist || isNormalSearch;

        // 如果不是具体分类列表（例如单纯的 /mine 概览页，或 /people/xxx/ 个人主页未带分类），直接退出，绝不误弹错误提示！
        if (!isListPage) {
            return;
        }

        // 极速就绪检测：避免硬性死等 2000ms，通常在 50~100ms 即可立即加载
        let checkAttempts = 0;
        const maxChecks = 20; // 20 * 50ms = 最多等待 1 秒
        const checkTimer = setInterval(function() {
            checkAttempts++;
            let $items = $('#content .article .item, .grid-view .item, .list-view .item, #content .item');
            if ($items.length > 0) {
                clearInterval(checkTimer);
                setupMovieListPage($items, isWish);
            } else if (checkAttempts >= maxChecks) {
                clearInterval(checkTimer);
                // 达到最大尝试次数仍无项目，静默退出，严禁弹出错误 Toast 骚扰用户
                console.log('[Douban to IMDb] 当前列表未检测到电影项目');
            }
        }, 50);
    }

    function setupMovieListPage($items, isWish) {
        console.log('[Douban to IMDb] 快速初始化电影列表，数量:', $items.length);

        $items.each(function(index) {
            const $item = $(this);
            const $title = $item.find('li.title a, .info h2 a, .title a').first();

            if ($title.length) {
                if ($title.parent().find('.sync-imdb-btn').length > 0) {
                    return;
                }

                const movieUrl = $title.attr('href');
                const movieTitle = $title.find('em').text() || $title.text().trim();
                const rating = extractMovieRatingFromItem($item); // 智能提取评分：1~5，未评分为 null

                // 按钮文案：有实际评分显示“同步(4★)”，无评分在想看页显示“同步(想看)”，其他无评分显示“同步”
                let btnText = '同步';
                if (rating) {
                    btnText = '同步(' + rating + '★)';
                } else if (isWish) {
                    btnText = '同步(想看)';
                } else {
                    btnText = '同步';
                }

                const $btn = $('<button type="button" class="sync-imdb-btn">' + btnText + '</button>');
                $title.parent().append($btn);

                $btn.on('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if ($btn.hasClass('syncing')) return;

                    showSyncTargetDialog(function(target) {
                        if (!target) return; // 用户取消

                        const finalRating = (target === CONFIG.SYNC_TARGET.RATING && !rating) ? 5 : (rating || 5);

                        console.log('[Douban to IMDb] 开始同步:', movieTitle, '评分:', finalRating + '星', '目标:', target);
                        $btn.addClass('syncing').text('同步中...');

                        const syncUrl = movieUrl + '#sync-' + finalRating + '-' + target;
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

                        const targetText = target === CONFIG.SYNC_TARGET.RATING ? `已看(评分: ${finalRating * 2}分)` : '想看(Watchlist)';
                        showToast(`正在同步到${targetText}: ${movieTitle}`, 'success');

                        setTimeout(() => {
                            $btn.removeClass('syncing').addClass('synced').text('已同步✓');
                            updateFloatButtonCount();
                        }, CONFIG.BUTTON_STATE_UPDATE_DELAY);
                    });
                });
            }
        });

        // 添加右侧悬浮批量同步按钮
        addFloatButton();

        // 自动同步子页面检测与处理
        if (location.hash.startsWith('#auto-sync')) {
            console.log('[Douban to IMDb] 检测到自动同步标记，这是子页面');
            const hashParts = location.hash.split('-');
            const target = hashParts[2] || CONFIG.SYNC_TARGET.RATING;
            const batchId = 'batch-auto-' + Date.now();

            setTimeout(() => {
                const $syncButtons = $('.sync-imdb-btn').not('.syncing, .synced, .subject-action-sync-btn');
                const openedTabs = [];

                $syncButtons.each(function(index) {
                    const $btn = $(this);
                    setTimeout(() => {
                        if (!$btn.hasClass('syncing') && !$btn.hasClass('synced')) {
                            const movieTitle = $btn.parent().find('a em').text() || $btn.parent().find('a').text();
                            $btn.addClass('syncing').text('同步中...');

                            const movieUrl = $btn.parent().find('a').attr('href');
                            const $parentItem = $btn.closest('.item');
                            const itemRating = extractMovieRatingFromItem($parentItem) || 5;

                            const syncUrl = movieUrl + '#sync-' + itemRating + '-' + target + '-' + batchId + '-' + index;
                            const newTab = window.open(syncUrl, '_blank');

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

                const checkInterval = setInterval(() => {
                    openedTabs.forEach((item, i) => {
                        if (item.tab && item.tab.closed) {
                            item.button.removeClass('syncing').addClass('synced').text('已同步✓');
                            openedTabs.splice(i, 1);
                        }
                    });

                    if (openedTabs.length === 0 && $syncButtons.length > 0) {
                        clearInterval(checkInterval);
                        console.log('[Douban to IMDb] 子页面同步完成');
                        document.title = '[已完成] ' + document.title;
                    }
                }, 1000);
            }, CONFIG.AUTO_SYNC_START_DELAY);
        }
    }

    // 启动列表页检测
    initMovieListPage();

    // 在电影详情页添加 IMDb 链接与同步按钮
    if (location.pathname.includes('/subject/')) {
        // 等待页面加载完成后添加 IMDb 链接与同步按钮
        setTimeout(function() {
            addImdbLinkBack();
            addSubjectPageSyncButtons();
        }, 500);
        setTimeout(function() {
            addSubjectPageSyncButtons();
        }, 1500);
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
            let doubanLink = 'https://movie.douban.com/subject_search?search_text=' + id + '&from_imdb=true';
            let $doubanBtn = $('<li role="presentation" class="ipc-inline-list__item"><a target="_blank" href="' + doubanLink + '" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color douban-preview-link" data-imdb-id="' + id + '" data-testid="hero-subnav-bar-imdb-pro-link">Douban</a></li>');
            $('ul[data-testid="hero-subnav-bar-topic-links"]').append($doubanBtn);
            bindHoverPreview($doubanBtn.find('a')[0], 'douban', function() { return id; });
            preloadPreview('douban', id);
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
function insertLinks(id, title) {
    var entitle = encodeURIComponent(title)
    var douban = '<a href="https://movie.douban.com/subject_search?search_text=' + id + '&cat=1002&from_imdb=true" target="_blank" class="douban-preview-link" data-imdb-id="' + id + '">douban</a>'
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
