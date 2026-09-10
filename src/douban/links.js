import { bindHoverPreview, preloadPreview } from '../preview/ui.js';

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


export { addImdbLinkBack };
