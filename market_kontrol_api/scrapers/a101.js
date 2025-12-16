// A101.js - API Düzeltilmiş FINAL Versiyon

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.a101.com.tr';
const URL_MAIN = BASE_URL + '/';
const API_BASE_URL = 'https://rio.a101.com.tr/dbmk89vnr/CALL/Store/search/VS032';
const ITEMS_PER_PAGE = 60; 

const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.a101.com.tr/'
    }
};

const apiConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.a101.com.tr/',
        'Origin': 'https://www.a101.com.tr',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    }
};

async function getFilteredCampaigns($) {
    const campaignData = [];
    const specificWidthSelector = 
        '.swiper-slide[class*="w-\\[165px\\]"] > a:not([rel="bookmark"]), ' +
        '.swiper-slide[class*="w-\\[154px\\]"] > a:not([rel="bookmark"])';

    $(specificWidthSelector).each((index, element) => {
        const link = $(element).attr('href');
        const imageElement = $(element).find('img');
        const imageSrc = imageElement.attr('src');

        if (link && imageSrc) {
            const fullLink = link.startsWith('http') ? link : BASE_URL + link;
            if (!campaignData.some(item => item.link === fullLink)) {
                 campaignData.push({ 
                    link: fullLink, 
                    image_url: imageSrc,
                    type: "SIDE_SLIDER"
                });
            }
        }
    });
    return campaignData;
}

async function getBrochureCampaigns($) {
    const brochureData = [];
    const selector = 'a.flex.cursor-pointer.flex-1'; 

    $(selector).each((index, element) => {
        const link = $(element).attr('href');
        const imageElement = $(element).find('picture img');
        const imageSrc = imageElement.attr('src');

        if (link && imageSrc) {
            const fullLink = link.startsWith('http') ? link : BASE_URL + link;
            const titleElement = $(element).find('span.line-clamp-2');
            const title = titleElement.text().trim();

            if (!brochureData.some(item => item.link === fullLink)) {
                brochureData.push({
                    id: index + 1,
                    title: title,
                    main_image_url: imageSrc,
                    link: fullLink,
                    pages: []
                });
            }
        }
    });
    return brochureData;
}

async function getBrochurePages(brochureLink) {
    try {
        const { data } = await axios.get(brochureLink, config);
        const $ = cheerio.load(data);
        const pageImages = [];
        const imageSelectors = $('.img-mapper-img'); 

        imageSelectors.each((index, element) => {
            const src = $(element).attr('src');
            if (src && !pageImages.some(page => page.image_url === src)) {
                pageImages.push({
                    page_number: pageImages.length + 1,
                    image_url: src
                });
            }
        });
        return pageImages;
    } catch (error) {
        return []; 
    }
}

async function getCampaignApiBase(campaignLink) {
    if (campaignLink.includes('/liste/')) {
        return { 
            promotionCode: null, 
            totalItems: 0, 
            error: "Bu kampanya linki API yerine doğrudan HTML ile ürün listesi gösteriyor (liste/ yapısı)." 
        };
    }

    let promotionCode = null;
    let totalItems = 0;
    let error = null;

    try {
        const { data } = await axios.get(campaignLink, config);
        const $ = cheerio.load(data);

        if (campaignLink.includes('/haftanin-yildizlari')) {
            promotionCode = 'Z100';
        } else if (campaignLink.includes('/10tl-ve-uzeri-alisverislerinizde-indirimli-urunler')) {
            promotionCode = 'Z010';
        } else if (campaignLink.includes('/cok-al-az-ode')) {
            promotionCode = 'ZP01';
        } else if (campaignLink.includes('/aldin-aldin')) {
            promotionCode = 'Z110'; 
        }

        if (!promotionCode) {
            const linkCodeMatch = campaignLink.match(/-(S|Z|C)[0-9]{3,4}$/i);
            if (linkCodeMatch) {
                promotionCode = linkCodeMatch[0].substring(1).toUpperCase(); 
            }
        }

        const pageText = $('body').text();
        const totalItemsMatch = pageText.match(/(\d{1,4})\s+ürün listeleniyor/);

        if (totalItemsMatch && totalItemsMatch[1]) {
            totalItems = parseInt(totalItemsMatch[1], 10);
        } else {
            totalItems = 0;
        }

    } catch (e) {
        error = `Veri çekme sırasında hata oluştu: ${e.message}`;
    }

    if (!promotionCode) {
        error = error || "Geçerli 'promotionCode' bulunamadı.";
        return { promotionCode: null, totalItems: 0, error: error };
    }

    return { promotionCode: promotionCode, totalItems: totalItems, error: null };
}

