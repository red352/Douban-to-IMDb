

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


export { insertLinks, openNewBackgroundTab };
