import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const metadata = (await readFile('src/metadata.txt', 'utf8')).trim();
const version = metadata.match(/^\/\/ @version\s+(\S+)/m)?.[1];
if (!version || !(await readFile('README.md', 'utf8')).includes(`version-${version}-blue.svg`)) {
  throw new Error('README 与用户脚本版本不一致');
}
const result = await build({
  entryPoints: ['src/main.js'], bundle: true, write: false,
  format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none',
  loader: { '.css': 'text' }, banner: { js: metadata },
});
const output = result.outputFiles[0].text;
if (process.argv.includes('--check')) {
  if (await readFile('douban.js', 'utf8') !== output) throw new Error('产物已过期，请运行 npm run build');
  console.log('产物与源码一致');
} else {
  await writeFile('douban.js', output);
  console.log(`已构建 douban.js (${output.length} 字符)`);
}
