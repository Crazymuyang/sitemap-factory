# SITEMAP-FACTORY

这是一段简单的生成 `sitemap.xml` 网站地图的脚本，需要 node 环境支持。

脚本中涉及插件：
- [cheerio](https://github.com/cheeriojs/cheerio)
- [axios](https://github.com/axios/axios)
- [single-line-log](https://github.com/freeall/single-line-log)

目前它只实现了对 `loc` 的记录，并未处理 上次更新时间(lastmod)、更新频率(changefreq)、权重(priority) 这三个值，后续会继续完善。
```xml
<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.xxx.com/</loc>
  </url>
</urset>

```

假如你网站内容并不是很多，或许可以拿它来尝试一下，但要注意 `loopspan` 的设置。
假如设置时间间隔太短，可能会给网站服务器带来较大的压力甚至更严重的后果；
或者你想要测试的网站服务器设置了反爬虫策略，则可能导致产生大量 429 状态的请求甚至当前 ip 被封而彻底拒绝访问；etc。

下面是使用示例，GOOD LUCK :) 

```javascript
/**
 * sitemap 生成器
 * @param {Object} options
 *   @param {String} host 填写网站域名 | 必填
 *   @param {String} entry 填写初始链接，须带有 http 协议头 | 必填
 *   @param {String} path 填写文件保存路径，通过 path 处理的。eg: path.resolve(__dirname, './') | 必填
 *   @param {String|RegExp} filter 过滤条件，由字符串或正则字面量构成的数组, 默认 []
 *   @param {String} filename 输出的文件名，默认 sitemap
 *   @param {Number} maxretry 最大重启次数，当 url 池为空后，间隔一定时间再次检测是否为空，默认 3
 *   @param {Number} loopspan 循环时间间隔，设置为大于 60 的整数，默认 100ms
 *   @param {Boolean} isdeep 是否向站内爬行，若否，只统计本页面内的链接，默认 true
 * 
 */
const path = require('path');
const SitemapFactory = require('../index.js');

const options = {
  host: 'www.xxx.com',
  entry: 'https://www.xxx.com/',
  path: path.resolve(__dirname, './'),
  filter: [
    /page=[2-9]{1}\d*/iu, 
  ],
  filename: 'demo',
  maxretry: 2,
  loopspan: 200,
  isdeep: true,
}

const sitemapFact = new SitemapFactory(options);
sitemapFact.start();

```
