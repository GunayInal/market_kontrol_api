// scrapers/sok.js

import axios from 'axios';

const API_BASE = 'https://www.sokmarket.com.tr/api/v1';
const SITE_BASE = 'https://www.sokmarket.com.tr';
const MARKET_NAME = 'ŞOK';

const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Referer': 'https://www.sokmarket.com.tr/'
    }
};

/**
 * URL'den kampanya türünü ve ID'sini parse et
 * Örnek: /win-kazandiran-urunler-pgrp-f353cf31... → { type: 'pgrp', id: 'f353cf31...' }
 * Örnek: /haftanin-firsatlari-market-sgrp-146401 → { type: 'sgrp', id: '146401' }
 */
function parseCampaignUrl(url) {
    // pgrp (promotion group) formatı
    const pgrpMatch = url.match(/-pgrp-([a-f0-9-]+)$/);
    if (pgrpMatch) {
        return { type: 'pgrp', id: pgrpMatch[1] };
    }

    // sgrp (sku group) formatı
    const sgrpMatch = url.match(/-sgrp-(\d+)$/);
    if (sgrpMatch) {
        return { type: 'sgrp', id: sgrpMatch[1] };
    }

    // Kategori formatı (c-)
    const categoryMatch = url.match(/-c-(\d+)$/);
    if (categoryMatch) {
        return { type: 'category', id: categoryMatch[1] };
    }

    return null;
}

/**
 * Kampanya ürünlerini sayfalayarak çek
 */
async function fetchCampaignProducts(campaignType, campaignId, campaignTitle) {
    const allProducts = [];
    let page = 0;
    const pageSize = 20;

    console.log(`\n   → "${campaignTitle}" ürünleri çekiliyor...`);

    while (true) {
        try {
            let apiUrl;

            if (campaignType === 'pgrp') {
                apiUrl = `${API_BASE}/search?sort=SCORE_DESC&pgrp=${campaignId}&page=${page}&size=${pageSize}&pgt=PROMOTION_GROUP_LISTING`;
            } else if (campaignType === 'sgrp') {
                apiUrl = `${API_BASE}/search?sort=SCORE_DESC&sgrp=${campaignId}&page=${page}&size=${pageSize}&pgt=SKU_GROUP_LISTING`;
            } else if (campaignType === 'category') {
                apiUrl = `${API_BASE}/search?sort=SCORE_DESC&category=${campaignId}&page=${page}&size=${pageSize}`;
            } else {
                console.warn(`   ⚠️ Bilinmeyen kampanya türü: ${campaignType}`);
                break;
            }

            const { data } = await axios.get(apiUrl, config);

            if (!data.results || data.results.length === 0) {
                console.log(`   ✓ Sayfa ${page + 1}: Ürün yok, döngü sonlandı`);
                break;
            }

            console.log(`   ✓ Sayfa ${page + 1}: ${data.results.length} ürün`);

            // Ürünleri işle
            for (const item of data.results) {
                const product = item.product;
                const prices = item.prices;
                const sku = item.sku;

                // Görsel URL'i oluştur
                const imageUrl = product.images && product.images.length > 0
                    ? `${product.images[0].host}${product.images[0].path}`
                    : null;

                // İndirim yüzdesi hesapla
                const discountPercentage = prices.original.value > prices.discounted.value
                    ? Math.round(((prices.original.value - prices.discounted.value) / prices.original.value) * 100)
                    : 0;

                // Promosyonlar
                const promotions = item.promotions || [];
                const badgePromotions = item.badgePromotions || [];

                allProducts.push({
                    product_id: product.id,
                    sku_id: sku.id,
                    external_sku_id: item.external?.skuId || null,

                    title: product.name,
                    brand: product.brand?.name || null,
                    brand_code: product.brand?.code || null,

                    link: `${SITE_BASE}/${product.path}`,
                    image_url: imageUrl,

                    // Fiyat bilgileri
                    price: {
                        final: prices.discounted.value,
                        original: prices.original.value,
                        discount_percentage: discountPercentage,
                        currency: prices.discounted.currency,
                        final_text: prices.discounted.text,
                        original_text: prices.original.text
                    },

                    // Stok bilgileri
                    has_stock: item.hasStock,
                    stock_unit: product.stockUnit,
                    cart_quantity: {
                        minimum: sku.cartQuantity.minimum,
                        maximum: sku.cartQuantity.maximum,
                        increment: sku.cartQuantity.increment
                    },

                    // Kategori yolu (breadcrumbs)
                    categories: sku.breadCrumbs.map(bc => ({
                        id: bc.id,
                        name: bc.label,
                        path: bc.path
                    })),

                    // Promosyonlar
                    promotions: promotions.map(promo => ({
                        id: promo.id,
                        title: promo.title,
                        path: promo.path
                    })),

                    // Rozet promosyonları ("+7 win Para Kazan" gibi)
                    badge_promotions: badgePromotions.map(badge => ({
                        id: badge.id,
                        title: badge.title,
                        text: badge.text,
                        background_color: badge.backgroundHexadecimalColorCode,
                        text_color: badge.textHexadecimalColorCode
                    })),

                    // Ek bilgiler
                    is_private_label: sku.privateLabel,
                    service_type: item.serviceType
                });
            }

            page++;

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
            console.error(`   ❌ Sayfa ${page + 1} hatası:`, error.message);
            break;
        }
    }

    return allProducts;
}

