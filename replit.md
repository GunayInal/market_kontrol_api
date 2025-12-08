# A101 Scraper Server

## Overview
A Node.js scraper and REST API server that fetches campaign data from A101 supermarket website (https://www.a101.com.tr). Automatically detects campaign cards from the homepage slider.

## Recent Changes
- December 8, 2025: Initial project setup with campaign scraper

## Project Architecture

### Folder Structure
```
/src
  /scrapers
    a101.js         - A101 homepage campaign scraper
  /services
    campaigns.js    - Campaign data management and storage
  /routes
    campaigns.js    - REST API route handlers
  /utils
    logger.js       - Logging utility
/data               - JSON data storage (gitignored)
index.js            - Express server entry point
```

### Key Features
- **Homepage Scraper**: Detects campaigns from A101 main homepage using swiper-slide and card selectors
- **Campaign Data**: Extracts title, URL, and image for each campaign
- **REST API**: GET /campaigns, GET /campaigns/:id, POST /scrape, GET /status
- **Cron Scheduler**: Runs every 12 hours to refresh campaign data
- **Retry Logic**: Up to 3 retries with 1000ms delay for failed requests

### Selectors Used
- Primary: `div.swiper-slide a[href*='/kapida/']`
- Card: `a[href*='/kapida/'][class*='rounded-2xl']`
- Fallback: `a[href*='/kapida/'] img`

### Filtering Rules
- Only links containing `/kapida/` are considered
- Product pages (`_p-` pattern) are excluded
- Navigation pages (kampanyalar, hakkimizda, etc.) are excluded

## API Endpoints
- `GET /` - Server info
- `GET /campaigns` - All campaigns with images/URLs/titles
- `GET /campaigns/:id` - Single campaign details
- `POST /scrape` - Trigger manual rescrape
- `GET /status` - Server status
