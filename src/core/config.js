

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

let pathname = location.pathname


export { CONFIG, pathname };
