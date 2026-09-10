

const PREVIEW_CACHE = new Map();

const PREVIEW_STORAGE_KEY = 'douban_imdb_preview_cache_v2';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function isValidPreviewData(data) {
        if (!data || typeof data !== 'object') return false;
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


export { PREVIEW_CACHE, PREVIEW_STORAGE_KEY, CACHE_TTL, isValidPreviewData, saveCacheToStorage };