async function generateAllApiUrls(promotionCode, totalItems) {
    const apiUrls = [];
    let currentFrom = 0;
    const MAX_PAGES = 7; 
    const MAX_ITEMS_TO_FETCH = MAX_PAGES * ITEMS_PER_PAGE; 

    while (currentFrom < MAX_ITEMS_TO_FETCH) {
        const apiPayload = {
            channel: "SLOT",
            filters: [{ field: "promotionCode", value: promotionCode }],
            from: currentFrom,
            limit: ITEMS_PER_PAGE
        };

        const base64Data = Buffer.from(JSON.stringify(apiPayload)).toString('base64');
        const apiUrl = `${API_BASE_URL}?__culture=tr-TR&__platform=web&data=${encodeURIComponent(base64Data)}&__isbase64=true`;

        apiUrls.push(apiUrl);
        currentFrom += ITEMS_PER_PAGE;
    }

    return apiUrls;
}

async function scrapePaginatedHtmlProducts(campaignLink) {
    const allProducts = [];
    const productSelector = '.product-container'; 
    let page = 1;
    const MAX_PAGES = 30; 

    const redirectConfig = { 
        ...config,
        maxRedirects: 0
    };

    console.log(`-> HTML Sayfalama Başlatıldı: ${campaignLink}`);

    while (true) {
        if (page > MAX_PAGES) {
            console.log(`   -> Maksimum sayfa sınırı (${MAX_PAGES}) aşıldı. Çekme işlemi durduruldu.`);
            break;
        }

        const url = `${campaignLink}?page=${page}`;
        let productsOnPage = 0;

        try {
            const { data } = await axios.get(url, redirectConfig); 
            const $ = cheerio.load(data);
            const $products = $(productSelector);
            productsOnPage = $products.length;

            if (productsOnPage === 0) {
                console.log(`   -> Sayfa ${page} çekildi: 0 ürün bulundu. Çekme işlemi sonlandırıldı.`);
                break;
            }

            $products.each((index, el) => {
                const $product = $(el);
                const $linkElement = $product.find('a[rel="bookmark"]');
                const link = $linkElement.attr('href') ? BASE_URL + $linkElement.attr('href') : null;
                const productIdMatch = link ? link.match(/_p-(\d+)$/) : null;
                const productId = productIdMatch ? productIdMatch[1] : null;

                const title = $product.find('h3').attr('title');
                const priceText = $product.find('section span.text-\\[\\#EA242A\\]').text().trim();
                const price = priceText.replace('₺', '').replace('.', '').replace(',', '.');
                const $imageElement = $product.find('.aspect-square img:first');
                const imageUrl = $imageElement.attr('src');
                const isSoldOut = $product.find('.product-add-button button[disabled]').length > 0;
                const stockStatusText = isSoldOut ? 'TÜKENDİ' : 'STOKTA';

                if (link && title) {
                    allProducts.push({
                        product_id: productId,
                        title: title,
                        link: link,
                        image_url: imageUrl,
                        price: parseFloat(price) || 0,
                        stock_status: stockStatusText
                    });
                }
            });

            console.log(`   -> Sayfa ${page} çekildi: ${productsOnPage} ürün bulundu.`);
            page++;

        } catch (error) {
            if (error.response && (error.response.status === 302 || error.response.status === 301 || error.response.status === 308)) { 
                console.log(`  -> Sayfa ${page} yönlendirme (Redirect) hatası aldı (${error.response.status}). Çekme işlemi sonlandırıldı.`);
            } else if (error.response && error.response.status === 404) {
                console.log(`  -> Sayfa ${page} bulunamadı (404). Son sayfaya ulaşıldı.`);
            } else {
                console.error(`  -> Sayfa ${page} çekilirken beklenmedik hata: ${error.message}`);
            }
            break; 
        }
    }

    console.log(`-> HTML Sayfalama Tamamlandı. Toplam ${allProducts.length} ürün çekildi.`);
    return { products: allProducts, error: null };
}

