import { parse } from 'node-html-parser';

const BIZIM_URL = 'https://www.bizimtoptan.com.tr';
const CAMPAIGNS_PATH = '/s/online-kampanyalar';
const MARKET_NAME = 'Bizim';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};

const parseProductItem = (itemElement) => {
    const enhancedDataElement = itemElement.querySelector('.product-item');
    let enhancedData = {};
    if (enhancedDataElement && enhancedDataElement.hasAttribute('data-enhanced-productclick')) {
        try {
            const jsonString = enhancedDataElement.getAttribute('data-enhanced-productclick').replace(/&quot;/g, '"');
            enhancedData = JSON.parse(jsonString);
        } catch (e) {}
    }

    const nameElement = itemElement.querySelector('.productbox-name');
    const priceElement = itemElement.querySelector('.product-price');
    const imageElement = itemElement.querySelector('.product-box-zoom-image'); 
    const bulkPriceElement = itemElement.querySelector('.percent-value-tierpriceofpiece');
    const unitPriceElement = itemElement.querySelector('.product-units-line .unit-price');
    const linkElement = itemElement.querySelector('.productbox-link');
    const relativeUrl = linkElement ? linkElement.getAttribute('href') : null;

    const productImageUrl = imageElement 
        ? (imageElement.getAttribute('src') || imageElement.getAttribute('data-src'))
        : null;

    const priceText = priceElement ? priceElement.text.replace(' TL', '').replace(',', '.').trim() : null;
    let bulkDiscountText = null;
    let bulkUnitPrice = null;

    if (bulkPriceElement) {
        bulkDiscountText = bulkPriceElement.text.trim();
        bulkUnitPrice = unitPriceElement ? unitPriceElement.text.split('/')[0].replace(' TL', '').replace(',', '.').trim() : null;
    }

    return {
        id: enhancedData.item_id || null,
        name: enhancedData.item_name || (nameElement ? nameElement.text.trim() : 'Bilinmeyen Ürün'),
        brand: enhancedData.item_brand || null,
        category: enhancedData.item_category || null,
        price: parseFloat(priceText) || null,
        bulkDiscountText: bulkDiscountText,
        bulkPrice: parseFloat(bulkUnitPrice) || null,
        imageUrl: productImageUrl, 
        url: relativeUrl ? `${BIZIM_URL}${relativeUrl}` : null,
        source: MARKET_NAME
    };
};

const scrapeProductsFromCampaign = async (campaignBaseUrl) => {
    console.log(`\t- Scraping products from: ${campaignBaseUrl}`);
    let allProducts = [];
    let pageNumber = 1;
    let productsFoundOnPage = 0;

    do {
        let currentUrl = pageNumber === 1 ? campaignBaseUrl : `${campaignBaseUrl}?pagenumber=${pageNumber}&paginationType=10`; 
        try {
            const response = await fetch(currentUrl, { headers: DEFAULT_HEADERS });
            if (!response.ok) break; 
            const html = await response.text();
            const root = parse(html);
            const productItems = root.querySelectorAll('.product-grid-item-container');
            productsFoundOnPage = productItems.length;

            if (productsFoundOnPage === 0) break; 

            productItems.forEach(item => {
                const product = parseProductItem(item);
                if (product.name !== 'Bilinmeyen Ürün' && product.price) {
                    allProducts.push(product);
                }
            });
            pageNumber++; 
        } catch (error) { break; }
    } while (productsFoundOnPage > 0); 
    return allProducts;
};

export const runBizimScraper = async () => {
    console.log(`Starting ${MARKET_NAME} Scraper...`);
    let campaigns = [];
    let totalProductsCount = 0;

    try {
        const response = await fetch(`${BIZIM_URL}${CAMPAIGNS_PATH}`, { headers: DEFAULT_HEADERS });
        if (!response.ok) throw new Error('Ana kampanya listesi çekilemedi.');

        const html = await response.text();
        const root = parse(html);
        const campaignItems = root.querySelectorAll('div.ImageUpload.text-left');

        for (const item of campaignItems) {
            try {
                const linkElement = item.querySelector('a');
                const imageElement = item.querySelector('img');
                const coverImage = imageElement ? (imageElement.getAttribute('src') || imageElement.getAttribute('data-src')) : null;
                const relativeUrl = linkElement ? linkElement.getAttribute('href') : null;

                if (relativeUrl && !relativeUrl.startsWith('http')) {
                    const cleanRelativeUrl = relativeUrl.replace('~/', '/');
                    const detailUrl = `${BIZIM_URL}${cleanRelativeUrl}`;
                    const title = cleanRelativeUrl.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                    if (coverImage) {
                        const products = await scrapeProductsFromCampaign(detailUrl);
                        totalProductsCount += products.length;
                        campaigns.push({
                            id: detailUrl.split('/').pop(),
                            title: title,
                            imageUrl: coverImage, 
                            detailUrl: detailUrl, 
                            products: products
                        });
                    }
                }
            } catch (e) {}
        }

        return {
            fullData: { bizim_campaigns: campaigns },
            totalCampaigns: campaigns.length,
            totalProducts: totalProductsCount
        };
    } catch (error) {
        return { fullData: { bizim_campaigns: [] }, totalCampaigns: 0, totalProducts: 0 };
    }
};