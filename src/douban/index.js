import { parseDoubanHash } from '../sync/protocol.js';
import { initMovieListPage } from './list.js';
import { addImdbLinkBack } from './links.js';
import { addSubjectPageSyncButtons } from '../sync/subject.js';
import { CONFIG } from '../core/config.js';
import { showToast } from '../sync/dialogs.js';

let initialized = false;
function initDouban() {
if (initialized) return;
initialized = true;
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
initMovieListPage();
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
if (location.pathname.includes('/subject/') && location.hash.startsWith('#sync-')) {
        console.log('[Douban to IMDb] 检测到同步请求，等待页面加载...');
        
        // 等待页面加载完成
        setTimeout(function() {
            const { rating, target, batchId, movieIndex } = parseDoubanHash(location.hash);
            
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
let id = location.pathname.split('/')[2];
let title = $('html head title').text();
title = title.replace('(豆瓣)', '').trim()
let title_en = $('span[property="v:itemreviewed"]').text() + ' ' + $('.year').eq(0).text().replace('(', '').replace(')', '')
title_en = title_en.replace(title, '').trim()
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


export { initDouban };
