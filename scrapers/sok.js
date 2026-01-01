import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

const SOK_API_BASE = 'https://www.sokmarket.com.tr/api/v1';
const SITE_BASE = 'https://www.sokmarket.com.tr';

// TOR yerel ağda 9050 portunda bekler.
const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');

/**
 * Axios Instance: Tüm istekler TOR üzerinden akar
 */
const sokClient = axios.create({
    httpsAgent: agent,
    httpAgent: agent,
    timeout: 15000,
    headers: {

    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'X-Platform': 'WEB',
    'X-Service-Type': 'MARKET',
    'Referer': 'https://www.sokmarket.com.tr/',
    'Origin': 'https://www.sokmarket.com.tr'

    }
});

export async function runSokScraper() {
    console.log("🚀 ŞOK Scraper (TOR + Axios) başlatılıyor...");
    
    try {
        // 1. Kampanya Kategorilerini Çek
        const catRes = await sokClient.get(`${SOK_API_BASE}/cms/categories`);
        const catData = catRes.data;
        const campaigns = catData.content || (Array.isArray(catData) ? catData : []);
        
        if (campaigns.length === 0) throw new Error("Kampanya listesi boş döndü.");

        const results = [];
        const camp = campaigns[0]; // Kredi/Zaman tasarrufu için ilk kampanya
        const parsedId = parseIdFromUrl(camp.url);

        if (parsedId) {
            console.log(`   📂 Kategori çekiliyor: "${camp.title}"`);
            const prodUrl = `${SOK_API_BASE}/search?sort=SCORE_DESC&${parsedId.type}=${parsedId.id}&page=0&size=20`;
            
            const prodRes = await sokClient.get(prodUrl);
            const prodData = prodRes.data;

            const rawProducts = prodData.results || [];
            const products = rawProducts.map(item => ({
                id: item.product?.id,
                name: item.product?.name,
                price: item.prices?.discounted?.value || 0,
                regular_price: item.prices?.original?.value || 0,
                image_url: item.product?.images?.[0] ? `${item.product.images[0].host}/${item.product.images[0].path}` : null,
                url: item.product?.path ? `${SITE_BASE}/${item.product.path}` : null
            })).filter(p => p.id);

            results.push({
                id: parsedId.id,
                title: camp.title,
                products: products
            });

            console.log(`   ✅ ${products.length} ürün TOR üzerinden başarıyla çekildi.`);
        }

        return {
            success: true,
            marketName: 'ŞOK',
            fullData: { sok_campaigns: results }
        };

    } catch (error) {
        console.error("❌ Scraper Hatası:", error.response ? `HTTP ${error.response.status}` : error.message);
        return { success: false, error: error.message, fullData: { sok_campaigns: [] } };
    }
}

function parseIdFromUrl(url) {
    if (!url) return null;
    const pgrp = url.match(/-pgrp-([a-f0-9-]+)$/);
    if (pgrp) return { type: 'pgrp', id: pgrp[1] };
    const sgrp = url.match(/-sgrp-(\d+)$/);
    if (sgrp) return { type: 'sgrp', id: sgrp[1] };
    const cat = url.match(/-c-(\d+)$/);
    if (cat) return { type: 'category', id: cat[1] };
    return null;
}
