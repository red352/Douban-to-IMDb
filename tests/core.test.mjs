import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDoubanHash, parseImdbHash } from '../src/sync/protocol.js';
import { matchesRating } from '../src/imdb/rating.js';

test('同步协议保持原格式并支持带连字符批次', () => {
  assert.deepEqual(parseDoubanHash('#sync-4-rating-batch-123-2'), { rating: 4, target: 'rating', batchId: 'batch-123', movieIndex: 2 });
  assert.equal(parseDoubanHash('#sync-5-watchlist-batch-auto-123-2').batchId, 'batch-auto-123');
  assert.deepEqual(parseImdbHash('#8-rating-batch-auto-123-2-1292052'), { score: '8', target: 'rating', batchId: 'batch-auto-123', movieIndex: 2, doubanId: '1292052' });
});
test('评分确认不接受空按钮、评分入口或满分分母', () => {
  assert.equal(matchesRating('', 8), false);
  assert.equal(matchesRating('Rate', 8), false);
  assert.equal(matchesRating('Your rating 8/10', 8), true);
  assert.equal(matchesRating('Your rating 8/10', 10), false);
});