async function scrapeApiProducts(apiUrls) {
    const allProducts = [];
    const MAX_REQUESTS_PER_CAMPAIGN = 200;

    for (let i = 0; i < apiUrls.length && i < MAX_REQUESTS_PER_CAMPAIGN; i++) {
        const url = apiUrls[i];

        try {
            console.log(`   -> API Sayfa ${i + 1} çekiliyor...`);
            const response = await axios.get(url, apiConfig);

            // Veriyi al - farklı yapıları dene
            let products = [];
            if (Array.isArray(response.data)) {
                products = response.data;
            } else if (response.data && response.data.results) {
                products = response.data.results;
            } else if (response.data && response.data.items) {
                products = response.data.items;
            } else if (response.data && response.data.data) {
                products = response.data.data;
            } else if (response.data && response.data.Payload) {
                products = response.data.Payload;
            }

            if (!products || products.length === 0) {
                console.log(`   -> API Sayfa ${i + 1} boş geldi. Çekme işlemi sonlandırılıyor.`);
                break;
            }

            const productsOnPage = products.map(item => {
                const productId = item.id;
                const attributes = item.attributes || {};
                const price = item.price || {};
                const promotion = item.promotion || {};
                const alternativePromotion = item.alternativePromotion || null;
                const campaigns = item.campaigns || [];

                // Fiyat bilgileri (kuruş cinsinden, TL'ye çevir)
                const normalPrice = price.normal ? price.normal / 100 : 0;
                const discountedPrice = price.discounted ? price.discounted / 100 : 0;

                // Promosyon fiyatları (varsa)
                const promotionPrice = promotion.price ? promotion.price / 100 : null;
                const promotionDiscountedPrice = promotion.discountedPrice ? promotion.discountedPrice / 100 : null;

                // Gerçek satış fiyatı: önce promosyon fiyatına bak, yoksa normal fiyat
                const finalPrice = promotionDiscountedPrice || discountedPrice || normalPrice;

                // İndirim hesaplama
                const originalPrice = promotionPrice || normalPrice;
                const discount = originalPrice && finalPrice < originalPrice 
                    ? Math.round(((originalPrice - finalPrice) / originalPrice) * 100) 
                    : 0;

                // Stok durumu
                const stockStatus = item.stock > 0 ? 'STOKTA' : 'TÜKENDİ';

                // Resim URL
                const productImages = item.images ? item.images.filter(img => img.imageType === 'product') : [];
                const imageUrl = productImages.length > 0 ? productImages[0].url : '';

                // Badge'ler (etiketler) - Yerli Üretim, %20 İndirim vb.
                const badges = item.images ? item.images.filter(img => img.imageType === 'badge') : [];

                // Promosyon objesi oluştur
                const buildPromotionObject = (promo) => {
                    if (!promo || !promo.code) return null;

                    const promoPrice = promo.price ? promo.price / 100 : null;
                    const promoDiscounted = promo.discountedPrice ? promo.discountedPrice / 100 : null;
                    const promoProfit = promo.profit ? promo.profit / 100 : null;

                    // "Çok Al Az Öde" için birim fiyat hesapla
                    const unitPrice = promo.qty && promoDiscounted 
                        ? (promoDiscounted / promo.qty).toFixed(2) 
                        : null;

                    return {
                        code: promo.code,
                        name: promo.name,
                        type: promo.type,                    // "multiplePriced" veya "singlePriced"
                        badge_type: promo.badgeType,
                        badge_id: promo.badgeId,
                        quantity: promo.qty,                 // 6 adet al
                        price_for_quantity: promoDiscounted, // 6 adet için 45 TL
                        unit_price: unitPrice,               // Adet başı 7.50 TL
                        original_price: promoPrice,          // Normal 6 adet 49.50 TL
                        savings: promoProfit,                // 4.50 TL kazanç
                        badge_url: promo.badgeURL,
                        image_url: promo.imageURL,
                        start_date: promo.startDate ? new Date(promo.startDate).toISOString() : null,
                        end_date: promo.endDate ? new Date(promo.endDate).toISOString() : null
                    };
                };

                return {
                    product_id: productId,
                    title: attributes.name || 'İsimsiz Ürün',
                    brand: attributes.brand || null,
                    link: attributes.seoUrl || BASE_URL,

                    // Tüm ürün görselleri
                    images: {
                        main: imageUrl,
                        all_product_images: productImages.map(img => ({
                            id: img.id,
                            url: img.url
                        }))
                    },

                    // Fiyat bilgileri
                    price: {
                        final: finalPrice,
                        original: originalPrice,
                        discount_percentage: discount,
                        normal_str: price.normalStr || null,
                        discounted_str: price.discountedStr || null
                    },

                    // Ana promosyon (ilk seçenek)
                    promotion: buildPromotionObject(promotion),

                    // Alternatif promosyon (örn: 6 al yerine 20 al)
                    alternative_promotion: buildPromotionObject(alternativePromotion),

                    // Kampanya açıklamaları
                    campaigns: campaigns.map(camp => ({
                        id: camp.id,
                        name: camp.name,
                        description: camp.description
                    })),

                    // Rozetler/Badge'ler (Yerli Üretim, %20 İndirim vb.)
                    badges: badges.map(badge => ({
                        id: badge.id,
                        url: badge.url,
                        is_external: badge.isExternal || false
                    })),

                    // Ek bilgiler
                    stock_status: stockStatus,
                    stock_amount: item.stock || 0,
                    unit_type: item.unitType || 'QTY',
                    net_weight: attributes.netWeight || null,
                    barcodes: attributes.barcodes || [],
                    return_days: attributes.returnDay || null,
                    is_fragile: attributes.fragileProduct || false
                };
            });

            allProducts.push(...productsOnPage);
            console.log(`   ✅ API Sayfa ${i + 1}: ${productsOnPage.length} ürün eklendi`);

        } catch (error) {
            console.warn(`   ⚠️ API Sayfa ${i + 1} hatası: ${error.message}`);
            if (error.response) {
                console.warn(`   -> Status: ${error.response.status}`);
            }
            break; 
        }
    }
    return { products: allProducts, totalCount: allProducts.length };
}

