# A101 Scraper Server

## Overview
A Node.js scraper and REST API server that fetches campaign data from A101 supermarket website. It automatically detects campaign elements from the homepage and discovers infinite-scroll API endpoints from campaign pages.

## Recent Changes
- December 8, 2025: Initial project setup with complete scraper implementation

## Project Architecture

### Folder Structure
```
/src
  /scrapers
    a101.js         - A101 homepage and campaign page scraper
  /services
    campaigns.js    - Campaign data management and storage
  /routes
    campaigns.js    - REST API route handlers
  /utils
    logger.js       - Logging utility
/data               - JSON data storage (gitignored)
index.js            - Express server entry point
package.json        - Project dependencies
```

### Key Features
- **Homepage Scraper**: Uses primary selector `div.swiper-slide a[href*='/kapida/']` with fallback
- **Campaign Page Scraper**: Detects APIs from `window.__INITIAL_STATE__`, script tags, and HTML patterns
- **REST API**: GET /campaigns, GET /campaigns/:id, GET /api-endpoints, POST /scrape
- **Cron Scheduler**: Runs every 12 hours to refresh campaign data
- **Retry Logic**: Up to 3 retries with 1000ms delay for failed requests

### Data Storage
- Campaigns stored in `/data/a101-campaigns.json`
- API endpoints stored in `/data/a101-api-endpoints.json`
- Raw HTML saved to `/data/a101-homepage.html` for debugging

### Configuration
- Server runs on port 5000
- Uses Mozilla User-Agent header to prevent blocking
- Proper cache control headers for development

## Running the Server
```bash
npm install
npm start
```

## API Endpoints
- `GET /` - Server info and available endpoints
- `GET /campaigns` - All detected campaigns
- `GET /campaigns/:id` - Single campaign details
- `GET /api-endpoints` - All detected API URLs
- `POST /scrape` - Trigger manual rescrape
- `GET /status` - Server and scraping status
