const superAgent = require('superagent');
const cheerio = require('cheerio');
const fs = require('fs');
const log = require('single-line-log').stdout;

class SitemapFactory{
  /**
   * sitemap 生成器
   * @param {Object} options
   *   @param {String} host 填写网站域名 | 必填
   *   @param {String} entry 填写初始链接，须带有 http 协议头 | 必填
   *   @param {String} path 填写文件保存路径，通过 path 处理的【path.resolve(__dirname, '../')】
   *   @param {String|RegExp} filter 过滤条件，由字符串或正则字面量构成的数组
   *   @param {String} filename 输出的文件名
   *   @param {Number} maxretry 最大重启次数，默认 3 （当 url 池为空后，间隔一定时间再次检测是否为空）
   *   @param {Number} loopinterval 循环时间间隔，设置为大于 20 的整数，默认为 60
   *   @param {Boolean} isdeep 是否向站内爬行，若否，只统计本页面内的链接
   * 
   */
  constructor(options) {
    this.options = options;
    this.host = null; 
    this.entry = null;
    this.httpHead = 'http';
    this.path = null;
    this.filter = [];
    this.filename = 'sitemap';
    this.maxretry = 3;
    this.loopinterval = 60;
    this.isdeep = true;
    this.init(options);

    // crawler 获取并在处理后 
    // 属于本站的合法 url 仓库及其标记
    this.URLRepository = [];
    this.URLRepositoryNote = {[this.entry]: 1};

    // get 请求抛错时收集的对应 url 仓库
    this.errorURLRepository = [];

    // 从 URLRepository 中取出并进入 crawler 循环的 url 仓库
    this.loadedURLRepository = [];

    // 从 URLRepository 中取出并经处理的
    // 符合 sitemap 要求的 url 仓库及其标记
    this.siteMapSource = [];
    this.siteMapSourceNote = {};

    // 处理耗时及 crawler 循环的 interval
    this.timer = null;
    this.loopInterval = null;

    this.retry = 0; 
    this.errorRetry = 0;
    this.secondCount = 0;
    this.costTime = '00:00:00';
    // 当前将要插入 siteMapSource 并将继续爬行的 url
    this.currentURL = null; 
  }

  init(options) {
    const host = options.host;
    if(!host) {
      throw new Error('plase give me your website`s HOST,like: www.baidu.com.');
    }

    const entry = options.entry;
    if(!entry) {
      throw new Error('plase give me an ENTRY url,like: https://www.baidu.com.');
    }
    if(entry.indexOf('http') < 0) {
      throw new Error('the ENTRY option must include a http protocal, http or https');
    }

    const path = options.path;
    if(!path) {
      throw new Error('plase give me an absolute path and let me konw where to store the SITEMAP file.');
    }

    const filter = Array.isArray(options.filter) ? options.filter : [];
    const filename = options.filename || 'sitemap';
    const maxretry = parseInt(options.maxretry) || 3;
    let loopinterval = Number(options.loopinterval) || 60;
    loopinterval = loopInterval < 20 ? 20 : loopinterval;
    let isdeep = options.isdeep;
    isdeep = Object.prototype.toString.call(options.isdeep) === '[object Undefined]'
      ? true
      : options.isdeep;

    this.host = host;
    this.entry = entry;
    // 这里，不论在页面中获取到的http协议是不是 https，都将使用这个
    this.httpHead = entry.split('://')[0];
    this.path = path;
    this.filter = filter;
    this.filename = filename;
    this.maxretry = maxretry;
    this.loopinterval = loopinterval;
    this.isdeep = isdeep;
  }

  start() {
    const startURL = this.entry;
    this.loadedURLRepository.push(startURL);
    this.mapCrawler(startURL).then(() => {
      this.URLLoop();
    }).catch(err => {
      console.log(err);
      this.exit(false);
    });
    this.timeCount();
  }

  restart(during) {
    setTimeout(() => {
      this.URLLoop();
    }, during);
  }

  // 退出程序 并生成 sitemap 文件
  exit(produce = true) {
    setTimeout(() => {
      clearInterval(this.timer);
      this.currentURL = null;
      this.terminalLog(true);
      produce && fs.writeFileSync(`${this.filename}.xml`, this.sitemap(this.siteMapSource));
      process.exit();
    }, 1000);
  }

  URLLoop() {
    this.loopInterval = setInterval(() => {
      if(!this.URLRepository.length && this.retry < this.maxretry) {
        clearInterval(this.loopInterval);
        this.retry++;
        return this.restart(this.retry * 1500);
      }else if(!this.URLRepository.length){
        clearInterval(this.loopInterval);
        if(this.errorURLRepository.length && this.errorRetry < this.maxretry) {
          return this.errorURLLoop();
        }else {
          return this.exit();
        }
      }

      this.retry = 0;

      const nextURL = this.URLRepository.shift();
      this.loadedURLRepository.push(nextURL);
      this.suitableURLStore(nextURL);
      this.isdeep && this.mapCrawler(nextURL);
      
      this.currentURL = nextURL;
      this.terminalLog();
    }, this.loopinterval);
  }

  errorURLLoop() {
    this.loopInterval = setInterval(() => {
      if(!this.errorURLRepository.length){
        clearInterval(this.loopInterval);
        if(this.URLRepository.length) {
          this.restart(1000);
          this.errorRetry++;
        }else {
          this.exit();
        }
        return;
      }

      const nextURL = this.errorURLRepository.shift();
      this.mapCrawler(nextURL);
      this.currentURL = nextURL;
      this.terminalLog();
    }, this.loopinterval);
  }

