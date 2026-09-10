import { initDouban } from './douban/index.js';
import { initImdb } from './imdb/index.js';
import dialogsCSS from './styles/dialogs.css';
import selectionCSS from './styles/selection.css';
import subjectCSS from './styles/subject.css';
import progressCSS from './styles/progress.css';
import previewCSS from './styles/preview.css';
import { CONFIG } from './core/config.js';
function ready() {
  GM_addStyle(dialogsCSS + selectionCSS + subjectCSS + progressCSS + previewCSS);
  document.documentElement.style.setProperty('--sync-float-right', `${CONFIG.FLOAT_BUTTON_RIGHT}px`);
  document.documentElement.style.setProperty('--sync-float-gap', `${CONFIG.FLOAT_BUTTON_GAP}px`);
  if (['movie.douban.com', 'search.douban.com'].includes(location.hostname)) initDouban();
  if (location.hostname === 'www.imdb.com') initImdb();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
else ready();
