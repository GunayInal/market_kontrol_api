const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const A101_HOMEPAGE_URL = 'https://www.a101.com.tr/kapida';
const A101_CAMPAIGN_SLIDER_SELECTOR = "div.swiper-slide a[href*='/kapida/']";
const A101_CAMPAIGN_FALLBACK_SELECTOR = "a[href*='/kapida/'] img";
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      logger.error(`Attempt ${attempt}/${retries} failed for ${url}: ${error.message}`);
      if (attempt < retries) {
        await sleep(RETRY_DELAY);
      } else {
        throw error;
      }
    }
  }
}

async function saveDebugHtml(html, filename) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, filename), html, 'utf-8');
    logger.info(`Saved debug HTML to data/${filename}`);
  } catch (error) {
    logger.error(`Failed to save debug HTML: ${error.message}`);
  }
}

async function scrapeHomepage() {
  logger.info('Homepage scraping started');
  
  try {
    const html = await fetchWithRetry(A101_HOMEPAGE_URL);
    await saveDebugHtml(html, 'a101-homepage.html');
    
    const $ = cheerio.load(html);
    const campaigns = [];
    const seenUrls = new Set();
    
    let elements = $(A101_CAMPAIGN_SLIDER_SELECTOR);
    logger.info(`Primary selector found ${elements.length} elements`);
    
    if (elements.length === 0) {
      logger.warn('Primary selector failed, trying fallback selector');
      elements = $(A101_CAMPAIGN_FALLBACK_SELECTOR);
      logger.info(`Fallback selector found ${elements.length} elements`);
    }
    
    elements.each((index, element) => {
      try {
        const $el = $(element);
        let $link, $img;
        
        if ($el.is('a')) {
          $link = $el;
          $img = $el.find('img').first();
        } else if ($el.is('img')) {
          $img = $el;
          $link = $el.closest('a');
        }
        
        let href = $link ? $link.attr('href') : null;
        if (!href || !href.includes('/kapida/')) return;
        
        if (!href.startsWith('http')) {
          href = `https://www.a101.com.tr${href}`;
        }
        
        if (seenUrls.has(href)) return;
        seenUrls.add(href);
        
        const imgSrc = $img ? $img.attr('src') || $img.attr('data-src') : null;
        const imgAlt = $img ? $img.attr('alt') : null;
        
        let title = imgAlt;
        if (!title) {
          const urlParts = href.split('/').filter(Boolean);
          const lastPart = urlParts[urlParts.length - 1];
          title = lastPart ? lastPart.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown Campaign';
        }
        
        let imageUrl = imgSrc;
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `https://www.a101.com.tr${imageUrl}`;
        }
        
        campaigns.push({
          id: `a101-${index + 1}`,
          market: 'A101',
          version: '1.0',
          campaignTitle: title,
          url: href,
          image: imageUrl || null,
          apiEndpoints: [],
          scrapedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error(`Error extracting campaign at index ${index}: ${err.message}`);
      }
    });
    
    logger.info(`Homepage scraping finished. Found ${campaigns.length} campaigns`);
    return campaigns;
  } catch (error) {
    logger.error(`Homepage scraping failed: ${error.message}`);
    throw error;
  }
}

async function scrapeCampaignPage(campaign) {
  logger.info(`Campaign scraping started: ${campaign.campaignTitle}`);
  
  try {
    const html = await fetchWithRetry(campaign.url);
    const $ = cheerio.load(html);
    const apiEndpoints = [];
    let productCount = null;
    
    $('script').each((_, script) => {
      const content = $(script).html() || '';
      
      const initialStateMatch = content.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (initialStateMatch) {
        try {
          const stateStr = initialStateMatch[1];
          const urlMatches = stateStr.match(/https?:\/\/[^"'\s]+api[^"'\s]*/gi) || [];
          urlMatches.forEach(url => {
            if (!apiEndpoints.includes(url)) {
              apiEndpoints.push(url);
            }
          });
          
          const countMatch = stateStr.match(/"totalCount"\s*:\s*(\d+)/);
          if (countMatch) {
            productCount = parseInt(countMatch[1], 10);
          }
        } catch (e) {
          logger.warn(`Failed to parse __INITIAL_STATE__: ${e.message}`);
        }
      }
      
      const nextMatches = content.match(/"next"\s*:\s*"([^"]+)"/g) || [];
      nextMatches.forEach(match => {
        const urlMatch = match.match(/"next"\s*:\s*"([^"]+)"/);
        if (urlMatch && urlMatch[1]) {
          let url = urlMatch[1];
          if (!url.startsWith('http')) {
            url = `https://www.a101.com.tr${url}`;
          }
          if (!apiEndpoints.includes(url)) {
            apiEndpoints.push(url);
          }
        }
      });
      
      const apiMatches = content.match(/"api"\s*:\s*"([^"]+)"/g) || [];
      apiMatches.forEach(match => {
        const urlMatch = match.match(/"api"\s*:\s*"([^"]+)"/);
        if (urlMatch && urlMatch[1]) {
          let url = urlMatch[1];
          if (!url.startsWith('http')) {
            url = `https://www.a101.com.tr${url}`;
          }
          if (!apiEndpoints.includes(url)) {
            apiEndpoints.push(url);
          }
        }
      });
      
      const productApiPattern = /https?:\/\/[^"'\s]*(?:products|items|catalog)[^"'\s]*/gi;
      const productUrls = content.match(productApiPattern) || [];
      productUrls.forEach(url => {
        if (!apiEndpoints.includes(url)) {
          apiEndpoints.push(url);
        }
      });
    });
    
    const dataApiPattern = /data-api="([^"]+)"/g;
    let dataMatch;
    while ((dataMatch = dataApiPattern.exec(html)) !== null) {
      let url = dataMatch[1];
      if (!url.startsWith('http')) {
        url = `https://www.a101.com.tr${url}`;
      }
      if (!apiEndpoints.includes(url)) {
        apiEndpoints.push(url);
      }
    }
    
    logger.info(`API detection results for ${campaign.campaignTitle}: ${apiEndpoints.length} endpoints found`);
    
    return {
      ...campaign,
      apiEndpoints,
      productCount,
      lastScrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Campaign scraping failed for ${campaign.campaignTitle}: ${error.message}`);
    return {
      ...campaign,
      apiEndpoints: [],
      productCount: null,
      error: error.message,
      lastScrapedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  scrapeHomepage,
  scrapeCampaignPage,
  A101_HOMEPAGE_URL,
};