  // 搜索当前 url 指向的页面中 <a> 标签包含有效链接
  async mapCrawler(URL) {
    try{
      const res = await superAgent.get(URL);
      const $ = cheerio.load(res.text);
      const $a = $('a');
      if($a.length) {
        $a.each((idx, ele) => {
          const curHref = ele.attribs.href;
          const { isvalid, url } = this.validHref(curHref);
          isvalid && this.URLRepository.push(url);
        });
      }
      return true;
    }catch(err) {
      this.errorURLRepository.push(URL);
      return err;
    }
  }

  // href 属性值是否符合要求，若符合，返回完整的 uri
  validHref(href) {
    const result = {
      url: href,
      isvalid: false,
      isSameOrigin: false,
    }
    // href 不存在，或 href 已经存在处理记录，提前拦截
    if(!href || this.URLRepositoryNote[href]) return result;
    this.URLRepositoryNote[href] = 1;

    const isStartWithHttp = href.indexOf('http') === 0;
    const isStartWithDoubleSlash = href.indexOf('//') === 0;
    const isStartWithSingleSlash = href.indexOf('/') === 0;

    // 是否同域
    if(isStartWithHttp || isStartWithDoubleSlash) {
      const hrefArr = href.split('//')
      const origin = hrefArr[1].split('/')[0];
      result.isSameOrigin = origin === this.host;
      result.isvalid = origin === this.host;
      result.isvalid && (result.url = encodeURI(`${this.httpHead}://${hrefArr[1]}`));
    }else if(isStartWithSingleSlash){
      result.isvalid = true;
      result.isSameOrigin = true;
      result.url = encodeURI(`${this.httpHead}://${this.host}${href}`);
    }else {
      result.isvalid = false;
      result.isSameOrigin = false;
    }

    // 是否已经存在记录
    if(this.URLRepositoryNote[result.url]) {
      result.isvalid = false;
    }else {
      this.URLRepositoryNote[result.url] = 1;
    }

    return result;
  }

  // 存储符合条件的 URL
  suitableURLStore(nextURL) {
    const { isMatch, resolvedUrl } = this.URLFilterMatch(nextURL);
    if(!isMatch) {
      this.siteMapSource.push(resolvedUrl);
    }
  }

  // 筛出符合 filter 的 URL;不符合则返回符合 sitemap 格式的 url
  URLFilterMatch(url) {
    const result = {
      isMatch: false,
      resolvedUrl: null,
    }
    // 是否已存在记录
    if(!url || this.siteMapSourceNote[url]) return result;
    this.siteMapSourceNote[url] = 1;

    const filter = this.filter;
    const len = filter.length;
    for(let i = 0; i < len; i++) {
      const filterItem = filter[i];
      const filterDataType = Object.prototype.toString.call(filterItem);
      if(filterDataType === '[object RegExp]') {
        result.isMatch = filterItem.test(url);
      }else if(filterDataType === '[object String]') {
        result.isMatch = url.includes(filterItem);
      }else {
        // invalid filter;
        result.isMatch = false;
      }
      if(result.isMatch) {
        break;
      }
    }

    if(!result.isMatch) { // 未匹配成功则处理 url 特殊字符格式
      let resolvedUrl = url.replace(/&/igu, '&amp;');
      resolvedUrl = resolvedUrl.replace(/'/igu, '&apos;');
      resolvedUrl = resolvedUrl.replace(/"/igu, '&quot;');
      resolvedUrl = resolvedUrl.replace(/>/igu, '&gt;');
      resolvedUrl = resolvedUrl.replace(/</igu, '&lt;');
      result.resolvedUrl = resolvedUrl;
    }
    return result;
  }

  // 产出生成 sitemap 文件的字符串
  sitemap(sourceArr = []) {
    const sitemapTemplate = (sitemapStr) => {
return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${sitemapStr}
</urlset>`;
    }
    const sitemapItemsTemplate = (url) => {
return `
  <url>
    <loc>${url}</loc>
  </url>`;
    }

    let sitemapStr = '';
    const len = sourceArr.length;
    for(let i = 0; i < len; i++) {
      sitemapStr += sitemapItemsTemplate(sourceArr[i]);
    }

    return sitemapTemplate(sitemapStr);
  }
  
  // 统计耗时
  timeCount() {
    this.timer = setInterval(() => {
      this.secondCount ++;
      let h = 0, m = 0, s = 0;
      s = this.secondCount % 60;
      m = Math.floor(this.secondCount / 60) % 60;
      h = Math.floor(Math.floor(this.secondCount / 60) / 60) % 60;
      s = s > 9 ? s : `0${s}`;
      m = m > 9 ? m : `0${m}`;
      h = h > 9 ? h : `0${h}`;
      this.costTime = `${h}:${m}:${s}`;

      this.terminalLog();
    }, 1000)
  }

  // 终端信息打印
  terminalLog(isEnd = false) {
    const resolveRate = `${this.siteMapSource.length}/${this.URLRepository.length + this.loadedURLRepository.length}`;
    const errorCount = this.errorURLRepository.length;
    if(!isEnd) {
      log(`\x1B[32m 耗时：${this.costTime} || 收录/总数：${resolveRate} || 错误链接：${errorCount} || 当前：${decodeURI(this.currentURL)}\x1B[39m`);
    }else {
      log(`\x1B[32m 耗时：${this.costTime} || 收录/总数: ${resolveRate} || 错误链接：${errorCount} \x1B[39m`);
    }
  }
}

module.exports = SitemapFactory;
