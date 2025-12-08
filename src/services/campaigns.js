const fs = require('fs').promises;
const path = require('path');
const a101Scraper = require('../scrapers/a101');
const logger = require('../utils/logger');

const DATA_DIR = path.join(process.cwd(), 'data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'a101-campaigns.json');
const API_ENDPOINTS_FILE = path.join(DATA_DIR, 'a101-api-endpoints.json');

let campaignsCache = [];
let apiEndpointsCache = [];
let isScrapingInProgress = false;

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create data directory: ${error.message}`);
  }
}

async function loadFromFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`Failed to load ${filePath}: ${error.message}`);
    }
    return [];
  }
}

async function saveToFile(filePath, data) {
  try {
    await ensureDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved data to ${filePath}`);
  } catch (error) {
    logger.error(`Failed to save ${filePath}: ${error.message}`);
    throw error;
  }
}

async function initialize() {
  await ensureDataDir();
  campaignsCache = await loadFromFile(CAMPAIGNS_FILE);
  apiEndpointsCache = await loadFromFile(API_ENDPOINTS_FILE);
  logger.info(`Loaded ${campaignsCache.length} campaigns from cache`);
  logger.info(`Loaded ${apiEndpointsCache.length} API endpoints from cache`);
}

async function scrapeAll() {
  if (isScrapingInProgress) {
    logger.warn('Scraping already in progress, skipping...');
    return { success: false, message: 'Scraping already in progress' };
  }
  
  isScrapingInProgress = true;
  logger.info('Full scrape started');
  
  try {
    const campaigns = await a101Scraper.scrapeHomepage();
    
    const scrapedCampaigns = [];
    for (const campaign of campaigns) {
      const detailed = await a101Scraper.scrapeCampaignPage(campaign);
      scrapedCampaigns.push(detailed);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    campaignsCache = scrapedCampaigns;
    
    apiEndpointsCache = scrapedCampaigns.flatMap(campaign => 
      campaign.apiEndpoints.map(endpoint => ({
        campaignId: campaign.id,
        campaignTitle: campaign.campaignTitle,
        endpoint,
        detectedAt: new Date().toISOString(),
      }))
    );
    
    await saveToFile(CAMPAIGNS_FILE, campaignsCache);
    await saveToFile(API_ENDPOINTS_FILE, apiEndpointsCache);
    
    logger.info(`Full scrape finished. ${campaignsCache.length} campaigns, ${apiEndpointsCache.length} API endpoints`);
    
    return {
      success: true,
      campaignsCount: campaignsCache.length,
      apiEndpointsCount: apiEndpointsCache.length,
    };
  } catch (error) {
    logger.error(`Full scrape failed: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    isScrapingInProgress = false;
  }
}

function getAllCampaigns() {
  return campaignsCache;
}

function getCampaignById(id) {
  return campaignsCache.find(c => c.id === id);
}

function getAllApiEndpoints() {
  return apiEndpointsCache;
}

function isScrapingActive() {
  return isScrapingInProgress;
}

module.exports = {
  initialize,
  scrapeAll,
  getAllCampaigns,
  getCampaignById,
  getAllApiEndpoints,
  isScrapingActive,
};
