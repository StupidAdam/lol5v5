/* 把 index.html + assets/style.css + assets/app.js 打包成一个自包含的单文件 lol5v5.html
 * 用法：node build.js
 * 目的：方便直接上传到任意静态托管，或作为单个文件发给朋友用手机浏览器打开。
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('index.html');
const css = read('assets/style.css');
const js = read('assets/app.js');

const LINK = '<link rel="stylesheet" href="assets/style.css">';
const SCRIPT = '<script src="assets/app.js"></script>';
const CONFIG = '<script src="assets/config.js"></script>';

if (!html.includes(LINK) || !html.includes(SCRIPT) || !html.includes(CONFIG)) {
  console.error('没找到要内联的 link / script 标签，index.html 结构变了？');
  process.exit(1);
}

// 防止内联内容里出现 </style> / </script> 提前闭合（当前没有，但保险起见做一次转义）
const safeCss = css.replace(/<\/style>/gi, '<\\/style>');
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

// config.js 里只有两个字符串常量，直接内联；Supabase 的 CDN 仍保持外链（协作模式才需要联网）
html = html
  .replace(LINK, '<style>\n' + safeCss + '\n</style>')
  .replace(CONFIG, '<script>\n' + read('assets/config.js') + '\n</script>')
  .replace(SCRIPT, '<script>\n' + safeJs + '\n</script>');

const out = path.join(root, 'lol5v5.html');
fs.writeFileSync(out, html, 'utf8');

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log('已生成 ' + out + '（' + kb + ' KB，可单独上传或发送）');
