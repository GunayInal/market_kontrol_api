// migros.js (Manuel Kampanya Bağımlılığı Kaldırıldı)

// API Endpointleriniz
const CAMPAIGN_LIST_API_URL = (reid) => `https://www.migros.com.tr/rest/shopping-lists/placeholder/CAMPAIGN_LIST?reid=${reid}`;
const CAMPAIGN_DETAIL_URL = (slug) => `https://www.migros.com.tr/rest/search/screens/${slug}`;

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};

let cachedCookies = ''; 

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Yardımcı Fonksiyon: Kampanyaları Çekme (Güncellendi)
const fetchCampaigns = async () => {
    // Manuel/Yedek Kampanya listesi, dosya bağımlılığı olmaması için boş array olarak tanımlandı.
    const FALLBACK_CAMPAIGNS = []; 

    try {
        console.log('Migros: Fetching campaigns from Official API...');

        const timestamp = Date.now().toString() + '000000';
        const url = CAMPAIGN_LIST_API_URL(timestamp);

        const response = await fetch(url, {
            headers: {
                ...DEFAULT_HEADERS,
                'Referer': 'https://www.migros.com.tr/kampanyalar',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`Migros API fetch failed: ${response.status}, falling back to empty list.`);
            return FALLBACK_CAMPAIGNS;
        }

        const json = await response.json();

        let apiCampaigns = [];
        const data = json.data;

        let items = Array.isArray(data) ? data : (data && typeof data === 'object' ? Object.values(data) : []);

        apiCampaigns = items.map(item => {
            let imageUrl = item.imageUrls?.[0]?.urls?.CAMPAIGN_LIST || 'default_migros_image.svg';
            let slug = item.prettyName || item.landingPageInfo?.slug;

            return {
                id: String(item.id),
                name: item.name || item.prettyName,
                slug: slug,
                imageUrl: imageUrl
            };
        }).filter(c => c.slug); 

        // Manuel kampanyalar kullanılmadığı için sadece API'den gelenler döner.
        const uniqueCampaigns = apiCampaigns; 

        console.log(`Migros: Scoped ${uniqueCampaigns.length} unique campaigns.`);
        return uniqueCampaigns;

    } catch (error) {
        console.error('Migros: Error in fetchCampaigns:', error);
        return FALLBACK_CAMPAIGNS; // Hata durumunda boş liste döner
    }
};

// Yardımcı Fonksiyon: Kampanyaya Ait Ürünleri Çekme (Aynı kaldı)
const fetchCampaignProducts = async (slug) => {
    // ... (Kod aynı kaldı) ...
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const timestamp = Date.now().toString() + '000000';
            const url = `${CAMPAIGN_DETAIL_URL(slug)}?reid=${timestamp}`;

            console.log(`Migros: Fetching products for ${slug} (Attempt ${attempt})...`);

            await delay(1000);

            const headers = {
                ...DEFAULT_HEADERS,
                'Referer': 'https://www.migros.com.tr/kampanyalar',
                'Origin': 'https://www.migros.com.tr',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'X-Pwa-Device-Uuid': 'device-uuid-fixed-for-testing',
                'Cookie': cachedCookies || ''
            };

            const response = await fetch(url, { headers });

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                throw new Error(`Migros: Received HTML instead of JSON (Status: ${response.status})`);
            }

            if (!response.ok) throw new Error(`Migros: Product fetch failed: ${response.status}`);

            const json = await response.json();
            return parseProducts(json);

        } catch (error) {
            console.error(`Migros: Error fetching products for ${slug} (Attempt ${attempt}):`, error);
            if (attempt === maxRetries) return [];
            await delay(2000);
        }
    }
    return [];
};

// Yardımcı Fonksiyon: Ürün Verisini Ayrıştırma (Aynı kaldı)
const parseProducts = (apiResponse) => {
    const products = [];
    let rawProducts = [];

    if (apiResponse.data?.searchInfo?.storeProductInfos) {
        rawProducts = apiResponse.data.searchInfo.storeProductInfos;
    } else if (apiResponse.searchInfo?.storeProductInfos) {
        rawProducts = apiResponse.searchInfo.storeProductInfos;
    } else if (Array.isArray(apiResponse)) {
        rawProducts = apiResponse;
    }

    rawProducts.forEach(item => {
        try {
            const product = {
                name: item.name,
                price: item.shownPrice ? (item.shownPrice / 100).toFixed(2) : "0.00",
                regularPrice: item.regularPrice ? (item.regularPrice / 100).toFixed(2) : null,
                discountRate: item.discountRate,
                imageUrl: item.images?.[0]?.urls?.PRODUCT_DETAIL || null,
                prettyName: item.prettyName,
                maxAmount: item.maxAmount,
                unit: item.unit,
                id: item.id || String(Math.random()),
                campaignText: item.discountRate ? `%${item.discountRate} İndirim` : ''
            };
            products.push(product);
        } catch (parseError) {
            console.warn('Migros: Error parsing product item:', parseError);
        }
    });

    return products;
};


/**
 * ⚡️ ANA FONKSİYON: Tüm kampanyaları ve ürünlerini çeker.
 */
export const runMigrosScraper = async () => {
    console.log('Starting Migros Scraper...');

    const campaigns = await fetchCampaigns();

    let allProducts = [];
    let campaignDetails = [];

    for (const campaign of campaigns) {
        if (!campaign.slug) continue;

        const products = await fetchCampaignProducts(campaign.slug);

        if (products && products.length > 0) {
            const detail = {
                ...campaign,
                products: products,
                productCount: products.length,
            };
            campaignDetails.push(detail);

            allProducts = allProducts.concat(products.map(p => ({
                ...p,
                campaignSlug: campaign.slug,
                market: 'Migros'
            })));
        }
    }

    return {
        marketName: 'Migros',
        fullData: {
            migros_campaigns: campaignDetails,
            migros_products: allProducts,
        },
        totalProducts: allProducts.length,
        totalCampaigns: campaignDetails.length
    };
};