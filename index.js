const express = require('express');
const cron = require('node-cron');
const campaignsRouter = require('./src/routes/campaigns');
const campaignsService = require('./src/services/campaigns');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: 'A101 Scraper Server',
    version: '1.0.0',
    endpoints: {
      'GET /campaigns': 'Returns all detected campaigns',
      'GET /campaigns/:id': 'Returns a single campaign and its API endpoints',
      'GET /api-endpoints': 'Returns all detected API URLs',
      'POST /scrape': 'Triggers manual rescraping',
      'GET /status': 'Returns server and scraping status',
    },
  });
});

app.use('/', campaignsRouter);

cron.schedule('0 */12 * * *', async () => {
  logger.info('Cron job started: Scheduled scrape (every 12 hours)');
  try {
    await campaignsService.scrapeAll();
    logger.info('Cron job finished: Scheduled scrape completed');
  } catch (error) {
    logger.error(`Cron job failed: ${error.message}`);
  }
});

async function startServer() {
  try {
    await campaignsService.initialize();
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on http://0.0.0.0:${PORT}`);
      logger.info('Cron job scheduled: Every 12 hours');
      
      logger.info('Running initial scrape...');
      campaignsService.scrapeAll().catch(err => {
        logger.error(`Initial scrape failed: ${err.message}`);
      });
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
