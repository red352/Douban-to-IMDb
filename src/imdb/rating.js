// 只读取第一个评分数值，不能把 “8/10” 的分母当成已评分 10 分。
export function matchesRating(text, score) {
  const match = String(text || '').match(/(?:^|[^\d])(10|[1-9])(?=$|[^\d])/);
  return !!match && match[1] === String(score);
}
