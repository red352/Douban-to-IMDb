import { PREVIEW_CACHE, isValidPreviewData, saveCacheToStorage } from './cache.js';

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


export { getImdbPageMediaInfo, splitDoubanTitle, fetchDoubanPreview, fallbackDoubanSuggest };