/**
 * Ana kampanyaları çek
 */
async function getSokCampaigns() {
    try {
        console.log('\n📂 ŞOK Kampanyaları çekiliyor...');

        const { data } = await axios.get(`${API_BASE}/cms/categories`, config);

        if (!data.content || data.content.length === 0) {
            console.warn('⚠️ Kampanya bulunamadı');
            return [];
        }

        console.log(`✅ ${data.content.length} kampanya bulundu`);

        const campaigns = [];

        for (const item of data.content) {
            const parsed = parseCampaignUrl(item.url);

            if (!parsed) {
                console.warn(`   ⚠️ URL parse edilemedi: ${item.url}`);
                continue;
            }

            const imageUrl = item.images && item.images.length > 0
                ? `${item.images[0].host}${item.images[0].path}`
                : null;

            campaigns.push({
                id: parsed.id,
                campaign_type: parsed.type,
                title: item.title,
                link: `${SITE_BASE}${item.url}`,
                image_url: imageUrl,
                order: item.order,
                products: [] // Doldurulacak
            });
        }

        return campaigns;

    } catch (error) {
        console.error('❌ Kampanya çekme hatası:', error.message);
        return [];
    }
}

/**
 * Ana scraper fonksiyonu
 */
export const runSokScraper = async () => {
    console.log(`\n============================================`);
    console.log(`## 🛒 ${MARKET_NAME} Market Veri Çekimi Başladı`);
    console.log(`============================================`);

    let totalProducts = 0;

    try {
        // Kampanyaları çek
        const campaigns = await getSokCampaigns();

        // Her kampanya için ürünleri çek
        for (const campaign of campaigns) {
            const products = await fetchCampaignProducts(
                campaign.campaign_type,
                campaign.id,
                campaign.title
            );

            campaign.products = products;
            campaign.product_count = products.length;
            totalProducts += products.length;

            console.log(`   ✅ "${campaign.title}": ${products.length} ürün`);
        }

        console.log(`\n============================================`);
        console.log(`## 💾 ${MARKET_NAME} ÖZET`);
        console.log(`============================================`);
        console.log(`Toplam Kampanya: ${campaigns.length}`);
        console.log(`Toplam Ürün: ${totalProducts}`);
        console.log(`============================================\n`);

        return {
            marketName: MARKET_NAME,
            fullData: {
                sok_campaigns: campaigns
            },
            totalCampaigns: campaigns.length,
            totalProducts: totalProducts
        };

    } catch (error) {
        console.error(`❌ ${MARKET_NAME} Genel Hata:`, error.message);
        return {
            marketName: MARKET_NAME,
            fullData: { sok_campaigns: [], error: error.message },
            totalCampaigns: 0,
            totalProducts: 0
        };
    }
};