import { PREVIEW_CACHE, isValidPreviewData, saveCacheToStorage } from './cache.js';
import { decodeEntities } from '../core/text.js';
import { getDoubanPageContext } from './ui.js';

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
                                            description: json.description ? decodeEntities(json.description) : '',
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


export { fetchImdbPreview };
