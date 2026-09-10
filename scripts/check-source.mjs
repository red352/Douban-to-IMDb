import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { transform } from 'esbuild';

const globals = new Set(`$ AbortController Array Boolean DOMParser Date Error GM_addStyle GM_xmlhttpRequest Image JSON Map Math MouseEvent MutationObserver Number Object RegExp Set String URL URLSearchParams clearInterval clearTimeout console document encodeURIComponent fetch localStorage location matchMedia navigator parseInt requestAnimationFrame sessionStorage setInterval setTimeout window`.split(' '));
const files = await readdir('src', { recursive: true });
for (const file of files) {
  if (file.endsWith('.js')) {
    const source = await readFile(`src/${file}`, 'utf8');
    const ast = parse(source, { ecmaVersion: 2022, sourceType: 'module', ranges: true });
    const scopes = analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
    const unknown = scopes.globalScope.through.filter(ref => !globals.has(ref.identifier.name));
    if (unknown.length) throw new Error(`${file}: 未声明的依赖 ${unknown.map(ref => ref.identifier.name).join(', ')}`);
  } else if (file.endsWith('.css')) {
    const result = await transform(await readFile(`src/${file}`, 'utf8'), { loader: 'css', logLevel: 'silent' });
    if (result.warnings.length) throw new Error(`${file}: ${result.warnings.map(warning => warning.text).join(', ')}`);
  }
}
console.log('源码模块依赖与 CSS 语法检查通过');
