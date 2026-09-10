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
// @run-at       document-start
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
// ==/UserScript==
(() => {
  // src/sync/protocol.js
  function parseDoubanHash(hash) {
    const parts = hash.replace(/^#sync-/, "").split("-");
    const rating = Math.min(5, Math.max(1, Number.parseInt(parts.shift(), 10) || 5));
    const target = parts.shift() === "watchlist" ? "watchlist" : "rating";
    const movieIndex = parts.length > 1 ? Number.parseInt(parts.pop(), 10) || 0 : 0;
    return { rating, target, batchId: parts.join("-") || "single", movieIndex };
  }
  function parseImdbHash(hash) {
    const parts = hash.replace(/^#/, "").split("-");
    const score = parts.shift();
    const target = parts.shift() === "watchlist" ? "watchlist" : "rating";
    const doubanId = parts.pop() || "";
    const movieIndex = Number.parseInt(parts.pop(), 10) || 0;
    const batchId = parts.join("-") || "single";
    const valid = /^(10|[1-9])$/.test(score) && /^\d+$/.test(doubanId);
    return { score: valid ? score : "", target, batchId, movieIndex, doubanId };
  }

  // src/sync/ratings.js
  function extractMovieRatingFromItem($item) {
    if (!$item || !$item.length) return null;
    const $ratingSpan = $item.find('span[class*="rating"]');
    for (let i = 0; i < $ratingSpan.length; i++) {
      const cls = $ratingSpan.eq(i).attr("class") || "";
      const m = cls.match(/rating([1-5])-t/);
      if (m) return parseInt(m[1]);
    }
    const $allstarSpan = $item.find('span[class*="allstar"], span[class*="stars"]');
    for (let i = 0; i < $allstarSpan.length; i++) {
      const cls = $allstarSpan.eq(i).attr("class") || "";
      let m = cls.match(/allstar([1-5])0/);
      if (m) return parseInt(m[1]);
      m = cls.match(/stars([1-5])\b/);
      if (m) return parseInt(m[1]);
    }
    const $titled = $item.find('[title*="力荐"], [title*="推荐"], [title*="还行"], [title*="较差"], [title*="很差"]');
    for (let i = 0; i < $titled.length; i++) {
      const t = $titled.eq(i).attr("title") || "";
      if (t.includes("力荐")) return 5;
      if (t.includes("推荐")) return 4;
      if (t.includes("还行")) return 3;
      if (t.includes("较差")) return 2;
      if (t.includes("很差")) return 1;
    }
    return null;
  }
  function extractSubjectUserRating() {
    const $sect = $("#interest_sect_level");
    if ($sect.length) {
      const $allstars = $sect.find('[class*="allstar"]');
      for (let i = 0; i < $allstars.length; i++) {
        const cls = $allstars.eq(i).attr("class") || "";
        const m = cls.match(/allstar([1-5])0/);
        if (m) {
          const r = parseInt(m[1]);
          console.log("[Douban to IMDb] 成功从 #interest_sect_level allstar 识别用户评分:", r);
          return r;
        }
      }
      const $stars = $sect.find('.starstop, .j.a_stars span, #n_rating, .rating_stars, span[class*="stars"]');
      for (let i = 0; i < $stars.length; i++) {
        const cls = $stars.eq(i).attr("class") || "";
        let m = cls.match(/allstar([1-5])0/) || cls.match(/stars([1-5])\b/) || cls.match(/rating([1-5])\b/);
        if (m) {
          const r = parseInt(m[1]);
          console.log("[Douban to IMDb] 成功从星星类名识别用户评分:", r);
          return r;
        }
      }
      const $titled = $sect.find('[title*="力荐"], [title*="推荐"], [title*="还行"], [title*="较差"], [title*="很差"]');
      if ($titled.length) {
        for (let i = 0; i < $titled.length; i++) {
          const t = $titled.eq(i).attr("title") || "";
          if (t.includes("力荐")) return 5;
          if (t.includes("推荐")) return 4;
          if (t.includes("还行")) return 3;
          if (t.includes("较差")) return 2;
          if (t.includes("很差")) return 1;
        }
      }
      const text = $sect.text() || "";
      if (text.includes("力荐")) return 5;
      if (text.includes("推荐")) return 4;
      if (text.includes("还行")) return 3;
      if (text.includes("较差")) return 2;
      if (text.includes("很差")) return 1;
    }
    const $article = $("#content .article, #content");
    if ($article.length) {
      const $outsideStars = $article.find('[class*="allstar"]').not("#interest_sectl *");
      for (let i = 0; i < $outsideStars.length; i++) {
        const cls = $outsideStars.eq(i).attr("class") || "";
        const m = cls.match(/allstar([1-5])0/);
        if (m) {
          const r = parseInt(m[1]);
          console.log("[Douban to IMDb] 成功从页面主体识别用户评分:", r);
          return r;
        }
      }
      const $evalTextEls = $article.find("*").filter(function() {
        const t = $(this).text();
        return (t.includes("你的评价") || t.includes("我的评价")) && $(this).children().length <= 2;
      });
      for (let i = 0; i < $evalTextEls.length; i++) {
        const t = $evalTextEls.eq(i).text() || "";
        if (t.includes("力荐")) return 5;
        if (t.includes("推荐")) return 4;
        if (t.includes("还行")) return 3;
        if (t.includes("较差")) return 2;
        if (t.includes("很差")) return 1;
      }
    }
    console.log("[Douban to IMDb] 未检测到详情页当前用户豆瓣评分");
    return null;
  }

  // src/preview/cache.js
  var PREVIEW_CACHE = /* @__PURE__ */ new Map();
  var PREVIEW_STORAGE_KEY = "douban_imdb_preview_cache_v2";
  var CACHE_TTL = 7 * 24 * 60 * 60 * 1e3;
  function isValidPreviewData(data) {
    if (!data || typeof data !== "object") return false;
    if (!data.title) return false;
    const cleanTitle = String(data.title).trim();
    if (/^tt\d+$/i.test(cleanTitle) && !data.poster && !data.rating && !data.meta && !data.description) {
      return false;
    }
    return true;
  }
  (function initPreviewCache() {
    try {
      const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const now = Date.now();
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        if (item && item.data && now - item.timestamp < CACHE_TTL) {
          if (isValidPreviewData(item.data)) {
            PREVIEW_CACHE.set(key, item.data);
          }
        }
      }
    } catch (e) {
    }
  })();
  function saveCacheToStorage() {
    try {
      const cacheObj = {};
      const now = Date.now();
      let count = 0;
      const maxEntries = 120;
      for (const [key, data] of PREVIEW_CACHE.entries()) {
        if (isValidPreviewData(data) && !data.isPartial) {
          cacheObj[key] = {
            data,
            timestamp: now
          };
          count++;
          if (count >= maxEntries) break;
        }
      }
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(cacheObj));
    } catch (e) {
    }
  }

  // src/core/text.js
  function decodeEntities(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  // src/preview/imdb.js
  function fetchImdbPreview(imdbId, callback) {
    imdbId = (imdbId || "").trim();
    if (!imdbId) {
      callback(null);
      return;
    }
    const cacheKey = "imdb_" + imdbId;
    const cached = PREVIEW_CACHE.get(cacheKey);
    if (cached && !cached.isPartial && isValidPreviewData(cached)) {
      callback(cached);
      return;
    }
    let suggestionDone = false;
    let detailDone = false;
    let currentBestData = cached && isValidPreviewData(cached) ? Object.assign({}, cached) : null;
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
    const reqSuggestion = function() {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://v3.sg.media-imdb.com/suggestion/t/" + encodeURIComponent(imdbId) + ".json",
        headers: {
          "Accept": "application/json, text/plain, */*"
        },
        timeout: 3e3,
        onload: function(res) {
          suggestionDone = true;
          if (res.status === 200 && res.responseText) {
            try {
              const json = JSON.parse(res.responseText);
              if (json.d && Array.isArray(json.d) && json.d.length > 0) {
                const item = json.d.find(function(it) {
                  return it.id === imdbId;
                }) || json.d[0];
                if (item && item.l) {
                  const metaParts = [];
                  if (item.y) metaParts.push(String(item.y));
                  if (item.qid === "tvSeries") {
                    metaParts.push("剧集");
                  } else if (item.q === "feature" || item.qid === "movie") {
                    metaParts.push("电影");
                  } else if (item.q) {
                    metaParts.push(item.q);
                  }
                  if (item.s) metaParts.push(item.s);
                  const sData = {
                    source: "IMDb",
                    sourceClass: "imdb",
                    title: item.l,
                    subTitle: doubanContext.chineseTitle || "",
                    poster: item.i ? item.i.imageUrl : "",
                    rating: null,
                    votes: null,
                    meta: metaParts.join(" • "),
                    description: "",
                    isPartial: true
                  };
                  if (!detailDone) {
                    currentBestData = Object.assign({}, currentBestData || {}, sData);
                    PREVIEW_CACHE.set(cacheKey, currentBestData);
                    callback(currentBestData, true);
                  }
                  return;
                }
              }
            } catch (e) {
              console.warn("[Preview] 解析 IMDb Suggestion 异常:", e);
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
    const reqDetail = function() {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://www.imdb.com/title/" + imdbId + "/",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          "Referer": "https://www.imdb.com/",
          "User-Agent": navigator.userAgent
        },
        timeout: 4200,
        onload: function(response) {
          detailDone = true;
          if (response.status === 200 && response.responseText && response.responseText.length > 1500) {
            try {
              const html = response.responseText;
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, "text/html");
              let parsedData = null;
              const ldScript = doc.querySelector('script[type="application/ld+json"]');
              if (ldScript) {
                try {
                  const json = JSON.parse(ldScript.textContent);
                  if (json.name) {
                    parsedData = {
                      source: "IMDb",
                      sourceClass: "imdb",
                      title: json.name,
                      subTitle: doubanContext.chineseTitle || json.alternateName || "",
                      poster: json.image || "",
                      rating: json.aggregateRating ? String(json.aggregateRating.ratingValue) : null,
                      votes: json.aggregateRating ? `${Number(json.aggregateRating.ratingCount).toLocaleString()} 评价` : null,
                      meta: [
                        json.datePublished ? json.datePublished.substring(0, 4) : "",
                        Array.isArray(json.genre) ? json.genre.slice(0, 3).join(" / ") : json.genre
                      ].filter(Boolean).join(" • "),
                      description: json.description ? decodeEntities(json.description) : "",
                      isPartial: false
                    };
                  }
                } catch (e) {
                  console.warn("[Preview] 解析 IMDb JSON-LD 异常:", e);
                }
              }
              if (!parsedData) {
                const nextScript = doc.querySelector("script#__NEXT_DATA__");
                if (nextScript) {
                  try {
                    const nextJson = JSON.parse(nextScript.textContent);
                    const titleData = nextJson.props?.pageProps?.aboveTheFoldData;
                    if (titleData && titleData.titleText?.text) {
                      parsedData = {
                        source: "IMDb",
                        sourceClass: "imdb",
                        title: titleData.titleText.text,
                        subTitle: doubanContext.chineseTitle || titleData.originalTitleText?.text || "",
                        poster: titleData.primaryImage?.url || "",
                        rating: titleData.ratingsSummary?.aggregateRating ? String(titleData.ratingsSummary.aggregateRating) : null,
                        votes: titleData.ratingsSummary?.voteCount ? `${Number(titleData.ratingsSummary.voteCount).toLocaleString()} 评价` : null,
                        meta: [
                          titleData.releaseYear?.year ? String(titleData.releaseYear.year) : "",
                          titleData.genres?.genres?.map(function(g) {
                            return g.text;
                          }).slice(0, 3).join(" / ") || ""
                        ].filter(Boolean).join(" • "),
                        description: titleData.plot?.plotText?.plainText || "",
                        isPartial: false
                      };
                    }
                  } catch (e) {
                    console.warn("[Preview] 解析 IMDb __NEXT_DATA__ 异常:", e);
                  }
                }
              }
              if (!parsedData) {
                const heroTitle = doc.querySelector('h1[data-testid="hero__pageTitle"]')?.textContent?.trim();
                if (heroTitle && heroTitle !== imdbId) {
                  const rating = doc.querySelector('div[data-testid="hero-rating-bar__aggregate-rating__score"] span')?.textContent?.trim() || null;
                  const poster = doc.querySelector("img.ipc-image")?.getAttribute("src") || "";
                  parsedData = {
                    source: "IMDb",
                    sourceClass: "imdb",
                    title: heroTitle,
                    subTitle: doubanContext.chineseTitle || "",
                    poster,
                    rating,
                    votes: null,
                    meta: "",
                    description: "",
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
              console.warn("[Preview] 处理 IMDb 详情页异常:", err);
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
    reqSuggestion();
    reqDetail();
  }

  // src/preview/douban.js
  function getImdbPageMediaInfo() {
    let title = $('h1[data-testid="hero__pageTitle"]').text().trim();
    let year = "";
    const metaText = $("ul.ipc-inline-list--show-dividers").first().text();
    const yearMatch = metaText ? metaText.match(/\b(19\d\d|20\d\d)\b/) : null;
    if (yearMatch) {
      year = yearMatch[1];
    }
    if (!title) {
      const docTitle = document.title || "";
      const match = docTitle.match(/^(.*?)\s*\((\d{4})\)/);
      if (match) {
        title = match[1].trim();
        year = match[2];
      } else {
        title = docTitle.replace(/ - IMDb.*$/i, "").trim();
      }
    }
    return { title, year };
  }
  function splitDoubanTitle(rawTitle) {
    let clean = (rawTitle || "").replace(/\u200e/g, "").trim();
    const match = clean.match(/^([\u4e00-\u9fa5\d\s·：:！!？?·\-—～~]+?)\s+([A-Za-z0-9\s:·'’\-—.,!?~]+(?:\s*\(\d{4}\))?)$/);
    if (match && match[1] && match[2]) {
      return {
        title: match[1].trim(),
        subTitle: match[2].trim()
      };
    }
    return {
      title: clean,
      subTitle: ""
    };
  }
  function fetchDoubanPreview(params, callback) {
    let imdbId = "";
    let queryTitle = "";
    let queryYear = "";
    if (typeof params === "object" && params !== null) {
      imdbId = params.imdbId || "";
      queryTitle = params.title || "";
      queryYear = params.year || "";
    } else if (typeof params === "string") {
      imdbId = params;
    }
    const cacheKey = "douban_" + (imdbId || queryTitle);
    const cached = PREVIEW_CACHE.get(cacheKey);
    if (cached && isValidPreviewData(cached)) {
      callback(cached);
      return;
    }
    if (imdbId && /^tt\d+$/i.test(imdbId.trim())) {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://movie.douban.com/subject_search?search_text=" + encodeURIComponent(imdbId.trim()) + "&cat=1002",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": navigator.userAgent,
          "Referer": "https://movie.douban.com/"
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
                    source: "豆瓣电影",
                    sourceClass: "douban",
                    title: parsed.title || imdbId,
                    subTitle: parsed.subTitle,
                    poster: item.cover_url || "",
                    rating: item.rating && item.rating.value ? item.rating.value.toFixed(1) : null,
                    votes: item.rating && item.rating.count ? `${Number(item.rating.count).toLocaleString()} 评价` : null,
                    meta: item.abstract || "",
                    description: item.abstract_2 || "",
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
              console.warn("[Preview] 解析豆瓣搜索页 __DATA__ 异常:", e);
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
      method: "GET",
      url: "https://movie.douban.com/j/subject_suggest?q=" + encodeURIComponent(searchQuery),
      headers: {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "User-Agent": navigator.userAgent
      },
      timeout: 4e3,
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
                source: "豆瓣电影",
                sourceClass: "douban",
                title: matched.title,
                subTitle: matched.sub_title || "",
                poster: matched.img || "",
                rating: null,
                votes: null,
                meta: matched.year ? `${matched.year} 年` : "",
                description: "",
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
            console.warn("[Preview] 豆瓣备用解析异常:", err);
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

  // src/preview/ui.js
  var previewPopoverEl = null;
  var hoverHideTimer = null;
  var hoverShowTimer = null;
  var currentPreviewRequestId = 0;
  function getDoubanPageContext() {
    if (!location.hostname.includes("douban.com")) {
      return { chineseTitle: "" };
    }
    try {
      const h1El = document.querySelector("#content h1");
      if (h1El) {
        const titleSpan = h1El.querySelector('[property="v:itemreviewed"]');
        const fullText = titleSpan ? titleSpan.textContent.trim() : h1El.textContent.trim();
        const match = fullText.match(/^([^\w\d\(\)]+)/);
        if (match && match[1]) {
          return { chineseTitle: match[1].trim() };
        }
        return { chineseTitle: fullText.split(" ")[0] || "" };
      }
    } catch (e) {
    }
    return { chineseTitle: "" };
  }
  function getOrCreatePreviewCard() {
    if (!previewPopoverEl) {
      previewPopoverEl = document.createElement("div");
      previewPopoverEl.id = "media-preview-card";
      previewPopoverEl.className = "media-preview-card";
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
      previewPopoverEl.addEventListener("mouseenter", function() {
        if (hoverHideTimer) {
          clearTimeout(hoverHideTimer);
          hoverHideTimer = null;
        }
      });
      previewPopoverEl.addEventListener("mouseleave", function() {
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
    card.style.position = "fixed";
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
        previewPopoverEl.classList.remove("mpc-visible");
      }
    }, 150);
  }
  function loadPosterImage($imgEl, url, referer) {
    if (!url) {
      $imgEl.hide();
      return;
    }
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      $imgEl.attr("src", url).show();
      return;
    }
    if (url.includes("media-amazon.com") || url.includes("imdb.com")) {
      $imgEl.attr("src", url).show();
      return;
    }
    if (location.hostname.includes("douban.com") && url.includes("doubanio.com")) {
      $imgEl.attr("src", url).show();
      return;
    }
    if (url.includes("doubanio.com") || referer) {
      const reqReferer = referer || "https://movie.douban.com/";
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: {
          "Referer": reqReferer,
          "User-Agent": navigator.userAgent
        },
        responseType: "blob",
        timeout: 5e3,
        onload: function(response) {
          if (response.status === 200 && response.response) {
            try {
              const blobUrl = URL.createObjectURL(response.response);
              $imgEl.attr("src", blobUrl).show();
            } catch (e) {
              $imgEl.attr("src", url).show();
            }
          } else {
            $imgEl.attr("src", url).show();
          }
        },
        onerror: function() {
          $imgEl.attr("src", url).show();
        },
        ontimeout: function() {
          $imgEl.attr("src", url).show();
        }
      });
    } else {
      $imgEl.attr("src", url).show();
    }
  }
  function renderPreviewCard(data) {
    const card = getOrCreatePreviewCard();
    const $card = $(card);
    if (!data || !isValidPreviewData(data)) {
      $card.find(".mpc-loading").hide();
      $card.find(".mpc-content").hide();
      $card.find(".mpc-error-text").text(data?.previewError || "暂未获取到预览信息，可稍后重试");
      $card.find(".mpc-error").show();
      return;
    }
    $card.find(".mpc-loading").hide();
    $card.find(".mpc-error").hide();
    $card.find(".mpc-badge").text(data.source || "IMDb").removeClass("imdb douban").addClass(data.sourceClass || "imdb");
    $card.find(".mpc-title").text(data.title || "未知片名").attr("title", data.title || "");
    if (data.subTitle) {
      $card.find(".mpc-subtitle").text(data.subTitle).show();
    } else {
      $card.find(".mpc-subtitle").hide();
    }
    if (data.rating) {
      $card.find(".mpc-rating-row").show();
      $card.find(".mpc-rating-score").text(data.rating);
      $card.find(".mpc-rating-votes").text(data.votes ? `(${data.votes})` : "");
    } else {
      $card.find(".mpc-rating-row").hide();
    }
    if (data.meta) {
      $card.find(".mpc-meta").text(data.meta).show();
    } else {
      $card.find(".mpc-meta").hide();
    }
    if (data.description) {
      $card.find(".mpc-description").text(data.description).show();
    } else {
      $card.find(".mpc-description").hide();
    }
    $card.find(".mpc-notice").text(data.previewNotice || "").toggle(!!data.previewNotice);
    const $poster = $card.find(".mpc-poster");
    if (data.poster) {
      loadPosterImage($poster, data.poster, data.sourceClass === "douban" ? "https://movie.douban.com/" : "https://www.imdb.com/");
      $card.find(".mpc-poster-wrap").show();
    } else {
      $card.find(".mpc-poster-wrap").hide();
    }
    $card.find(".mpc-content").show();
  }
  function preloadPreview(type, info) {
    if (!info) return;
    const cacheKey = type === "imdb" ? "imdb_" + (typeof info === "object" ? info.imdbId : info) : "douban_" + (typeof info === "object" ? info.imdbId || info.title : info);
    const cached = PREVIEW_CACHE.get(cacheKey);
    if (cached && !cached.isPartial) return;
    const runPreload = function() {
      if (type === "imdb") {
        const id = typeof info === "object" ? info.imdbId : info;
        fetchImdbPreview(id, function(data) {
          if (data && data.poster) {
            const img = new Image();
            img.src = data.poster;
          }
        });
      } else if (type === "douban") {
        fetchDoubanPreview(info, function(data) {
          if (data && data.poster) {
            const img = new Image();
            img.src = data.poster;
          }
        });
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runPreload, { timeout: 3e3 });
    } else {
      setTimeout(runPreload, 1200);
    }
  }
  function bindHoverPreview(element, type, getInfoFn) {
    if (!element) return;
    const $el = $(element);
    $el.off(".doubanPreview");
    $el.on("mouseenter.doubanPreview", function() {
      if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
        hoverHideTimer = null;
      }
      const info = typeof getInfoFn === "function" ? getInfoFn($el) : $el.data("imdbId");
      if (!info) return;
      const cacheKey = type === "imdb" ? "imdb_" + (typeof info === "object" ? info.imdbId : info) : "douban_" + (typeof info === "object" ? info.imdbId || info.title : info);
      const cached = PREVIEW_CACHE.get(cacheKey);
      const hasCompleteCache = cached && !cached.isPartial && isValidPreviewData(cached);
      const delay = hasCompleteCache ? 60 : 150;
      hoverShowTimer = setTimeout(function() {
        const reqId = ++currentPreviewRequestId;
        const card = getOrCreatePreviewCard();
        const $card = $(card);
        positionPreviewCard($el[0]);
        if (hasCompleteCache) {
          renderPreviewCard(cached);
          positionPreviewCard($el[0]);
          card.classList.add("mpc-visible");
          return;
        }
        if (cached && isValidPreviewData(cached)) {
          renderPreviewCard(cached);
        } else {
          $card.find(".mpc-loading").show();
          $card.find(".mpc-content").hide();
          $card.find(".mpc-error").hide();
        }
        card.classList.add("mpc-visible");
        const handleData = function(data) {
          if (reqId !== currentPreviewRequestId) return;
          if (!card.classList.contains("mpc-visible")) return;
          if (data) {
            renderPreviewCard(data);
            positionPreviewCard($el[0]);
          } else if (!cached) {
            $card.find(".mpc-loading").hide();
            $card.find(".mpc-content").hide();
            $card.find(".mpc-error").show();
          }
        };
        if (type === "imdb") {
          const id = typeof info === "object" ? info.imdbId : info;
          fetchImdbPreview(id, handleData);
        } else if (type === "douban") {
          fetchDoubanPreview(info, handleData);
        }
      }, delay);
    });
    $el.on("mouseleave.doubanPreview", function() {
      hidePreviewCard();
    });
  }

  // src/core/config.js
  var CONFIG = {
    // 同步延时设置
    MOVIE_SYNC_INTERVAL: 3e3,
    // 每部电影同步间隔（毫秒）默认3秒
    PAGE_OPEN_INTERVAL: 2e4,
    // 每页打开间隔（毫秒）默认20秒
    AUTO_CLOSE_DELAY: 5e3,
    // 自动同步完成后关闭标签页延迟（毫秒）默认5秒
    // 页面加载延时
    PAGE_LOAD_DELAY: 2e3,
    // 页面加载后等待时间（毫秒）默认2秒
    AUTO_SYNC_START_DELAY: 3e3,
    // 自动同步开始前延迟（毫秒）默认3秒
    // Toast 提示设置
    TOAST_DURATION: 3e3,
    // Toast 显示时长（毫秒）默认3秒
    TOAST_FADE_DURATION: 300,
    // Toast 淡出动画时长（毫秒）
    // 按钮状态更新延时
    BUTTON_STATE_UPDATE_DELAY: 1500,
    // 按钮状态更新延迟（毫秒）
    SYNC_COMPLETE_TOAST_DELAY: 1e3,
    // 同步完成提示延迟（毫秒）
    // IMDb 评分设置
    IMDB_RATE_CLICK_DELAY: 6e3,
    // IMDb 打开评分弹窗延迟（毫秒）
    IMDB_RATE_SELECT_DELAY: 7e3,
    // IMDb 选择评分延迟（毫秒）
    IMDB_RATE_SUBMIT_DELAY: 8e3,
    // IMDb 提交评分延迟（毫秒）
    IMDB_RATE_CHECK_INTERVAL: 500,
    // IMDb 检查评分成功间隔（毫秒）
    IMDB_RATE_MAX_CHECK_TIME: 15e3,
    // IMDb 最大检查时间（毫秒）
    IMDB_RATE_SUCCESS_CLOSE_DELAY: 2e3,
    // IMDb 评分成功后关闭延迟（毫秒）
    // IMDb Watchlist 设置
    IMDB_WATCHLIST_CLICK_DELAY: 3e3,
    // IMDb 点击添加到 Watchlist 延迟（毫秒）
    IMDB_WATCHLIST_CLOSE_DELAY: 5e3,
    // IMDb 添加到 Watchlist 后关闭延迟（毫秒）
    // 页面估算设置
    MOVIES_PER_PAGE: 15,
    // 每页电影数量
    // 悬浮按钮位置
    FLOAT_BUTTON_RIGHT: 30,
    // 悬浮按钮距离右侧距离（像素）
    FLOAT_BUTTON_GAP: 15,
    // 悬浮按钮之间间距（像素）
    // 同步测试设置
    TEST_SYNC_COUNT: 3,
    // 测试同步的电影数量（前N个）
    TEST_SYNC_ENABLED: true,
    // 是否启用测试同步
    // 同步目标类型
    SYNC_TARGET: {
      RATING: "rating",
      // 同步到已看（评分）
      WATCHLIST: "watchlist"
      // 同步到想看（Watchlist）
    }
  };
  var pathname = location.pathname;

  // src/sync/dialogs.js
  function showToast(message, type = "success") {
    const toast = $('<div class="douban-toast"></div>');
    toast.text(message);
    toast.addClass(type === "success" ? "toast-success" : "toast-error");
    $("body").append(toast);
    setTimeout(() => {
      toast.addClass("show");
    }, 100);
    setTimeout(() => {
      toast.removeClass("show");
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
    $("body").append(dialog);
    setTimeout(() => {
      dialog.addClass("show");
    }, 10);
    dialog.find(".sync-target-option").on("click", function() {
      const target = $(this).attr("data-target");
      dialog.removeClass("show");
      setTimeout(() => {
        dialog.remove();
        callback(target);
      }, 300);
    });
    dialog.find(".sync-target-cancel").on("click", function() {
      dialog.removeClass("show");
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
    $("body").append(dialog);
    setTimeout(() => {
      dialog.addClass("show");
    }, 10);
    dialog.find(".confirm-yes").on("click", function() {
      dialog.removeClass("show");
      setTimeout(() => {
        dialog.remove();
        if (onConfirm) onConfirm();
      }, 300);
    });
    dialog.find(".confirm-no").on("click", function() {
      dialog.removeClass("show");
      setTimeout(() => {
        dialog.remove();
        if (onCancel) onCancel();
      }, 300);
    });
  }

  // src/sync/selection.js
  function showBatchSyncPageDialog(movieList, onConfirm) {
    if (!movieList || movieList.length === 0) return;
    const isWishPage = location.pathname.includes("/wish") || location.search.includes("status=wish");
    let currentTarget = isWishPage ? CONFIG.SYNC_TARGET.WATCHLIST : CONFIG.SYNC_TARGET.RATING;
    const totalCount = movieList.length;
    const selectedSet = new Set(movieList.map((m) => m.id));
    let itemsHtml = "";
    movieList.forEach((movie, index) => {
      let metaHtml = "";
      if (movie.hasRating) {
        const ratingStars = "★".repeat(movie.rating) + "☆".repeat(5 - movie.rating);
        metaHtml = `<span class="sync-movie-star">${ratingStars}</span> <span class="sync-movie-score">${movie.rating}星 (${movie.rating * 2}分)</span>`;
      } else {
        metaHtml = `<span class="sync-movie-unrated">未评分</span>`;
      }
      const posterHtml = movie.poster ? `<img class="sync-movie-thumb" src="${movie.poster}" alt="poster">` : `<div class="sync-movie-thumb placeholder">🎬</div>`;
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
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.RATING ? "active" : ""}" data-target="rating">
                        <span class="tab-icon">⭐</span>
                        <div class="tab-info">
                            <span class="tab-title">已看（评分）</span>
                            <span class="tab-desc">同步评分到 IMDb History</span>
                        </div>
                    </div>
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.WATCHLIST ? "active" : ""}" data-target="watchlist">
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
    $("body").append(dialog);
    setTimeout(() => {
      dialog.addClass("show");
    }, 10);
    const updateSelectionState = function() {
      const count = selectedSet.size;
      dialog.find("#sync-selected-count").text(count);
      const $submitBtn = dialog.find(".sync-btn-submit");
      if (count > 0) {
        $submitBtn.prop("disabled", false).removeClass("disabled").text(`开始同步 (${count}部)`);
      } else {
        $submitBtn.prop("disabled", true).addClass("disabled").text("请至少选择一部电影");
      }
      const $allCb = dialog.find("#sync-select-all-cb");
      if (count === totalCount) {
        $allCb.prop("checked", true).prop("indeterminate", false);
      } else if (count === 0) {
        $allCb.prop("checked", false).prop("indeterminate", false);
      } else {
        $allCb.prop("checked", false).prop("indeterminate", true);
      }
    };
    dialog.find(".sync-target-tab").on("click", function() {
      dialog.find(".sync-target-tab").removeClass("active");
      $(this).addClass("active");
      currentTarget = $(this).attr("data-target");
    });
    dialog.find(".sync-movie-item").on("click", function(e) {
      if ($(e.target).is('input[type="checkbox"]')) {
        return;
      }
      const $item = $(this);
      const $cb = $item.find(".sync-movie-cb");
      const newState = !$cb.prop("checked");
      $cb.prop("checked", newState);
      const id = parseInt($item.attr("data-id"));
      if (newState) {
        selectedSet.add(id);
        $item.addClass("selected");
      } else {
        selectedSet.delete(id);
        $item.removeClass("selected");
      }
      updateSelectionState();
    });
    dialog.find(".sync-movie-cb").on("change", function() {
      const $cb = $(this);
      const $item = $cb.closest(".sync-movie-item");
      const id = parseInt($item.attr("data-id"));
      if ($cb.prop("checked")) {
        selectedSet.add(id);
        $item.addClass("selected");
      } else {
        selectedSet.delete(id);
        $item.removeClass("selected");
      }
      updateSelectionState();
    });
    dialog.find("#sync-select-all-cb").on("change", function() {
      const checked = $(this).prop("checked");
      dialog.find(".sync-movie-cb").prop("checked", checked);
      if (checked) {
        movieList.forEach((m) => selectedSet.add(m.id));
        dialog.find(".sync-movie-item").addClass("selected");
      } else {
        selectedSet.clear();
        dialog.find(".sync-movie-item").removeClass("selected");
      }
      updateSelectionState();
    });
    dialog.find("#sync-invert-btn").on("click", function(e) {
      e.preventDefault();
      dialog.find(".sync-movie-item").each(function() {
        const $item = $(this);
        const id = parseInt($item.attr("data-id"));
        const $cb = $item.find(".sync-movie-cb");
        const newState = !$cb.prop("checked");
        $cb.prop("checked", newState);
        if (newState) {
          selectedSet.add(id);
          $item.addClass("selected");
        } else {
          selectedSet.delete(id);
          $item.removeClass("selected");
        }
      });
      updateSelectionState();
    });
    const closeDialog = function(callback) {
      dialog.removeClass("show");
      setTimeout(() => {
        dialog.remove();
        if (callback) callback();
      }, 300);
    };
    dialog.find(".sync-btn-cancel, .sync-dialog-close").on("click", function() {
      closeDialog();
    });
    dialog.find(".sync-btn-submit").on("click", function() {
      if (selectedSet.size === 0) return;
      const selectedMovies = movieList.filter((m) => selectedSet.has(m.id));
      closeDialog(() => {
        if (onConfirm) onConfirm(selectedMovies, currentTarget);
      });
    });
  }

  // src/sync/progress.js
  var SyncProgressManager = {
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
      this.movies = movieList.map((movie) => ({
        ...movie,
        status: "pending",
        target
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
      const targetText = this.movies[0].target === CONFIG.SYNC_TARGET.RATING ? "已看(评分)" : "想看(Watchlist)";
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
      $("body").append(this.panel);
      this.panel.find(".sync-progress-close, .sync-progress-close-btn").on("click", () => {
        this.hide();
      });
      this.panel.find(".sync-progress-pause-btn").on("click", () => {
        this.togglePause();
      });
      this.renderList();
    },
    togglePause: function() {
      this.isPaused = !this.isPaused;
      const $btn = this.panel.find(".sync-progress-pause-btn");
      if (this.isPaused) {
        $btn.html("▶ 继续");
        showToast("同步已暂停", "success");
      } else {
        $btn.html("⏸ 暂停");
        showToast("同步已继续", "success");
      }
    },
    renderList: function() {
      const list = this.panel.find(".sync-progress-list");
      list.empty();
      this.movies.forEach((movie, index) => {
        const statusText = movie.status === "pending" ? "等待中" : movie.status === "syncing" ? "同步中..." : movie.status === "success" ? "成功" : "失败";
        const icon = movie.status === "pending" ? "⏳" : movie.status === "syncing" ? "🔄" : movie.status === "success" ? "✅" : "❌";
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
        if (oldStatus === "pending") this.stats.pending--;
        if (status === "success") this.stats.success++;
        if (status === "failed") this.stats.failed++;
        this.updateStats();
        this.updateProgress();
        this.renderList();
      }
    },
    updateStats: function() {
      this.panel.find(".sync-stat-number.success").text(this.stats.success);
      this.panel.find(".sync-stat-number.failed").text(this.stats.failed);
      this.panel.find(".sync-stat-number.pending").text(this.stats.pending);
    },
    updateProgress: function() {
      const completed = this.stats.success + this.stats.failed;
      const percentage = Math.round(completed / this.stats.total * 100);
      this.panel.find(".sync-progress-bar-fill").css("width", percentage + "%");
      this.panel.find(".sync-progress-text").text(
        `${completed} / ${this.stats.total} (${percentage}%)`
      );
      if (completed === this.stats.total) {
        this.panel.find(".sync-progress-text").text(
          `同步完成！成功 ${this.stats.success} 部，失败 ${this.stats.failed} 部`
        );
        this.panel.find(".sync-progress-pause-btn").prop("disabled", true).css("opacity", "0.5");
      }
    },
    show: function() {
      if (this.panel) {
        this.panel.addClass("show");
      }
    },
    hide: function() {
      if (this.panel) {
        this.panel.removeClass("show");
        setTimeout(() => {
          this.panel.remove();
          this.panel = null;
        }, 300);
      }
    }
  };

  // src/sync/batch.js
  var testSyncStatus = {
    isTestPhase: false,
    testCount: 0,
    successCount: 0,
    failedCount: 0,
    canContinue: false
  };
  function batchSyncCurrentPage() {
    const $syncButtons = $(".sync-imdb-btn").not("[data-dbm-page] .sync-imdb-btn, .syncing, .synced, .subject-sync-btn, .subject-info-sync-btn");
    const total = $syncButtons.length;
    if (total === 0) {
      showToast("本页没有需要同步的电影", "error");
      return;
    }
    const movieList = [];
    $syncButtons.each(function(idx) {
      const $btn = $(this);
      const $item = $btn.closest(".item");
      const movieTitle = $btn.parent().find("a em").text() || $btn.parent().find("a").text() || $item.find(".title a").text() || "未知电影";
      const movieUrl = $btn.parent().find("a").attr("href") || $item.find(".title a").attr("href") || "";
      const posterUrl = $item.find(".pic img").attr("src") || $item.find(".nbg img").attr("src") || "";
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
    showBatchSyncPageDialog(movieList, function(selectedMovies, target) {
      if (!selectedMovies || selectedMovies.length === 0) return;
      const targetText = target === CONFIG.SYNC_TARGET.RATING ? "已看(评分)" : "想看(Watchlist)";
      const count = selectedMovies.length;
      selectedMovies.forEach((m) => m.target = target);
      SyncProgressManager.init(selectedMovies, target);
      showToast(`开始同步本页选中的 ${count} 部电影到${targetText}...`, "success");
      const batchId = "batch-" + Date.now();
      localStorage.setItem("douban-sync-batch-id", batchId);
      sessionStorage.setItem("is-main-sync-page", "true");
      sessionStorage.setItem("main-sync-batch-id", batchId);
      if (CONFIG.TEST_SYNC_ENABLED && count > CONFIG.TEST_SYNC_COUNT) {
        testSyncStatus = {
          isTestPhase: true,
          testCount: CONFIG.TEST_SYNC_COUNT,
          successCount: 0,
          failedCount: 0,
          canContinue: false
        };
        showToast(`先测试同步前 ${CONFIG.TEST_SYNC_COUNT} 部电影...`, "success");
      } else {
        testSyncStatus = {
          isTestPhase: false,
          testCount: 0,
          successCount: 0,
          failedCount: 0,
          canContinue: true
        };
      }
      const syncCount = testSyncStatus.isTestPhase ? CONFIG.TEST_SYNC_COUNT : selectedMovies.length;
      const openedTabs = [];
      for (let index = 0; index < syncCount; index++) {
        const movie = selectedMovies[index];
        setTimeout(() => {
          if (SyncProgressManager.isPaused) {
            console.log("[Douban to IMDb] 同步已暂停，跳过:", movie.title);
            return;
          }
          SyncProgressManager.updateMovie(index, "syncing");
          movie.button.addClass("syncing").text("同步中...");
          console.log("[Douban to IMDb] 批量同步:", movie.title, "目标:", target, "BatchID:", batchId, "Index:", index);
          const syncRating = movie.hasRating && movie.rating ? movie.rating : 5;
          const syncUrl = movie.url + "#sync-" + syncRating + "-" + target + "-" + batchId + "-" + index;
          console.log("[Douban to IMDb] 打开详情页:", syncUrl);
          const newTab = window.open(syncUrl, "_blank");
          setTimeout(() => {
            window.focus();
          }, 100);
          if (newTab) {
            openedTabs.push({
              tab: newTab,
              index,
              movie,
              startTime: Date.now(),
              lastResult: ""
            });
          }
          setTimeout(() => {
            window.focus();
          }, 100);
        }, index * CONFIG.MOVIE_SYNC_INTERVAL);
      }
      const checkInterval = setInterval(() => {
        openedTabs.forEach((item, i) => {
          if (item.tab && item.tab.closed) {
            const movie = item.movie;
            const index = item.index;
            const elapsed = Date.now() - item.startTime;
            const resultKey = "douban-sync-result-" + batchId + "-" + index;
            const resultData = localStorage.getItem(resultKey);
            console.log("[Douban to IMDb] 标签页已关闭:", movie.title, "耗时:", elapsed + "ms", "data:", resultData);
            let isSuccess = false;
            let failReason = "";
            if (resultData) {
              try {
                const result = JSON.parse(resultData);
                console.log("[Douban to IMDb] 读取到结果:", result);
                if (result.success) {
                  isSuccess = true;
                  failReason = "Marked as success: " + (result.result || "success");
                } else {
                  isSuccess = false;
                  failReason = "Marked as failed: " + (result.result || "unknown");
                }
                localStorage.removeItem(resultKey);
              } catch (e) {
                console.error("[Douban to IMDb] 解析结果失败:", e);
                isSuccess = false;
                failReason = "Failed to parse result";
              }
            } else if (elapsed > 3e4) {
              isSuccess = false;
              failReason = "Timeout (> 30s), no result found";
            } else {
              isSuccess = false;
              failReason = "No result found in localStorage";
            }
            console.log("[Douban to IMDb] 判断结果:", isSuccess ? "成功" : "失败", "原因:", failReason);
            if (isSuccess) {
              movie.button.removeClass("syncing").addClass("synced").text("已同步✓");
              SyncProgressManager.updateMovie(index, "success");
              if (testSyncStatus.isTestPhase) {
                testSyncStatus.successCount++;
                console.log("[Douban to IMDb] 测试同步成功:", testSyncStatus.successCount, "/", testSyncStatus.testCount);
                checkTestPhaseComplete(selectedMovies, batchId);
              }
            } else {
              movie.button.removeClass("syncing").addClass("sync-failed").text("失败✗");
              SyncProgressManager.updateMovie(index, "failed");
              console.error("[Douban to IMDb] 同步失败:", movie.title, "原因:", failReason);
              if (testSyncStatus.isTestPhase) {
                testSyncStatus.failedCount++;
                console.log("[Douban to IMDb] 测试同步失败:", testSyncStatus.failedCount, "/", testSyncStatus.testCount);
                checkTestPhaseComplete(selectedMovies, batchId);
              }
            }
            updateFloatButtonCount();
            openedTabs.splice(i, 1);
          }
        });
        if (openedTabs.length === 0) {
          clearInterval(checkInterval);
          console.log("[Douban to IMDb] 所有标签页已处理完成");
        }
      }, 1e3);
    });
  }
  function checkTestPhaseComplete(movieList, batchId) {
    const completed = testSyncStatus.successCount + testSyncStatus.failedCount;
    if (completed >= testSyncStatus.testCount) {
      testSyncStatus.isTestPhase = false;
      console.log("[Douban to IMDb] 测试阶段完成，成功:", testSyncStatus.successCount, "失败:", testSyncStatus.failedCount);
      if (testSyncStatus.successCount > 0) {
        testSyncStatus.canContinue = true;
        showToast(`测试成功！${testSyncStatus.successCount}/${testSyncStatus.testCount} 部成功，继续同步剩余电影...`, "success");
        const target = movieList[0].target;
        console.log("[Douban to IMDb] 继续同步，使用 target:", target);
        continueRemainingSync(movieList, batchId, target);
      } else {
        testSyncStatus.canContinue = false;
        showToast(`测试失败！前 ${testSyncStatus.testCount} 部全部失败，已停止同步`, "error");
        SyncProgressManager.panel.find(".sync-progress-text").text(
          `测试失败，已停止同步（0/${testSyncStatus.testCount} 成功）`
        );
      }
    }
  }
  function continueRemainingSync(movieList, batchId, target) {
    const startIndex = CONFIG.TEST_SYNC_COUNT;
    console.log("[Douban to IMDb] 开始同步剩余电影，从索引", startIndex, "开始");
    const openedTabs = [];
    for (let i = startIndex; i < movieList.length; i++) {
      const movie = movieList[i];
      const index = i;
      setTimeout(() => {
        if (SyncProgressManager.isPaused) {
          console.log("[Douban to IMDb] 同步已暂停，跳过:", movie.title);
          return;
        }
        SyncProgressManager.updateMovie(index, "syncing");
        movie.button.addClass("syncing").text("同步中...");
        console.log("[Douban to IMDb] 批量同步:", movie.title, "目标:", target, "BatchID:", batchId, "Index:", index);
        const syncUrl = movie.url + "#sync-" + movie.rating + "-" + target + "-" + batchId + "-" + index;
        console.log("[Douban to IMDb] 打开详情页:", syncUrl);
        const newTab = window.open(syncUrl, "_blank");
        setTimeout(() => {
          window.focus();
        }, 100);
        if (newTab) {
          openedTabs.push({
            tab: newTab,
            index,
            movie,
            startTime: Date.now(),
            lastResult: ""
          });
        }
        setTimeout(() => {
          window.focus();
        }, 100);
      }, (index - startIndex) * CONFIG.MOVIE_SYNC_INTERVAL);
    }
    const checkInterval = setInterval(() => {
      openedTabs.forEach((item, i) => {
        if (item.tab && item.tab.closed) {
          const movie = item.movie;
          const index = item.index;
          const elapsed = Date.now() - item.startTime;
          const resultKey = "douban-sync-result-" + batchId + "-" + index;
          const resultData = localStorage.getItem(resultKey);
          console.log("[Douban to IMDb] 标签页已关闭:", movie.title, "耗时:", elapsed + "ms", "localStorage key:", resultKey);
          let isSuccess = false;
          let failReason = "";
          if (resultData) {
            try {
              const result = JSON.parse(resultData);
              console.log("[Douban to IMDb] 读取到结果:", result);
              if (result.success) {
                isSuccess = true;
                failReason = "Marked as success: " + (result.result || "success");
              } else {
                isSuccess = false;
                failReason = "Marked as failed: " + (result.result || "unknown");
              }
              localStorage.removeItem(resultKey);
            } catch (e) {
              console.error("[Douban to IMDb] 解析结果失败:", e);
              isSuccess = false;
              failReason = "Failed to parse result";
            }
          } else if (elapsed > 3e4) {
            isSuccess = false;
            failReason = "Timeout (> 30s), no result found";
          } else {
            isSuccess = false;
            failReason = "No result found in localStorage";
          }
          console.log("[Douban to IMDb] 判断结果:", isSuccess ? "成功" : "失败", "原因:", failReason);
          if (isSuccess) {
            movie.button.removeClass("syncing").addClass("synced").text("已同步✓");
            SyncProgressManager.updateMovie(index, "success");
          } else {
            movie.button.removeClass("syncing").addClass("sync-failed").text("失败✗");
            SyncProgressManager.updateMovie(index, "failed");
            console.error("[Douban to IMDb] 同步失败:", movie.title, "原因:", failReason);
          }
          updateFloatButtonCount();
          openedTabs.splice(i, 1);
        }
      });
      if (openedTabs.length === 0) {
        clearInterval(checkInterval);
        console.log("[Douban to IMDb] 所有剩余电影已处理完成");
      }
    }, 1e3);
  }

  // src/sync/pages.js
  function batchSyncAllPages() {
    const totalPages = parseInt($(".paginator .thispage").attr("data-total-page")) || 1;
    const currentPage = parseInt($(".paginator .thispage").text()) || 1;
    if (totalPages === 1) {
      showToast("只有一页，将同步本页", "success");
      batchSyncCurrentPage();
      return;
    }
    const remainingPages = totalPages - currentPage + 1;
    showSyncTargetDialog(function(target) {
      if (!target) return;
      const targetText = target === CONFIG.SYNC_TARGET.RATING ? "已看(评分)" : "想看(Watchlist)";
      showConfirmDialog(
        "确认同步所有页面",
        `确定要从第 ${currentPage} 页同步到第 ${totalPages} 页吗？

共 ${remainingPages} 页，将打开 ${remainingPages - 1} 个新标签页。

同步目标：IMDb ${targetText}`,
        function() {
          showConfirmDialog(
            "最后确认",
            `最后确认：

将同步第 ${currentPage}-${totalPages} 页（共 ${remainingPages} 页）
同步到 IMDb ${targetText}

点击"确定"开始同步，点击"取消"放弃操作。`,
            function() {
              startSyncAllPages(target, totalPages, currentPage, targetText, remainingPages);
            }
          );
        }
      );
    });
  }
  function startSyncAllPages(target, totalPages, currentPage, targetText, remainingPages) {
    showToast(`准备同步第 ${currentPage}-${totalPages} 页（共 ${remainingPages} 页）到${targetText}...`, "success");
    const movieList = [];
    const $syncButtons = $(".sync-imdb-btn").not("[data-dbm-page] .sync-imdb-btn, .syncing, .synced");
    $syncButtons.each(function() {
      const $btn = $(this);
      const movieTitle = $btn.parent().find("a em").text() || $btn.parent().find("a").text();
      const movieUrl = $btn.parent().find("a").attr("href");
      const $ratingSpan = $btn.closest(".item").find('span[class*="rating"]');
      let rating = 5;
      if ($ratingSpan.length) {
        const ratingClass = $ratingSpan.attr("class");
        const match = ratingClass.match(/rating(\d)-t/);
        if (match) {
          rating = parseInt(match[1]);
        }
      }
      movieList.push({
        title: movieTitle,
        url: movieUrl,
        rating,
        button: $btn,
        page: currentPage
      });
    });
    for (let page = currentPage + 1; page <= totalPages; page++) {
      const pageMovieCount = CONFIG.MOVIES_PER_PAGE;
      for (let i = 0; i < pageMovieCount; i++) {
        movieList.push({
          title: `第 ${page} 页 - 电影 ${i + 1}`,
          url: "",
          rating: 5,
          button: null,
          page
        });
      }
    }
    SyncProgressManager.init(movieList, target);
    let currentIndex = 0;
    const openedTabs = [];
    $syncButtons.each(function(index) {
      const $btn = $(this);
      setTimeout(() => {
        SyncProgressManager.updateMovie(currentIndex, "syncing");
        $btn.addClass("syncing").text("同步中...");
        const movie = movieList[currentIndex];
        console.log("[Douban to IMDb] 批量同步所有:", movie.title, "目标:", target);
        const syncUrl = movie.url + "#sync-" + movie.rating + "-" + target;
        const newTab = window.open(syncUrl, "_blank");
        setTimeout(() => {
          window.focus();
        }, 100);
        if (newTab) {
          openedTabs.push({
            tab: newTab,
            index: currentIndex,
            button: $btn,
            movie,
            startTime: Date.now()
          });
        }
        currentIndex++;
      }, index * CONFIG.MOVIE_SYNC_INTERVAL);
    });
    const checkCurrentPageInterval = setInterval(() => {
      openedTabs.forEach((item, i) => {
        if (item.tab && item.tab.closed) {
          const elapsed = Date.now() - item.startTime;
          console.log("[Douban to IMDb] 标签页已关闭:", item.movie.title, "耗时:", elapsed + "ms");
          item.button.removeClass("syncing").addClass("synced").text("已同步✓");
          SyncProgressManager.updateMovie(item.index, "success");
          updateFloatButtonCount();
          openedTabs.splice(i, 1);
        }
      });
      if (openedTabs.length === 0 && currentIndex === $syncButtons.length) {
        clearInterval(checkCurrentPageInterval);
        console.log("[Douban to IMDb] 当前页所有电影已处理完成");
      }
    }, 1e3);
    const baseUrl = location.pathname + location.search.split("?")[0];
    const urlParams = new URLSearchParams(location.search);
    const currentPageMovies = $syncButtons.length;
    const delayForCurrentPage = currentPageMovies * CONFIG.MOVIE_SYNC_INTERVAL + CONFIG.AUTO_SYNC_START_DELAY;
    setTimeout(() => {
      function openNextPage(page) {
        if (page > totalPages) {
          console.log("[Douban to IMDb] 所有页面已打开完成");
          showToast(`所有页面同步完成！`, "success");
          return;
        }
        const start = (page - 1) * CONFIG.MOVIES_PER_PAGE;
        urlParams.set("start", start);
        const pageUrl = baseUrl + "?" + urlParams.toString();
        console.log("[Douban to IMDb] 打开第 " + page + " 页:", pageUrl);
        const newTab = window.open(pageUrl + "#auto-sync-" + target, "_blank");
        setTimeout(() => {
          window.focus();
        }, 100);
        const checkInterval = setInterval(() => {
          try {
            if (newTab && !newTab.closed && newTab.document && newTab.document.title.startsWith("[已完成]")) {
              clearInterval(checkInterval);
              console.log("[Douban to IMDb] 第 " + page + " 页已完成");
              const remainingPages2 = totalPages - page;
              if (remainingPages2 > 0) {
                showConfirmDialog(
                  "继续同步下一页？",
                  `第 ${page} 页已完成！

还剩 ${remainingPages2} 页未同步。

是否继续同步第 ${page + 1} 页？`,
                  function() {
                    newTab.close();
                    showToast(`开始同步第 ${page + 1} 页...`, "success");
                    openNextPage(page + 1);
                  },
                  function() {
                    newTab.close();
                    showToast(`已停止同步，完成了 ${page - currentPage + 1} 页`, "success");
                  }
                );
              } else {
                newTab.close();
                showToast(`所有页面同步完成！`, "success");
              }
            } else if (newTab && newTab.closed) {
              clearInterval(checkInterval);
              console.log("[Douban to IMDb] 第 " + page + " 页标签页被关闭");
              showToast(`第 ${page} 页已关闭，停止同步`, "error");
            }
          } catch (e) {
          }
        }, 1e3);
      }
      if (currentPage < totalPages) {
        openNextPage(currentPage + 1);
        showToast(`当前页同步完成，开始顺序同步后续页面...`, "success");
      } else {
        showToast(`已是最后一页，同步完成！`, "success");
      }
    }, delayForCurrentPage);
  }

  // src/sync/dock.js
  function addFloatButton() {
    if (document.querySelector(".batch-sync-float-container")) return;
    const totalPages = parseInt($(".paginator .thispage").attr("data-total-page")) || 1;
    const currentPage = parseInt($(".paginator .thispage").text()) || 1;
    const remainingPages = totalPages - currentPage + 1;
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
    $("body").append($container);
    updateFloatButtonCount();
    $container.find(".sync-current").on("click", function() {
      const $btn = $(this);
      if ($btn.hasClass("syncing")) return;
      $btn.addClass("syncing");
      $btn.find(".text").text("同步中...");
      batchSyncCurrentPage();
      setTimeout(() => {
        $btn.removeClass("syncing");
        $btn.find(".text").text("同步本页");
        updateFloatButtonCount();
      }, 3e3);
    });
    $container.find(".sync-all").on("click", function() {
      const $btn = $(this);
      if ($btn.hasClass("syncing")) return;
      $btn.addClass("syncing");
      $btn.find(".text").text("同步中...");
      batchSyncAllPages();
      setTimeout(() => {
        $btn.removeClass("syncing");
        $btn.find(".text").text("同步所有");
      }, 5e3);
    });
  }
  function updateFloatButtonCount() {
    const count = $(".sync-imdb-btn").not("[data-dbm-page] .sync-imdb-btn, .synced").length;
    $(".sync-current .count").text(count);
    if (count === 0) {
      $(".sync-current").css("opacity", "0.5");
    } else {
      $(".sync-current").css("opacity", "1");
    }
  }

  // src/douban/list.js
  function initMovieListPage() {
    const path = location.pathname;
    const search = location.search;
    const isCollect = path.includes("/collect") || search.includes("status=collect");
    const isWish = path.includes("/wish") || search.includes("status=wish");
    const isDo = path.includes("/do") || search.includes("status=do");
    const isTagOrDoulist = path.includes("/tag/") || path.includes("/doulist/");
    const isNormalSearch = path.includes("/search") && !path.includes("/subject_search");
    const isListPage = isCollect || isWish || isDo || isTagOrDoulist || isNormalSearch;
    if (!isListPage) {
      return;
    }
    let checkAttempts = 0;
    const maxChecks = 20;
    const checkTimer = setInterval(function() {
      checkAttempts++;
      let $items = $("#content .article .item, .grid-view .item, .list-view .item, #content .item, .article .doulist-item, .article .subject-item");
      if ($items.length > 0) {
        clearInterval(checkTimer);
        setupMovieListPage($items, isWish);
      } else if (checkAttempts >= maxChecks) {
        clearInterval(checkTimer);
        console.log("[Douban to IMDb] 当前列表未检测到电影项目");
      }
    }, 50);
  }
  function setupMovieListPage($items, isWish, { appended = false } = {}) {
    console.log("[Douban to IMDb] 快速初始化电影列表，数量:", $items.length);
    $items.each(function(index) {
      const $item = $(this);
      const $title = $item.find("li.title a, .info h2 a, .title a, .hd a").first();
      if ($title.length) {
        if ($title.parent().find(".sync-imdb-btn").length > 0) {
          return;
        }
        const movieUrl = $title.attr("href");
        const movieTitle = $title.find("em").text() || $title.text().trim();
        bindHoverPreview($title[0], "douban", () => ({ title: movieTitle }));
        const rating = extractMovieRatingFromItem($item);
        let btnText = "同步";
        if (rating) {
          btnText = "同步(" + rating + "★)";
        } else if (isWish) {
          btnText = "同步(想看)";
        } else {
          btnText = "同步";
        }
        const $btn = $('<button type="button" class="sync-imdb-btn">' + btnText + "</button>");
        $title.parent().append($btn);
        $btn.on("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          if ($btn.hasClass("syncing")) return;
          showSyncTargetDialog(function(target) {
            if (!target) return;
            const finalRating = target === CONFIG.SYNC_TARGET.RATING && !rating ? 5 : rating || 5;
            console.log("[Douban to IMDb] 开始同步:", movieTitle, "评分:", finalRating + "星", "目标:", target);
            $btn.addClass("syncing").text("同步中...");
            const syncUrl = movieUrl + "#sync-" + finalRating + "-" + target;
            const a = document.createElement("a");
            a.href = syncUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            const evt = new MouseEvent("click", {
              ctrlKey: true,
              metaKey: true,
              bubbles: true,
              cancelable: true
            });
            a.dispatchEvent(evt);
            const targetText = target === CONFIG.SYNC_TARGET.RATING ? `已看(评分: ${finalRating * 2}分)` : "想看(Watchlist)";
            showToast(`正在同步到${targetText}: ${movieTitle}`, "success");
            setTimeout(() => {
              $btn.removeClass("syncing").addClass("synced").text("已同步✓");
              updateFloatButtonCount();
            }, CONFIG.BUTTON_STATE_UPDATE_DELAY);
          });
        });
      }
    });
    if (appended) return;
    addFloatButton();
    if (location.hash.startsWith("#auto-sync")) {
      console.log("[Douban to IMDb] 检测到自动同步标记，这是子页面");
      const hashParts = location.hash.split("-");
      const target = hashParts[2] || CONFIG.SYNC_TARGET.RATING;
      const batchId = "batch-auto-" + Date.now();
      setTimeout(() => {
        const $syncButtons = $(".sync-imdb-btn").not("[data-dbm-page] .sync-imdb-btn, .syncing, .synced, .subject-action-sync-btn");
        const openedTabs = [];
        $syncButtons.each(function(index) {
          const $btn = $(this);
          setTimeout(() => {
            if (!$btn.hasClass("syncing") && !$btn.hasClass("synced")) {
              const movieTitle = $btn.parent().find("a em").text() || $btn.parent().find("a").text();
              $btn.addClass("syncing").text("同步中...");
              const movieUrl = $btn.parent().find("a").attr("href");
              const $parentItem = $btn.closest(".item");
              const itemRating = extractMovieRatingFromItem($parentItem) || 5;
              const syncUrl = movieUrl + "#sync-" + itemRating + "-" + target + "-" + batchId + "-" + index;
              const newTab = window.open(syncUrl, "_blank");
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
              item.button.removeClass("syncing").addClass("synced").text("已同步✓");
              openedTabs.splice(i, 1);
            }
          });
          if (openedTabs.length === 0 && $syncButtons.length > 0) {
            clearInterval(checkInterval);
            console.log("[Douban to IMDb] 子页面同步完成");
            document.title = "[已完成] " + document.title;
          }
        }, 1e3);
      }, CONFIG.AUTO_SYNC_START_DELAY);
    }
  }

  // src/douban/links.js
  function addImdbLinkBack() {
    var items = document.querySelectorAll("#info .pl");
    var filtered = Array.from(items).filter(function(el) {
      return el.textContent.startsWith("IMDb");
    });
    if (filtered.length) {
      var imdb = filtered[0].nextSibling;
      if (imdb && imdb.nodeType === 3) {
        var imdbcode = imdb.textContent.trim();
        if (imdbcode && imdbcode.startsWith("tt")) {
          var imdblink = document.createElement("span");
          imdblink.innerHTML = ' <a href="https://www.imdb.com/title/' + imdbcode + '" target="_blank" rel="noopener noreferrer" class="douban-imdb-link" data-imdb-id="' + imdbcode + '">' + imdbcode + "</a>";
          imdb.parentNode.insertBefore(imdblink, imdb);
          imdb.parentNode.removeChild(imdb);
          console.log("[Douban to IMDb] IMDb 链接已添加:", imdbcode);
          var $a = imdblink.querySelector("a");
          if ($a) {
            bindHoverPreview($a, "imdb", function() {
              return imdbcode;
            });
            preloadPreview("imdb", imdbcode);
          }
        }
      }
    }
  }

  // src/sync/subject.js
  function showSubjectMovieSyncDialog(movieInfo, onConfirm) {
    const autoDetectedRating = movieInfo.userRating && movieInfo.userRating >= 1 && movieInfo.userRating <= 5 ? movieInfo.userRating : null;
    let selectedRating = autoDetectedRating;
    let currentTarget = autoDetectedRating ? CONFIG.SYNC_TARGET.RATING : movieInfo.isWish ? CONFIG.SYNC_TARGET.WATCHLIST : CONFIG.SYNC_TARGET.RATING;
    const posterHtml = movieInfo.poster ? `<img class="subject-sync-thumb" src="${movieInfo.poster}" alt="poster">` : `<div class="subject-sync-thumb placeholder">🎬</div>`;
    const getScoreHintHtml = (rating) => {
      if (rating) {
        return `${rating} 星 (${rating * 2} 分)` + (rating === autoDetectedRating ? ' <span class="sync-auto-badge">已自动识别</span>' : "");
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
                            ${movieInfo.year ? ` • <span>${movieInfo.year}年</span>` : ""}
                        </div>
                    </div>
                </div>

                <!-- 目标选择 Tabs -->
                <div class="sync-target-tabs">
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.RATING ? "active" : ""}" data-target="rating">
                        <span class="tab-icon">⭐</span>
                        <div class="tab-info">
                            <span class="tab-title">已看（评分）</span>
                            <span class="tab-desc">同步评分到 IMDb 评分记录</span>
                        </div>
                    </div>
                    <div class="sync-target-tab ${currentTarget === CONFIG.SYNC_TARGET.WATCHLIST ? "active" : ""}" data-target="watchlist">
                        <span class="tab-icon">📋</span>
                        <div class="tab-info">
                            <span class="tab-title">想看（Watchlist）</span>
                            <span class="tab-desc">添加到 IMDb 待看列表</span>
                        </div>
                    </div>
                </div>

                <!-- 评分选择器（仅当目标为 rating 时可见） -->
                <div class="subject-sync-rating-selector" style="${currentTarget === CONFIG.SYNC_TARGET.RATING ? "" : "display:none;"}">
                    <div class="subject-sync-rating-label">
                        <span>同步评分分值</span>
                        <span class="subject-sync-rating-text">${getScoreHintHtml(selectedRating)}</span>
                    </div>
                    <div class="subject-rating-stars-bar">
                        ${[1, 2, 3, 4, 5].map((r) => `
                            <button type="button" class="subject-star-opt ${r === selectedRating ? "active" : ""}" data-star="${r}">
                                ${"★".repeat(r)}<br>${r * 2}分
                            </button>
                        `).join("")}
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
    $("body").append(dialog);
    setTimeout(() => {
      dialog.addClass("show");
    }, 10);
    dialog.find(".sync-target-tab").on("click", function() {
      dialog.find(".sync-target-tab").removeClass("active");
      $(this).addClass("active");
      currentTarget = $(this).attr("data-target");
      if (currentTarget === CONFIG.SYNC_TARGET.RATING) {
        dialog.find(".subject-sync-rating-selector").slideDown(200);
      } else {
        dialog.find(".subject-sync-rating-selector").slideUp(200);
      }
    });
    dialog.find(".subject-star-opt").on("click", function() {
      dialog.find(".subject-star-opt").removeClass("active");
      $(this).addClass("active");
      selectedRating = parseInt($(this).attr("data-star"));
      dialog.find(".subject-sync-rating-text").html(getScoreHintHtml(selectedRating));
    });
    const closeDialog = function(callback) {
      dialog.removeClass("show");
      setTimeout(() => {
        dialog.remove();
        if (callback) callback();
      }, 300);
    };
    dialog.find(".sync-btn-cancel, .sync-dialog-close").on("click", function() {
      closeDialog();
    });
    dialog.find(".sync-btn-submit").on("click", function() {
      if (currentTarget === CONFIG.SYNC_TARGET.RATING) {
        if (!selectedRating) {
          showToast("请在下方点击选择需要同步的评分分值（1~5星）", "error");
          return;
        }
      }
      closeDialog(() => {
        if (onConfirm) onConfirm(currentTarget, selectedRating);
      });
    });
  }
  function triggerSubjectMovieSync() {
    let imdbId = "";
    $("#info a").each(function() {
      const href = $(this).attr("href") || "";
      const text = $(this).text().trim();
      if (href.includes("imdb.com/title/")) {
        const m = href.match(/tt\d+/);
        if (m) {
          imdbId = m[0];
          return false;
        }
      } else if (text.match(/^tt\d+$/)) {
        imdbId = text;
        return false;
      }
    });
    if (!imdbId) {
      showToast("未在当前电影页面找到有效的 IMDb 编号", "error");
      return;
    }
    const doubanId = location.pathname.split("/")[2];
    const movieTitle = $('span[property="v:itemreviewed"]').text().trim() || $("h1").text().replace("(豆瓣)", "").trim();
    const yearText = $(".year").text().replace(/[\(\)]/g, "").trim();
    const poster = $("#mainpic img").attr("src") || "";
    const userRating = extractSubjectUserRating();
    const isWish = $("#interest_sect_level").text().includes("已想看");
    showSubjectMovieSyncDialog({
      title: movieTitle,
      year: yearText,
      poster,
      imdbId,
      doubanId,
      userRating,
      isWish
    }, function(target, rating) {
      const score = (rating || 5) * 2;
      const batchId = "batch-" + Date.now();
      const targetText = target === CONFIG.SYNC_TARGET.RATING ? `已看(评分: ${score}分)` : "想看(Watchlist)";
      showToast(`正在将《${movieTitle}》同步到 IMDb ${targetText}...`, "success");
      const imdbUrl = `https://www.imdb.com/title/${imdbId}/#${score}-${target}-${batchId}-0-${doubanId}`;
      window.open(imdbUrl, "_blank");
    });
  }
  function addSubjectPageSyncButtons() {
    if (!location.pathname.includes("/subject/")) return;
    const $sect = $("#interest_sect_level");
    if ($sect.length && !$sect.find(".subject-action-sync-btn").length) {
      const $btnWrap = $(`
            <div class="subject-sync-action-wrap">
                <button type="button" class="subject-action-sync-btn" title="将此电影评分或想看同步到 IMDb">
                    <span class="subject-sync-imdb-badge">IMDb</span>
                    <span class="subject-sync-btn-label">⚡ 同步到 IMDb</span>
                </button>
            </div>
        `);
      $sect.append($btnWrap);
      $btnWrap.find(".subject-action-sync-btn").on("click", function(e) {
        e.preventDefault();
        triggerSubjectMovieSync();
      });
    }
  }

  // src/douban/index.js
  var initialized = false;
  function initDouban() {
    if (initialized) return;
    initialized = true;
    if (location.pathname.includes("/subject_search")) {
      const urlParams = new URLSearchParams(location.search);
      const searchText = (urlParams.get("search_text") || "").trim();
      const fromImdb = urlParams.get("from_imdb") === "true";
      const isImdbId = /^tt\d+$/i.test(searchText);
      if (fromImdb || isImdbId) {
        console.log("[Douban to IMDb] 检测到 IMDb ID 搜索，准备自动直达详情页:", searchText);
        let redirected = false;
        const tryRedirect = function() {
          if (redirected) return true;
          const linkSelectors = [
            ".item-root a.title-text",
            '.item-root a[href*="/subject/"]',
            '.result-list a[href*="/subject/"]',
            '#root a[href*="/subject/"]'
          ];
          for (const selector of linkSelectors) {
            const links = document.querySelectorAll(selector);
            for (let i = 0; i < links.length; i++) {
              const href = links[i].getAttribute("href");
              if (href && /\/subject\/\d+/.test(href)) {
                redirected = true;
                console.log("[Douban to IMDb] 找到目标电影详情页，正在跳转:", href);
                window.location.replace(href);
                return true;
              }
            }
          }
          return false;
        };
        if (!tryRedirect()) {
          let attempts = 0;
          const maxAttempts = 60;
          const timer = setInterval(function() {
            attempts++;
            if (tryRedirect() || attempts >= maxAttempts) {
              clearInterval(timer);
            }
          }, 100);
          const observer = new MutationObserver(function() {
            if (tryRedirect()) {
              observer.disconnect();
              clearInterval(timer);
            }
          });
          if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
          } else {
            document.addEventListener("DOMContentLoaded", function() {
              observer.observe(document.body, { childList: true, subtree: true });
            });
          }
        }
      }
    }
    initMovieListPage();
    if (location.pathname.includes("/subject/")) {
      setTimeout(function() {
        addImdbLinkBack();
        addSubjectPageSyncButtons();
      }, 500);
      setTimeout(function() {
        addSubjectPageSyncButtons();
      }, 1500);
    }
    if (location.pathname.includes("/subject/") && location.hash.startsWith("#sync-")) {
      console.log("[Douban to IMDb] 检测到同步请求，等待页面加载...");
      setTimeout(function() {
        const { rating, target, batchId, movieIndex } = parseDoubanHash(location.hash);
        let id2 = location.pathname.split("/")[2];
        const urlParams = new URLSearchParams(location.search);
        const fromImdb = urlParams.get("from-imdb");
        const imdbResult = urlParams.get("result");
        if (fromImdb === "true" && imdbResult) {
          const urlBatchId = urlParams.get("batchId") || batchId;
          const urlMovieIndex = parseInt(urlParams.get("index")) || movieIndex;
          console.log("[Douban to IMDb] 从 IMDb 返回，结果:", imdbResult, "batchId:", urlBatchId, "index:", urlMovieIndex);
          const resultKey = "douban-sync-result-" + urlBatchId + "-" + urlMovieIndex;
          if (imdbResult === "success" || imdbResult === "already-in-list") {
            localStorage.setItem(resultKey, JSON.stringify({
              success: true,
              result: imdbResult,
              timestamp: Date.now()
            }));
            console.log("[Douban to IMDb] 已保存成功结果到:", resultKey);
          } else {
            localStorage.setItem(resultKey, JSON.stringify({
              success: false,
              result: imdbResult,
              timestamp: Date.now()
            }));
            console.log("[Douban to IMDb] 已保存失败结果到:", resultKey);
          }
          setTimeout(() => {
            console.log("[Douban to IMDb] 准备关闭页面");
            window.close();
          }, 2e3);
          return;
        }
        console.log("[Douban to IMDb] 开始提取 IMDb ID...");
        console.log("[Douban to IMDb] Hash参数:", { rating, target, batchId, movieIndex });
        let imdbId = "";
        $("#info a").each(function() {
          const href = $(this).attr("href");
          const text = $(this).text().trim();
          console.log("[Douban to IMDb] 检查链接:", href, text);
          if (href && href.includes("imdb.com/title/")) {
            const match = href.match(/tt\d+/);
            if (match) {
              imdbId = match[0];
              console.log("[Douban to IMDb] 从链接找到 IMDb ID:", imdbId);
              return false;
            }
          } else if (text && text.match(/^tt\d+$/)) {
            imdbId = text;
            console.log("[Douban to IMDb] 从文本找到 IMDb ID:", imdbId);
            return false;
          }
        });
        console.log("[Douban to IMDb] 最终 IMDb ID:", imdbId);
        if (imdbId && imdbId.includes("tt")) {
          const score = rating * 2;
          const imdbLink = "https://www.imdb.com/title/" + imdbId + "/#" + score + "-" + target + "-" + batchId + "-" + movieIndex + "-" + id2;
          const targetText = target === CONFIG.SYNC_TARGET.RATING ? "已看(评分)" : "想看(Watchlist)";
          console.log("[Douban to IMDb] 准备跳转到 IMDb:", imdbLink);
          showToast(`正在同步到 IMDb ${targetText}: ${score}分`, "success");
          const resultKey = "douban-sync-result-" + batchId + "-" + movieIndex;
          localStorage.setItem(resultKey, JSON.stringify({
            status: "processing",
            movieId: id2,
            imdbId,
            timestamp: Date.now()
          }));
          console.log("[Douban to IMDb] 已标记为处理中:", resultKey);
          setTimeout(() => {
            console.log("[Douban to IMDb] 执行跳转...");
            window.location.href = imdbLink;
          }, 1e3);
        } else {
          console.error("[Douban to IMDb] 未找到 IMDb ID");
          console.log("[Douban to IMDb] #info 元素数量:", $("#info").length);
          console.log("[Douban to IMDb] #info a 元素数量:", $("#info a").length);
          showToast("未找到 IMDb ID", "error");
          const resultKey = "douban-sync-result-" + batchId + "-" + movieIndex;
          localStorage.setItem(resultKey, JSON.stringify({
            success: false,
            result: "no-imdb-id",
            timestamp: Date.now()
          }));
          console.log("[Douban to IMDb] 已保存失败结果到 localStorage:", resultKey);
          setTimeout(() => {
            console.log("[Douban to IMDb] 准备关闭页面");
            window.close();
          }, 2e3);
        }
      }, 3e3);
    }
    let id = location.pathname.split("/")[2];
    let title = $("html head title").text();
    title = title.replace("(豆瓣)", "").trim();
    let title_en = $('span[property="v:itemreviewed"]').text() + " " + $(".year").eq(0).text().replace("(", "").replace(")", "");
    title_en = title_en.replace(title, "").trim();
    let imdbForLinks = "";
    $("#info a").each(function() {
      const href = $(this).attr("href");
      const text = $(this).text().trim();
      if (href && href.includes("imdb.com/title/")) {
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
      imdbForLinks = title;
    }
    $(".aside").prepend('<div class="tags"><h2><i>下载</i>· · · · · ·</h2><div id="dl-sites" class="tags-body"></div></div><div class="tags"><h2><i>字幕</i>· · · · · ·</h2><div id="sub-sites" class="tags-body"></div></div>');
    let dl_sites = {
      "IMBT": "https://imbt.one/i/" + imdbForLinks,
      "观影": "https://www.gying.net/s/1---1/" + imdbForLinks,
      "片源": "https://pianyuan.org/search?q=" + imdbForLinks,
      "片吧": "http://so.pianbar.net/search.aspx?s=movie&q=" + title,
      //'下片片': 'http://search.xiepp.com/search.aspx?s=movie&q=' + title,
      "BT之家": "https://www.1lou.me/search-" + title + ".htm",
      "音范丝4K": "https://www.yinfans.me/?s=" + title,
      "极影": "https://www.jiyingw.net/?s=" + title,
      "Mini4K": "https://www.mini4k.com/search?term=" + title,
      "XueSouSou": "https://www.xuesousou.net/search?q=" + title,
      "BTSOW": "https://btsow.lol/search/" + title_en,
      "BTDigg": "https://www.btdig.com/search?order=0&q=" + title_en,
      "RARBG": "https://rargb.to/search/?search=" + title_en + "&order=size&by=DESC",
      "1377X": "https://www.1377x.to/sort-search/" + title_en + "/size/desc/1/",
      "ThePirateBay": "https://thepiratebay10.info/search/" + title_en + "/1/5/0",
      "IBit": "https://ibit.to/torrent-search/" + title_en + "/Movies/size:desc/1/",
      "YaPan": "https://pan.ccof.cc/search?keyword=" + title,
      "AliPanSou": "https://www.alipansou.com/search?s=2&t=1&k=" + title,
      "Google Alipan": "https://www.google.com/search?q=阿里云盘+" + title,
      "shareAliyun": "https://t.me/s/shareAliyun?q=" + title,
      "YunPanPan": "https://t.me/s/YunPanPan?q=" + title
    };
    for (let name in dl_sites) {
      let link = dl_sites[name];
      link = $("<a></a>").attr("href", link);
      link.attr("target", "_blank").attr("rel", "nofollow");
      link.html(name);
      $("#dl-sites").append(link);
    }
    let sub_sites = {
      "SubHD": "https://subhd.tv/d/" + id,
      "字幕库": "https://zimuku.org/search?chost=zimuku.org&q=" + imdbForLinks,
      "A4K": "https://www.a4k.net/search?term=" + title,
      "伪射手": "http://assrt.net/sub/?searchword=" + title
    };
    for (let name in sub_sites) {
      let link = sub_sites[name];
      link = $("<a></a>").attr("href", link);
      link.attr("target", "_blank").attr("rel", "nofollow");
      link.html(name);
      $("#sub-sites").append(link);
    }
  }

  // src/imdb/rating.js
  function matchesRating(text, score) {
    const match = String(text || "").match(/(?:^|[^\d])(10|[1-9])(?=$|[^\d])/);
    return !!match && match[1] === String(score);
  }

  // src/core/links.js
  function insertLinks(id, title) {
    var entitle = encodeURIComponent(title);
    var douban = '<a href="https://movie.douban.com/subject_search?search_text=' + id + '&cat=1002&from_imdb=true" target="_blank" class="douban-preview-link" data-imdb-id="' + id + '">douban</a>';
    var sub1 = '<a href="https://www.zimuku.org/search?q=' + id + '" target="_blank">zimuku</a>';
    var sub2 = '<a href="https://subhd.tv/search0/' + entitle + '" target="_blank">subhd</a>';
    var dl1 = '<a href="http://search.xiepp.com/search.aspx?q=' + entitle + '" target="_blank">xiepp</a>';
    var dl2 = '<a href="https://www.88btbtt.com/search-index-keyword-' + entitle + '.htm" target="_blank">btbtt</a>';
    return '<span id="yt-links">' + douban + "</span>";
  }

  // src/imdb/index.js
  var initialized2 = false;
  function initImdb() {
    if (initialized2) return;
    initialized2 = true;
    if (location.pathname.startsWith("/title/")) {
      GM_addStyle("#yt-message{position:absolute;top:0;left:50%; margin-left:-100px;width:200px;height:15px;line-height:15px;background:yellow;border-radius: 2px;text-align:center;font-size:11px;}#yt-links{display:block;border-top: 1px solid #cccccc;padding: 10px 20px;background-color:#EFE3A4;text-align:center}#yt-links a{display:inline-block;margin-right:20px;padding:8px 16px;background-color: #0091EA;color:white;text-transform:capitalize;border-radius: 2px;}");
      let origin = $('li[data-testid="title-details-origin"] ul').text();
      let genres = $('li[data-testid="storyline-genres"] ul').text();
      let id = location.pathname.split("/")[2];
      window.setTimeout(function() {
        let doubanLink = "https://movie.douban.com/subject_search?search_text=" + id + "&from_imdb=true";
        let $doubanBtn = $('<li role="presentation" class="ipc-inline-list__item"><a target="_blank" href="' + doubanLink + '" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color douban-preview-link" data-imdb-id="' + id + '" data-testid="hero-subnav-bar-imdb-pro-link">Douban</a></li>');
        $('ul[data-testid="hero-subnav-bar-topic-links"]').append($doubanBtn);
        bindHoverPreview($doubanBtn.find("a")[0], "douban", function() {
          return id;
        });
        preloadPreview("douban", id);
      }, 1e3);
      const { score, target, batchId, movieIndex, doubanId } = parseImdbHash(location.hash);
      console.log("[Douban to IMDb] IMDb 页面加载，Hash参数:", { score, target, batchId, movieIndex, doubanId });
      if (score.length > 0) {
        window.name = "processing";
        console.log("[Douban to IMDb] 设置初始 window.name:", window.name);
      }
      const backToDoubanUrl = "https://movie.douban.com/subject/" + doubanId + "/?from-imdb=true&result=";
      if (score.length > 0) {
        if (target === CONFIG.SYNC_TARGET.WATCHLIST) {
          window.setTimeout(function() {
            console.log("[Douban to IMDb] 开始处理 Watchlist");
            let waitCount = 0;
            const maxWaitCount = 20;
            const waitForButton = setInterval(function() {
              waitCount++;
              let $watchlistBtn = $('button[data-testid="tm-box-wl-button"]');
              if ($watchlistBtn.length === 0) {
                $watchlistBtn = $('button[aria-label="Add to Watchlist"]');
              }
              if ($watchlistBtn.length === 0) {
                $watchlistBtn = $('button:contains("Add to Watchlist")');
              }
              if ($watchlistBtn.length > 0) {
                clearInterval(waitForButton);
                console.log("[Douban to IMDb] 找到 Watchlist 按钮");
                const isAlreadyInWatchlist = $watchlistBtn.attr("aria-pressed") === "true" || $watchlistBtn.find('[data-testid="tm-box-wl-text"]').text().includes("In Watchlist");
                if (isAlreadyInWatchlist) {
                  console.log("[Douban to IMDb] ✓ 已经在 Watchlist 中，无需添加");
                  console.log("[Douban to IMDb] 准备跳转回豆瓣");
                  window.location.href = backToDoubanUrl + "already-in-list&batchId=" + batchId + "&index=" + movieIndex + "#sync-" + score + "-" + target + "-" + batchId + "-" + movieIndex;
                } else {
                  console.log("[Douban to IMDb] 不在 Watchlist 中，准备点击按钮");
                  $watchlistBtn[0].click();
                  let checkCount = 0;
                  const maxChecks = CONFIG.IMDB_RATE_MAX_CHECK_TIME / CONFIG.IMDB_RATE_CHECK_INTERVAL;
                  const checkInterval = setInterval(function() {
                    checkCount++;
                    const $btn = $('button[data-testid="tm-box-wl-button"]');
                    const isPressed = $btn.attr("aria-pressed") === "true";
                    const hasInWatchlistText = $btn.find('[data-testid="tm-box-wl-text"]').text().includes("In Watchlist");
                    const hasCheckIcon = $btn.find(".ipc-icon--done").length > 0;
                    console.log("[Douban to IMDb] 检查 Watchlist 状态 (" + checkCount + "/" + maxChecks + "):", {
                      isPressed,
                      hasInWatchlistText,
                      hasCheckIcon,
                      buttonText: $btn.find('[data-testid="tm-box-wl-text"]').text()
                    });
                    if (isPressed || hasInWatchlistText || hasCheckIcon || checkCount >= maxChecks) {
                      clearInterval(checkInterval);
                      if (isPressed || hasInWatchlistText || hasCheckIcon) {
                        console.log("[Douban to IMDb] ✓ 添加到 Watchlist 成功！准备跳转回豆瓣");
                        window.location.href = backToDoubanUrl + "success&batchId=" + batchId + "&index=" + movieIndex + "#sync-" + score + "-" + target + "-" + batchId + "-" + movieIndex;
                      } else {
                        console.log("[Douban to IMDb] ✗ Watchlist 状态未确认，但已达到最大检查次数");
                        window.location.href = backToDoubanUrl + "failed-timeout&batchId=" + batchId + "&index=" + movieIndex + "#sync-" + score + "-" + target + "-" + batchId + "-" + movieIndex;
                      }
                    }
                  }, CONFIG.IMDB_RATE_CHECK_INTERVAL);
                }
              } else if (waitCount >= maxWaitCount) {
                clearInterval(waitForButton);
                console.error("[Douban to IMDb] ✗ 等待超时，未找到 Watchlist 按钮");
                window.location.href = backToDoubanUrl + "failed-no-button&batchId=" + batchId + "&index=" + movieIndex + "#sync-" + score + "-" + target + "-" + batchId + "-" + movieIndex;
              } else {
                console.log("[Douban to IMDb] 等待 Watchlist 按钮加载... (" + waitCount + "/" + maxWaitCount + ")");
              }
            }, 500);
          }, 2e3);
        } else {
          window.setTimeout(function() {
            console.log("[Douban to IMDb] 打开评分弹窗");
            $('div[data-testid="hero-rating-bar__user-rating"] button').click();
          }, CONFIG.IMDB_RATE_CLICK_DELAY);
          window.setTimeout(function() {
            console.log("[Douban to IMDb] 选择评分:", score);
            $('button[aria-label="Rate ' + score + '"]').click();
          }, CONFIG.IMDB_RATE_SELECT_DELAY);
          window.setTimeout(function() {
            console.log("[Douban to IMDb] 提交评分");
            $(".ipc-starbar + button").click();
            let checkCount = 0;
            const maxChecks = CONFIG.IMDB_RATE_MAX_CHECK_TIME / CONFIG.IMDB_RATE_CHECK_INTERVAL;
            const checkInterval = setInterval(function() {
              checkCount++;
              const confirmedValue = $('div[data-testid="hero-rating-bar__user-rating"] .ipc-rating-star--rating').text().trim();
              const hasRating = confirmedValue === score;
              const ratingButton = $('div[data-testid="hero-rating-bar__user-rating"] button');
              const buttonText = ratingButton.text();
              const ratingLabel = ratingButton.attr("aria-label") || "";
              const hasRatedText = matchesRating(buttonText || ratingLabel, score);
              const hasSuccessMessage = $(".ipc-promptable-base__panel").length === 0;
              console.log("[Douban to IMDb] 检查评分状态 (" + checkCount + "/" + maxChecks + "):", {
                hasRating,
                hasRatedText,
                hasSuccessMessage,
                buttonText
              });
              if (hasRating || hasRatedText || checkCount >= maxChecks) {
                clearInterval(checkInterval);
                if (hasRating || hasRatedText) {
                  console.log("[Douban to IMDb] ✓ 评分成功！准备跳转回豆瓣");
                  window.location.href = backToDoubanUrl + "success&batchId=" + batchId + "&index=" + movieIndex + "#sync-" + score + "-" + target + "-" + batchId + "-" + movieIndex;
                } else {
                  console.log("[Douban to IMDb] ✗ 评分状态未确认，但已达到最大检查次数");
                  window.location.href = backToDoubanUrl + "failed-timeout&batchId=" + batchId + "&index=" + movieIndex + "#sync-" + score + "-" + target + "-" + batchId + "-" + movieIndex;
                }
              }
            }, CONFIG.IMDB_RATE_CHECK_INTERVAL);
            let $doubanBtn2 = $('<li role="presentation" class="ipc-inline-list__item"><a href="https://movie.douban.com/subject_search?search_text=' + id + '&cat=1002&from_imdb=true" class="ipc-link ipc-link--baseAlt ipc-link--inherit-color douban-preview-link" data-imdb-id="' + id + '">Douban</a></li>');
            $('ul[data-testid="hero-subnav-bar-topic-links"]').append($doubanBtn2);
            bindHoverPreview($doubanBtn2.find("a")[0], "douban", function() {
              return id;
            });
            preloadPreview("douban", id);
          }, CONFIG.IMDB_RATE_SUBMIT_DELAY);
        }
      }
    }
    if (location.pathname.includes("/search/") || location.pathname.includes("/list/")) {
      GM_addStyle("#yt-links a{display:inline-block;margin-right:6px;text-transform:capitalize;}");
      $(".rating-star.user-rating").each(function() {
        $(this).parents(".lister-item").hide();
      });
      $(".ipl-rating-interactive__star").each(function() {
        if ($(this).is(":visible")) {
          $(this).parents(".lister-item").hide();
        }
      });
      $(".genre").each(function() {
        if ($(this).text().includes("Animation") || $(this).text().includes("Documentary")) {
          $(this).parents(".lister-item").hide();
        }
      });
      $(".lister-item-header a").each(function() {
        $(this).attr("target", "_blank");
      });
      $(".lister-item-header").each(function() {
        var rawTitle = $(this).find("a").text().trim();
        var yearText = $(this).find(".lister-item-year").text();
        var yearMatch = yearText ? yearText.match(/\b(19\d\d|20\d\d)\b/) : null;
        var year = yearMatch ? yearMatch[1] : "";
        var title = rawTitle + (year ? " " + year : "");
        var id = $(this).find("a").attr("href").split("/")[2];
        var $links = $(insertLinks(id, title));
        $(this).parent().after($links);
        $links.find(".douban-preview-link").each(function() {
          bindHoverPreview(this, "douban", function() {
            return { imdbId: id, title: rawTitle, year };
          });
        });
      });
    }
  }

  // src/styles/dialogs.css
  var dialogs_default = "\n    .douban-toast {\n        position: fixed;\n        bottom: 30px;\n        right: 30px;\n        padding: 15px 25px;\n        border-radius: 8px;\n        color: white;\n        font-size: 14px;\n        z-index: 99999;\n        opacity: 0;\n        transform: translateY(20px);\n        transition: all 0.3s ease;\n        box-shadow: 0 4px 12px rgba(0,0,0,0.15);\n        max-width: 300px;\n    }\n    .douban-toast.show {\n        opacity: 1;\n        transform: translateY(0);\n    }\n    .douban-toast.toast-success {\n        background-color: #52c41a;\n    }\n    .douban-toast.toast-error {\n        background-color: #ff4d4f;\n    }\n    \n    /* 同步目标选择对话框样式 */\n    .sync-target-dialog-overlay {\n        position: fixed !important;\n        top: 0 !important;\n        left: 0 !important;\n        right: 0 !important;\n        bottom: 0 !important;\n        width: 100vw !important;\n        height: 100vh !important;\n        width: 100% !important;\n        height: 100% !important;\n        background: rgba(0, 0, 0, 0.6) !important;\n        z-index: 99999999 !important;\n        display: flex !important;\n        align-items: center !important;\n        justify-content: center !important;\n        opacity: 0;\n        transition: opacity 0.25s ease;\n        box-sizing: border-box !important;\n        margin: 0 !important;\n        padding: 20px !important;\n        overflow-y: auto !important;\n    }\n    .sync-target-dialog-overlay.show {\n        opacity: 1;\n    }\n    .sync-target-dialog {\n        background: white !important;\n        border-radius: 12px !important;\n        padding: 30px !important;\n        max-width: 500px;\n        width: 90%;\n        box-shadow: 0 16px 48px rgba(0,0,0,0.3) !important;\n        transform: scale(0.92);\n        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;\n        margin: auto !important;\n        box-sizing: border-box !important;\n        position: relative !important;\n    }\n    .sync-target-dialog-overlay.show .sync-target-dialog {\n        transform: scale(1);\n    }\n    .sync-target-dialog h3 {\n        margin: 0 0 10px 0;\n        font-size: 24px;\n        color: #333;\n    }\n    .sync-target-dialog p {\n        margin: 0 0 20px 0;\n        color: #666;\n        font-size: 14px;\n    }\n    .sync-target-options {\n        display: flex;\n        gap: 15px;\n        margin-bottom: 20px;\n    }\n    .sync-target-option {\n        flex: 1;\n        padding: 20px;\n        border: 2px solid #e0e0e0;\n        border-radius: 8px;\n        background: white;\n        cursor: pointer;\n        transition: all 0.3s ease;\n        display: flex;\n        flex-direction: column;\n        align-items: center;\n        gap: 8px;\n    }\n    .sync-target-option:hover {\n        border-color: #667eea;\n        background: #f8f9ff;\n        transform: translateY(-2px);\n        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);\n    }\n    .sync-target-option .option-icon {\n        font-size: 32px;\n    }\n    .sync-target-option .option-title {\n        font-size: 16px;\n        font-weight: bold;\n        color: #333;\n    }\n    .sync-target-option .option-desc {\n        font-size: 12px;\n        color: #999;\n        text-align: center;\n    }\n    .sync-target-cancel {\n        width: 100%;\n        padding: 12px;\n        border: 1px solid #ddd;\n        border-radius: 6px;\n        background: white;\n        color: #666;\n        cursor: pointer;\n        font-size: 14px;\n        transition: all 0.3s ease;\n    }\n    .sync-target-cancel:hover {\n        background: #f5f5f5;\n        border-color: #999;\n    }\n    \n    /* 确认对话框样式 */\n    .confirm-dialog {\n        max-width: 450px;\n    }\n    .confirm-message {\n        font-size: 15px;\n        line-height: 1.6;\n        color: #333;\n        margin-bottom: 25px;\n        white-space: pre-line;\n    }\n    .confirm-buttons {\n        display: flex;\n        gap: 10px;\n    }\n    .confirm-btn {\n        flex: 1;\n        padding: 12px;\n        border: none;\n        border-radius: 6px;\n        font-size: 14px;\n        font-weight: bold;\n        cursor: pointer;\n        transition: all 0.3s ease;\n    }\n    .confirm-yes {\n        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n        color: white;\n    }\n    .confirm-yes:hover {\n        transform: translateY(-2px);\n        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);\n    }\n    .confirm-no {\n        background: #f5f5f5;\n        color: #666;\n        border: 1px solid #ddd;\n    }\n    .confirm-no:hover {\n        background: #e8e8e8;\n        border-color: #999;\n    }\n\n";

  // src/styles/selection.css
  var selection_default = "    /* 批量同步本页选择对话框样式 */\n    .sync-batch-page-dialog {\n        max-width: 620px;\n        width: 92%;\n        max-height: 88vh;\n        display: flex;\n        flex-direction: column;\n        padding: 24px !important;\n        border-radius: 12px !important;\n        box-sizing: border-box !important;\n        margin: auto !important;\n        position: relative !important;\n    }\n    .sync-batch-head h3 {\n        margin: 0;\n        font-size: 20px;\n        color: #222;\n        font-weight: 700;\n    }\n    .sync-batch-title-row {\n        display: flex;\n        justify-content: space-between;\n        align-items: center;\n    }\n    .sync-dialog-close {\n        background: none;\n        border: none;\n        font-size: 24px;\n        color: #999;\n        cursor: pointer;\n        padding: 0 4px;\n        line-height: 1;\n        transition: color 0.2s;\n    }\n    .sync-dialog-close:hover {\n        color: #333;\n    }\n    .sync-batch-desc {\n        margin: 6px 0 16px 0;\n        font-size: 13px;\n        color: #666;\n    }\n    .sync-target-tabs {\n        display: flex;\n        gap: 12px;\n        margin-bottom: 14px;\n    }\n    .sync-target-tab {\n        flex: 1;\n        display: flex;\n        align-items: center;\n        gap: 10px;\n        padding: 10px 14px;\n        border: 2px solid #e5e7eb;\n        border-radius: 8px;\n        cursor: pointer;\n        background: #fafafa;\n        transition: all 0.2s ease;\n        box-sizing: border-box;\n    }\n    .sync-target-tab:hover {\n        border-color: #667eea;\n        background: #f8f9ff;\n    }\n    .sync-target-tab.active {\n        border-color: #667eea;\n        background: #f0f3ff;\n        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);\n    }\n    .sync-target-tab .tab-icon {\n        font-size: 22px;\n        flex-shrink: 0;\n    }\n    .sync-target-tab .tab-title {\n        display: block;\n        font-size: 14px;\n        font-weight: 600;\n        color: #333;\n    }\n    .sync-target-tab .tab-desc {\n        display: block;\n        font-size: 11px;\n        color: #888;\n        margin-top: 2px;\n    }\n    .sync-list-toolbar {\n        display: flex;\n        justify-content: space-between;\n        align-items: center;\n        padding: 8px 12px;\n        background: #f3f4f6;\n        border-radius: 6px;\n        font-size: 13px;\n        color: #4b5563;\n        margin-bottom: 8px;\n        box-sizing: border-box;\n    }\n    .sync-toolbar-left {\n        display: flex;\n        align-items: center;\n        gap: 12px;\n    }\n    .sync-select-all-label {\n        display: flex;\n        align-items: center;\n        gap: 6px;\n        cursor: pointer;\n        font-weight: 600;\n        user-select: none;\n        color: #374151;\n    }\n    .sync-action-link {\n        background: none;\n        border: none;\n        color: #667eea;\n        cursor: pointer;\n        font-size: 12px;\n        padding: 0;\n        text-decoration: underline;\n    }\n    .sync-action-link:hover {\n        color: #4c51bf;\n    }\n    .sync-toolbar-right strong {\n        color: #667eea;\n        font-size: 14px;\n    }\n    .sync-movies-scroll-list {\n        flex: 1;\n        overflow-y: auto;\n        max-height: 300px;\n        min-height: 160px;\n        border: 1px solid #e5e7eb;\n        border-radius: 8px;\n        padding: 4px;\n        background: #fff;\n        box-sizing: border-box;\n    }\n    .sync-movie-item {\n        display: flex;\n        align-items: center;\n        gap: 10px;\n        padding: 8px 10px;\n        border-radius: 6px;\n        border-bottom: 1px solid #f3f4f6;\n        cursor: pointer;\n        transition: background 0.15s;\n        user-select: none;\n    }\n    .sync-movie-item:last-child {\n        border-bottom: none;\n    }\n    .sync-movie-item:hover {\n        background: #f9fafb;\n    }\n    .sync-movie-item.selected {\n        background: #f4f6ff;\n    }\n    .sync-movie-cb-wrap {\n        display: flex;\n        align-items: center;\n        flex-shrink: 0;\n    }\n    .sync-movie-cb {\n        cursor: pointer;\n        width: 15px;\n        height: 15px;\n    }\n    .sync-movie-num {\n        font-size: 11px;\n        color: #9ca3af;\n        min-width: 18px;\n        text-align: center;\n        flex-shrink: 0;\n    }\n    .sync-movie-thumb {\n        width: 30px;\n        height: 42px;\n        object-fit: cover;\n        border-radius: 4px;\n        background: #e5e7eb;\n        flex-shrink: 0;\n    }\n    .sync-movie-thumb.placeholder {\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        font-size: 16px;\n    }\n    .sync-movie-details {\n        flex: 1;\n        min-width: 0;\n    }\n    .sync-movie-title {\n        font-size: 13px;\n        font-weight: 600;\n        color: #1f2937;\n        white-space: nowrap;\n        overflow: hidden;\n        text-overflow: ellipsis;\n    }\n    .sync-movie-meta {\n        font-size: 11px;\n        color: #6b7280;\n        margin-top: 2px;\n        display: flex;\n        align-items: center;\n        gap: 6px;\n    }\n    .sync-movie-star {\n        color: #f59e0b;\n        letter-spacing: 0.5px;\n    }\n    .sync-movie-score {\n        color: #4b5563;\n    }\n    .sync-movie-unrated {\n        display: inline-block;\n        padding: 1px 6px;\n        background: #f3f4f6;\n        color: #9ca3af;\n        border-radius: 4px;\n        font-size: 11px;\n    }\n    .sync-auto-badge {\n        display: inline-block;\n        padding: 1px 6px;\n        background: #ecfdf5;\n        color: #059669;\n        border: 1px solid #a7f3d0;\n        border-radius: 4px;\n        font-size: 10px;\n        font-weight: 600;\n        margin-left: 6px;\n        vertical-align: middle;\n    }\n    .subject-unselected-hint {\n        color: #d97706;\n        font-size: 12px;\n        font-weight: normal;\n    }\n    .sync-batch-foot {\n        display: flex;\n        justify-content: flex-end;\n        gap: 12px;\n        margin-top: 16px;\n        padding-top: 12px;\n        border-top: 1px solid #e5e7eb;\n    }\n    .sync-btn-cancel {\n        padding: 8px 18px;\n        border: 1px solid #d1d5db;\n        border-radius: 6px;\n        background: #fff;\n        color: #4b5563;\n        font-size: 13px;\n        cursor: pointer;\n        transition: all 0.2s;\n    }\n    .sync-btn-cancel:hover {\n        background: #f3f4f6;\n    }\n    .sync-btn-submit {\n        padding: 8px 22px;\n        border: none;\n        border-radius: 6px;\n        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n        color: #fff;\n        font-size: 13px;\n        font-weight: 600;\n        cursor: pointer;\n        transition: all 0.2s;\n        box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);\n    }\n    .sync-btn-submit:hover {\n        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);\n        transform: translateY(-1px);\n    }\n    .sync-btn-submit.disabled, .sync-btn-submit:disabled {\n        background: #9ca3af;\n        cursor: not-allowed;\n        box-shadow: none;\n        transform: none;\n    }\n\n";

  // src/styles/subject.css
  var subject_default = '    /* 电影详情页单片同步弹窗样式 */\n    .subject-single-sync-dialog {\n        max-width: 460px;\n        width: 90%;\n        padding: 22px !important;\n        border-radius: 12px !important;\n        box-sizing: border-box !important;\n        margin: auto !important;\n        position: relative !important;\n    }\n    .subject-sync-media-card {\n        display: flex;\n        align-items: center;\n        gap: 14px;\n        background: #f9fafb;\n        padding: 12px;\n        border-radius: 8px;\n        border: 1px solid #e5e7eb;\n        margin-bottom: 14px;\n    }\n    .subject-sync-thumb {\n        width: 48px;\n        height: 68px;\n        object-fit: cover;\n        border-radius: 4px;\n        background: #e5e7eb;\n        flex-shrink: 0;\n    }\n    .subject-sync-thumb.placeholder {\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        font-size: 24px;\n    }\n    .subject-sync-media-info {\n        flex: 1;\n        min-width: 0;\n    }\n    .subject-sync-media-title {\n        font-size: 15px;\n        font-weight: 700;\n        color: #111827;\n        white-space: nowrap;\n        overflow: hidden;\n        text-overflow: ellipsis;\n    }\n    .subject-sync-media-meta {\n        font-size: 12px;\n        color: #6b7280;\n        margin-top: 4px;\n    }\n    .subject-sync-media-meta strong {\n        color: #111827;\n    }\n    .subject-sync-rating-selector {\n        margin-bottom: 6px;\n        padding: 12px;\n        background: #f9fafb;\n        border-radius: 8px;\n        border: 1px solid #e5e7eb;\n    }\n    .subject-sync-rating-label {\n        font-size: 13px;\n        font-weight: 600;\n        color: #374151;\n        margin-bottom: 8px;\n        display: flex;\n        justify-content: space-between;\n    }\n    .subject-sync-rating-text {\n        color: #d97706;\n        font-weight: 700;\n    }\n    .subject-rating-stars-bar {\n        display: flex;\n        gap: 6px;\n    }\n    .subject-star-opt {\n        flex: 1;\n        text-align: center;\n        padding: 6px 2px;\n        background: #fff;\n        border: 1px solid #d1d5db;\n        border-radius: 6px;\n        cursor: pointer;\n        font-size: 11px;\n        line-height: 1.3;\n        color: #4b5563;\n        transition: all 0.15s;\n    }\n    .subject-star-opt:hover {\n        border-color: #f59e0b;\n        color: #f59e0b;\n    }\n    .subject-star-opt.active {\n        background: #fffbeb;\n        border-color: #f59e0b;\n        color: #d97706;\n        font-weight: bold;\n    }\n\n    /* 详情页专属同步按钮 */\n    .subject-info-sync-btn {\n        margin-left: 8px !important;\n        vertical-align: middle;\n        font-size: 11px !important;\n        padding: 2px 8px !important;\n        background: #0091EA !important;\n        color: white !important;\n        border-radius: 3px !important;\n        cursor: pointer !important;\n        border: none !important;\n        transition: background 0.2s !important;\n        line-height: 1.4 !important;\n    }\n    .subject-info-sync-btn:hover {\n        background: #0277BD !important;\n    }\n    .subject-sync-action-wrap {\n        clear: both !important;\n        display: block !important;\n        margin-top: 8px !important;\n        margin-bottom: 4px !important;\n        width: 100% !important;\n        box-sizing: border-box !important;\n    }\n    .subject-action-sync-btn {\n        display: inline-flex !important;\n        align-items: center !important;\n        justify-content: center !important;\n        gap: 6px !important;\n        width: 100% !important;\n        max-width: 155px !important;\n        padding: 4px 8px !important;\n        background: #fbfbf8 !important;\n        color: #37a !important;\n        border: 1px solid #d4d8db !important;\n        border-radius: 3px !important;\n        font-size: 12px !important;\n        font-weight: 500 !important;\n        line-height: 1.5 !important;\n        cursor: pointer !important;\n        box-sizing: border-box !important;\n        transition: all 0.2s ease !important;\n        text-decoration: none !important;\n        outline: none !important;\n    }\n    .subject-action-sync-btn:hover {\n        background: #ffffff !important;\n        border-color: #e2b616 !important;\n        box-shadow: 0 1px 4px rgba(226, 182, 22, 0.2) !important;\n    }\n    .subject-action-sync-btn:active {\n        background: #f3f3ee !important;\n        transform: translateY(1px) !important;\n    }\n    .subject-sync-imdb-badge {\n        display: inline-block !important;\n        background: #f5c518 !important;\n        color: #000000 !important;\n        font-family: Impact, "Arial Black", Arial, Helvetica, sans-serif !important;\n        font-size: 10px !important;\n        font-weight: 800 !important;\n        padding: 0 4px !important;\n        border-radius: 2px !important;\n        line-height: 14px !important;\n        letter-spacing: 0.2px !important;\n    }\n    .subject-sync-btn-label {\n        font-size: 12px !important;\n        color: #3377aa !important;\n        font-weight: 500 !important;\n    }\n    .subject-action-sync-btn:hover .subject-sync-btn-label {\n        color: #111111 !important;\n    }\n    \n    .sync-imdb-btn {\n        display: inline-block;\n        margin-left: 10px;\n        padding: 4px 10px;\n        background: #0091EA;\n        color: white;\n        border-radius: 3px;\n        font-size: 12px;\n        cursor: pointer;\n        border: none;\n        transition: background 0.3s;\n    }\n    .sync-imdb-btn:hover {\n        background: #0277BD;\n    }\n    .sync-imdb-btn.syncing {\n        background: #999;\n        cursor: not-allowed;\n    }\n    .sync-imdb-btn.synced {\n        background: #52c41a;\n        cursor: default;\n    }\n    .sync-imdb-btn.sync-failed {\n        background: #ff4d4f;\n        cursor: pointer;\n    }\n    .sync-imdb-btn.sync-failed:hover {\n        background: #ff7875;\n    }\n    \n';

  // src/styles/progress.css
  var progress_default = "    /* 悬浮按钮样式 */\n    .batch-sync-float-container {\n        position: fixed;\n        right: var(--sync-float-right, 30px);\n        top: 50%;\n        transform: translateY(-50%);\n        z-index: 9999;\n        display: flex;\n        flex-direction: column;\n        gap: var(--sync-float-gap, 15px);\n    }\n    .batch-sync-float-btn {\n        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n        color: white;\n        border: none;\n        border-radius: 50px;\n        padding: 15px 25px;\n        font-size: 14px;\n        font-weight: bold;\n        cursor: pointer;\n        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);\n        transition: all 0.3s ease;\n        display: flex;\n        align-items: center;\n        gap: 8px;\n        white-space: nowrap;\n    }\n    .batch-sync-float-btn:hover {\n        transform: scale(1.05);\n        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);\n    }\n    .batch-sync-float-btn:active {\n        transform: scale(0.95);\n    }\n    .batch-sync-float-btn.syncing {\n        background: linear-gradient(135deg, #999 0%, #666 100%);\n        cursor: not-allowed;\n    }\n    .batch-sync-float-btn.sync-all {\n        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);\n        box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);\n    }\n    .batch-sync-float-btn.sync-all:hover {\n        box-shadow: 0 6px 20px rgba(245, 87, 108, 0.6);\n    }\n    .batch-sync-float-btn .icon {\n        font-size: 18px;\n    }\n    .batch-sync-float-btn .count {\n        background: rgba(255, 255, 255, 0.3);\n        padding: 2px 8px;\n        border-radius: 12px;\n        font-size: 12px;\n    }\n    .batch-sync-float-btn .total-info {\n        font-size: 11px;\n        opacity: 0.9;\n    }\n    \n    /* 同步进度面板样式 */\n    .sync-progress-panel {\n        position: fixed;\n        top: 50%;\n        left: 50%;\n        transform: translate(-50%, -50%);\n        background: white;\n        border-radius: 12px;\n        padding: 30px;\n        min-width: 500px;\n        max-width: 700px;\n        max-height: 80vh;\n        box-shadow: 0 10px 40px rgba(0,0,0,0.3);\n        z-index: 100001;\n        display: none;\n    }\n    .sync-progress-panel.show {\n        display: block;\n    }\n    .sync-progress-header {\n        display: flex;\n        justify-content: space-between;\n        align-items: center;\n        margin-bottom: 20px;\n    }\n    .sync-progress-header h3 {\n        margin: 0;\n        font-size: 20px;\n        color: #333;\n    }\n    .sync-progress-close {\n        background: none;\n        border: none;\n        font-size: 24px;\n        color: #999;\n        cursor: pointer;\n        padding: 0;\n        width: 30px;\n        height: 30px;\n        line-height: 30px;\n        text-align: center;\n        border-radius: 50%;\n        transition: all 0.3s;\n    }\n    .sync-progress-close:hover {\n        background: #f5f5f5;\n        color: #333;\n    }\n    .sync-progress-stats {\n        display: flex;\n        gap: 20px;\n        margin-bottom: 20px;\n        padding: 15px;\n        background: #f8f9ff;\n        border-radius: 8px;\n    }\n    .sync-stat-item {\n        flex: 1;\n        text-align: center;\n    }\n    .sync-stat-number {\n        font-size: 28px;\n        font-weight: bold;\n        margin-bottom: 5px;\n    }\n    .sync-stat-number.total { color: #667eea; }\n    .sync-stat-number.success { color: #52c41a; }\n    .sync-stat-number.failed { color: #ff4d4f; }\n    .sync-stat-number.pending { color: #999; }\n    .sync-stat-label {\n        font-size: 12px;\n        color: #666;\n    }\n    .sync-progress-bar-container {\n        margin-bottom: 20px;\n    }\n    .sync-progress-bar {\n        height: 8px;\n        background: #e8e8e8;\n        border-radius: 4px;\n        overflow: hidden;\n        margin-bottom: 10px;\n    }\n    .sync-progress-bar-fill {\n        height: 100%;\n        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);\n        width: 0%;\n        transition: width 0.3s ease;\n    }\n    .sync-progress-text {\n        font-size: 14px;\n        color: #666;\n        text-align: center;\n    }\n    .sync-progress-list {\n        max-height: 300px;\n        overflow-y: auto;\n        margin-bottom: 20px;\n    }\n    .sync-progress-item {\n        padding: 10px;\n        border-bottom: 1px solid #f0f0f0;\n        display: flex;\n        align-items: center;\n        gap: 10px;\n    }\n    .sync-progress-item:last-child {\n        border-bottom: none;\n    }\n    .sync-progress-icon {\n        font-size: 16px;\n        width: 20px;\n        text-align: center;\n    }\n    .sync-progress-movie {\n        flex: 1;\n        font-size: 14px;\n        color: #333;\n    }\n    .sync-progress-status {\n        font-size: 12px;\n        padding: 2px 8px;\n        border-radius: 3px;\n    }\n    .sync-progress-status.syncing {\n        background: #e6f7ff;\n        color: #1890ff;\n    }\n    .sync-progress-status.success {\n        background: #f6ffed;\n        color: #52c41a;\n    }\n    .sync-progress-status.failed {\n        background: #fff1f0;\n        color: #ff4d4f;\n    }\n    .sync-progress-actions {\n        display: flex;\n        gap: 10px;\n    }\n    .sync-progress-btn {\n        flex: 1;\n        padding: 12px;\n        border: none;\n        border-radius: 6px;\n        font-size: 14px;\n        font-weight: bold;\n        cursor: pointer;\n        transition: all 0.3s;\n    }\n    .sync-progress-btn.primary {\n        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n        color: white;\n    }\n    .sync-progress-btn.primary:hover {\n        transform: translateY(-2px);\n        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);\n    }\n    .sync-progress-btn.secondary {\n        background: #f5f5f5;\n        color: #666;\n    }\n    .sync-progress-btn.secondary:hover {\n        background: #e8e8e8;\n    }\n\n    /* ==================== 悬停预览卡片 Popover 样式 ==================== */\n";

  // src/styles/preview.css
  var preview_default = '    .media-preview-card {\n        position: fixed;\n        z-index: 9999999;\n        width: 330px;\n        background: #ffffff;\n        color: #1a1a1a;\n        border-radius: 10px;\n        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.15);\n        padding: 12px;\n        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n        font-size: 13px;\n        line-height: 1.45;\n        opacity: 0;\n        visibility: hidden;\n        transform: translateY(6px);\n        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;\n        pointer-events: auto;\n        border: 1px solid rgba(0, 0, 0, 0.08);\n        box-sizing: border-box;\n    }\n\n    .media-preview-card * {\n        box-sizing: border-box;\n    }\n\n    .media-preview-card.mpc-visible {\n        opacity: 1;\n        visibility: visible;\n        transform: translateY(0);\n    }\n\n    .mpc-loading, .mpc-error {\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        gap: 8px;\n        padding: 24px 10px;\n        color: #666;\n        font-size: 12px;\n    }\n\n    .mpc-spinner {\n        width: 16px;\n        height: 16px;\n        border: 2px solid #e0e0e0;\n        border-top-color: #3377aa;\n        border-radius: 50%;\n        animation: mpc-spin 0.7s linear infinite;\n    }\n\n    @keyframes mpc-spin {\n        to { transform: rotate(360deg); }\n    }\n\n    .mpc-content {\n        display: flex;\n        gap: 12px;\n    }\n\n    .mpc-poster-wrap {\n        flex-shrink: 0;\n        width: 80px;\n        height: 116px;\n        border-radius: 6px;\n        overflow: hidden;\n        background: #eee;\n        box-shadow: 0 2px 6px rgba(0,0,0,0.15);\n    }\n\n    .mpc-poster {\n        width: 100%;\n        height: 100%;\n        object-fit: cover;\n        display: block;\n    }\n\n    .mpc-info {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n    }\n\n    .mpc-header {\n        display: flex;\n        align-items: center;\n        gap: 6px;\n        margin-bottom: 2px;\n        width: 100%;\n        min-width: 0;\n    }\n\n    .mpc-badge {\n        display: inline-block;\n        flex-shrink: 0;\n        white-space: nowrap;\n        padding: 2px 6px;\n        border-radius: 4px;\n        font-size: 10px;\n        font-weight: 700;\n        text-transform: uppercase;\n        letter-spacing: 0.5px;\n        line-height: 1.2;\n        height: fit-content;\n        box-sizing: border-box;\n    }\n\n    .mpc-badge.imdb {\n        background: #f5c518;\n        color: #000000;\n    }\n\n    .mpc-badge.douban {\n        background: #007722;\n        color: #ffffff;\n    }\n\n    .mpc-title {\n        font-size: 14px;\n        font-weight: 600;\n        color: #111;\n        margin: 0;\n        white-space: nowrap;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        min-width: 0;\n        flex: 1;\n    }\n\n    .mpc-subtitle {\n        font-size: 11px;\n        color: #777;\n        white-space: nowrap;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        margin-bottom: 4px;\n        min-width: 0;\n        width: 100%;\n    }\n\n    .mpc-rating-row {\n        display: flex;\n        align-items: baseline;\n        gap: 4px;\n        margin-bottom: 4px;\n    }\n\n    .mpc-star {\n        color: #f5a623;\n        font-size: 14px;\n    }\n\n    .mpc-rating-score {\n        font-size: 15px;\n        font-weight: 700;\n        color: #e09015;\n    }\n\n    .mpc-rating-max {\n        font-size: 11px;\n        color: #999;\n    }\n\n.mpc-rating-votes {\n        font-size: 11px;\n        color: #888;\n        margin-left: 4px;\n}\n\n.mpc-notice {\n    margin: 10px 0 0;\n    font-size: 12px;\n    line-height: 1.5;\n    color: #5e6d63;\n}\n\n    .mpc-meta {\n        font-size: 11px;\n        color: #666;\n        margin-bottom: 6px;\n    }\n\n    .mpc-description {\n        font-size: 11px;\n        color: #555;\n        line-height: 1.4;\n        margin: 0;\n        display: -webkit-box;\n        -webkit-line-clamp: 3;\n        -webkit-box-orient: vertical;\n        overflow: hidden;\n    }\n';

  // src/main.js
  function ready() {
    GM_addStyle(dialogs_default + selection_default + subject_default + progress_default + preview_default);
    document.documentElement.style.setProperty("--sync-float-right", `${CONFIG.FLOAT_BUTTON_RIGHT}px`);
    document.documentElement.style.setProperty("--sync-float-gap", `${CONFIG.FLOAT_BUTTON_GAP}px`);
    if (["movie.douban.com", "search.douban.com"].includes(location.hostname)) initDouban();
    if (location.hostname === "www.imdb.com") initImdb();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();