async function main() {
    console.log(`\n============================================`);
    console.log(`## 🛒 A101 Veri Çekimi Başladı: ${URL_MAIN}`);
    console.log(`============================================`);

    let totalProductCount = 0;

    try {
        const { data } = await axios.get(URL_MAIN, config);
        const $ = cheerio.load(data);

        const sideCampaigns = await getFilteredCampaigns($);
        let brochureCampaigns = await getBrochureCampaigns($);

        for (let i = 0; i < brochureCampaigns.length; i++) {
            const brochurePages = await getBrochurePages(brochureCampaigns[i].link);
            brochureCampaigns[i].pages = brochurePages;
        }

        for (const campaign of sideCampaigns) {
            if (campaign.link.includes('/liste/')) {
                console.log(`\n-- Kampanya (HTML): ${campaign.link}`);
                const htmlProductsResult = await scrapePaginatedHtmlProducts(campaign.link);
                campaign.product_type = 'HTML_PAGINATION';
                campaign.products = htmlProductsResult.products;
                campaign.product_count = htmlProductsResult.products.length;
                campaign.html_error = htmlProductsResult.error;
                totalProductCount += campaign.products.length;

            } else {
                console.log(`\n-- Kampanya (API): ${campaign.link}`);
                const apiBaseResult = await getCampaignApiBase(campaign.link);
                campaign.product_type = 'API_PAGINATION';

                if (apiBaseResult.error) {
                    campaign.api_error = apiBaseResult.error;
                    campaign.api_urls = [];
                    campaign.products = [];
                    campaign.product_count = 0;
                } else {
                    const apiUrls = await generateAllApiUrls(apiBaseResult.promotionCode, apiBaseResult.totalItems);

                    console.log(`   -> Promotion Code: ${apiBaseResult.promotionCode}`);
                    console.log(`   -> İlk API URL: ${apiUrls[0]}`);

                    const apiProductsResult = await scrapeApiProducts(apiUrls);

                    campaign.api_urls = apiUrls;
                    campaign.promotion_code = apiBaseResult.promotionCode;
                    campaign.products = apiProductsResult.products;
                    campaign.product_count = apiProductsResult.totalCount;
                    totalProductCount += apiProductsResult.totalCount;
                }
            }
        }

        const apiCampaigns = sideCampaigns.filter(c => c.product_type === 'API_PAGINATION');
        const htmlCampaigns = sideCampaigns.filter(c => c.product_type === 'HTML_PAGINATION');

        const finalDataStructure = {
            last_updated: new Date().toISOString(),
            a101_side_campaigns_api: apiCampaigns,
            a101_side_campaigns_html: htmlCampaigns,
            a101_brochures: brochureCampaigns
        };

        console.log('\n======================================================');
        console.log('## 💾 İŞLEM TAMAMLANDI: A101 ÖZET');
        console.log('======================================================');
        console.log(`Toplam Yan Kampanya Kartı Sayısı: ${sideCampaigns.length}`);
        console.log(`Toplam Broşür Sayısı: ${brochureCampaigns.length}`);
        console.log(`Toplam Çekilen Ürün Sayısı: ${totalProductCount}`);
        console.log('\n✅ A101 İşlemi Tamamlandı (Veri Döndürüldü).');

        return { 
            totalProducts: totalProductCount, 
            fullData: finalDataStructure 
        };

    } catch (error) {
        console.error('A101 Genel veri çekme hatası (Ana Sayfa):', error.message);
        return { totalProducts: 0, fullData: { error: error.message } };
    }
}

export { main as runA101Scraper };