const express = require('express');
const router = express.Router();
const campaignsService = require('../services/campaigns');
const logger = require('../utils/logger');

router.get('/campaigns', (req, res) => {
  try {
    const campaigns = campaignsService.getAllCampaigns();
    res.json({
      success: true,
      count: campaigns.length,
      data: campaigns,
    });
  } catch (error) {
    logger.error(`GET /campaigns failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaigns',
    });
  }
});

router.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = campaignsService.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }
    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error(`GET /campaigns/${req.params.id} failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign',
    });
  }
});

router.get('/api-endpoints', (req, res) => {
  try {
    const endpoints = campaignsService.getAllApiEndpoints();
    res.json({
      success: true,
      count: endpoints.length,
      data: endpoints,
    });
  } catch (error) {
    logger.error(`GET /api-endpoints failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API endpoints',
    });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    if (campaignsService.isScrapingActive()) {
      return res.status(409).json({
        success: false,
        error: 'Scraping already in progress',
      });
    }
    
    logger.info('Manual scrape triggered via POST /scrape');
    
    res.json({
      success: true,
      message: 'Scraping started',
    });
    
    campaignsService.scrapeAll().catch(err => {
      logger.error(`Background scrape failed: ${err.message}`);
    });
  } catch (error) {
    logger.error(`POST /scrape failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to start scraping',
    });
  }
});

router.get('/status', (req, res) => {
  res.json({
    success: true,
    scraping: campaignsService.isScrapingActive(),
    campaignsCount: campaignsService.getAllCampaigns().length,
    apiEndpointsCount: campaignsService.getAllApiEndpoints().length,
  });
});

module.exports = router;
