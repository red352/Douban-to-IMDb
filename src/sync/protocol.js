// 保持现有 wire format，批次 ID 可以包含任意数量的连字符。
export function parseDoubanHash(hash) {
  const parts = hash.replace(/^#sync-/, '').split('-');
  const rating = Math.min(5, Math.max(1, Number.parseInt(parts.shift(), 10) || 5));
  const target = parts.shift() === 'watchlist' ? 'watchlist' : 'rating';
  const movieIndex = parts.length > 1 ? Number.parseInt(parts.pop(), 10) || 0 : 0;
  return { rating, target, batchId: parts.join('-') || 'single', movieIndex };
}

export function parseImdbHash(hash) {
  const parts = hash.replace(/^#/, '').split('-');
  const score = parts.shift();
  const target = parts.shift() === 'watchlist' ? 'watchlist' : 'rating';
  const doubanId = parts.pop() || '';
  const movieIndex = Number.parseInt(parts.pop(), 10) || 0;
  const batchId = parts.join('-') || 'single';
  const valid = /^(10|[1-9])$/.test(score) && /^\d+$/.test(doubanId);
  return { score: valid ? score : '', target, batchId, movieIndex, doubanId };
}
