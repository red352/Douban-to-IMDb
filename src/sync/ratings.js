

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


export { extractMovieRatingFromItem, extractSubjectUserRating };
