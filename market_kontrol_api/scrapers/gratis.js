// gratis.js - Nihai Modül (ESM Yapısı)

// Gerekli Kütüphaneleri İçe Aktar (ESM import)
import axios from 'axios';
import * as cheerio from 'cheerio';
//import fs from 'fs/promises';
import https from 'https'; 

// Sabitler
const URL_GRATIS_MAIN = 'https://www.gratis.com/';
const BASE_URL = 'https://www.gratis.com';
const MAX_PAGES_PER_CAMPAIGN = 3; // Çekilecek maksimum sayfa sayısı sabitini ekledik

// Axios yapılandırması
const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    // SSL/TLS hatalarını (örneğin sertifika uyarılarını) görmezden gelmek için
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
};

// ======================================================================
// BÖLÜM 1: GÖMÜLÜ JSON VERİSİNİ ÇEKME (Campaigns)
// ======================================================================

async function scrapeGratisCampaigns() {
    console.log(`\nGratis Kampanyaları çekiliyor: ${URL_GRATIS_MAIN}`);

    try {
        const { data } = await axios.get(URL_GRATIS_MAIN, config);
        const $ = cheerio.load(data);
        let campaignData = [];

        // Next.js ana veri bloğunu bulma
        const nextDataScript = $('script').filter((i, el) => {
            return $(el).html() && $(el).html().includes('self.__next_f.push') && $(el).html().includes('homepageBanners');
        }).html();

        if (!nextDataScript) {
            console.log("   ❌ Next.js ana veri bloğu bulunamadı.");
            return [];
        }

        // Script içindeki veri string'ini ayıklama
        const dataStringMatch = nextDataScript.match(/self\.__next_f\.push\(\[\d,["'](.*)["']\]\)/s);

        if (dataStringMatch && dataStringMatch[1]) {
            let jsonPart = dataStringMatch[1];

            // "homepageBanners" JSON Dizisini Çözümleme
            const campaignsMatch = jsonPart.match(/\\"homepageBanners\\":\[([\s\S]*?)\]/); 

            if (campaignsMatch && campaignsMatch[0]) {
                jsonPart = campaignsMatch[0];

                // Kaçış karakterlerini düzeltme
                jsonPart = jsonPart.replace(/\\"/g, '"');
                jsonPart = jsonPart.replace(/\\u0026/g, '&');

                try {
                    const validJsonString = '{' + jsonPart + '}';
                    const fullObject = JSON.parse(validJsonString);

                    if (fullObject.homepageBanners && fullObject.homepageBanners.length > 0) {
                        campaignData = fullObject.homepageBanners;
                        console.log(`   ✅ "homepageBanners" JSON Dizisi başarıyla çözümlendi.`);
                    }
                } catch (e) {
                     console.warn(`   ⚠️ JSON ayrıştırma başarısız oldu. Hata: ${e.message}`); 
                }
            }
        }

        // Veriyi standart formata dönüştürme ve aktif olanları filtreleme
        const cleanedCampaigns = campaignData.map((item, index) => {
            if (item.active && item.title && item.imageUrl) {
                const fullUrl = item.url.startsWith('http') ? item.url : BASE_URL + item.url;

                return {
                    campaign_id: item.id || index + 1,
                    title: item.title,
                    subtitle: item.description || null,
                    link: fullUrl,
                    image_url: item.imageUrl,
                    // Diğer alanlar...
                };
            }
            return null;
        }).filter(item => item !== null);

        console.log(`   -> Toplam ${cleanedCampaigns.length} aktif kampanya kartı çekildi.`);
        return cleanedCampaigns;

    } catch (error) {
        console.error('Gratis Kampanya çekilirken kritik hata oluştu:', error.message);
        return [];
    }
}

// ======================================================================
// BÖLÜM 2: ÜRÜN ÇEKME (Products)
// ======================================================================

async function scrapeProductsFromCampaign(campaignUrl, pageNumber = 1) {
    const url = `${campaignUrl}?page=${pageNumber}`;

    try {
        const { data } = await axios.get(url, config);
        const $ = cheerio.load(data);
        const productList = [];

        // Ürün kartı seçicisi (HTML tabanlı)
        const productSelectors = 'div.relative.flex.flex-col.justify-between.border.rounded-xl.w-full.h-full';

        $(productSelectors).each((i, el) => {
            const productElement = $(el);

            // Veri çekme mantığı (link, başlık, fiyatlar)
            const relativeUrl = productElement.find('a').first().attr('href');
            const fullUrl = relativeUrl ? BASE_URL + relativeUrl : null;
            const title = productElement.find('h5.line-clamp-2').text().trim();
            const imageUrl = productElement.find('img').first().attr('src');
            const originalPriceText = productElement.find('div.h-5 > div.text-sm').text().trim();
            const discountedPriceText = productElement.find('div.bg-primary-50 span.text-primary-850').text().trim();

            if (fullUrl && title && discountedPriceText) {
                productList.push({
                    title: title,
                    product_url: fullUrl,
                    image_url: imageUrl,
                    original_price: originalPriceText,
                    discounted_price: discountedPriceText,
                    page_number: pageNumber
                });
            }
        });

        return productList;

    } catch (error) {
        // Hata durumunda boş liste döndür
        return [];
    }
}

// ======================================================================
// BÖLÜM 3: TÜM KAMPANYALARI GEZME
// ======================================================================

async function scrapeAllCampaignProducts(campaigns) {
    const allProductsData = {};
    let totalProductCount = 0;

    console.log(`\n--- TÜM KAMPANYALARDAN ÜRÜN ÇEKİMİ BAŞLIYOR (İlk ${MAX_PAGES_PER_CAMPAIGN} sayfa) ---`);

    for (const campaign of campaigns) {
        if (!campaign.link) continue;

        console.log(`\n📦 Kampanya Başlıyor: [${campaign.title}]`);
        const campaignProducts = [];

        for (let page = 1; page <= MAX_PAGES_PER_CAMPAIGN; page++) {
            const products = await scrapeProductsFromCampaign(campaign.link, page);

            if (products.length === 0) {
                console.log(`   [INFO] Sayfa ${page} boş geldi. Bu kampanya için çekim sonlandırılıyor.`);
                break;
            }

            campaignProducts.push(...products);
        }

        allProductsData[campaign.campaign_id] = {
            campaign_title: campaign.title,
            product_count: campaignProducts.length,
            products: campaignProducts
        };
        totalProductCount += campaignProducts.length;
        console.log(`   ✅ Kampanya ${campaign.title} için ${campaignProducts.length} ürün çekildi.`);
    }

    console.log(`\n✅ TÜM KAMPANYA ÜRÜNLERİ ÇEKİMİ TAMAMLANDI. Toplam Ürün: ${totalProductCount}`);
    return allProductsData;
}

// ======================================================================
// BÖLÜM 4: ANA ÇALIŞTIRMA FONKSİYONU (main)
// ======================================================================

async function main() {
    const campaigns = await scrapeGratisCampaigns();

    // 1. ADIM: Tüm kampanyalardan ürünleri çek
    const allProductsByCampaign = await scrapeAllCampaignProducts(campaigns);

    const finalDataStructure = {
        last_updated: new Date().toISOString(),
        gratis_campaigns: campaigns,
        gratis_products_by_campaign: allProductsByCampaign 
    };

    // Konsol özeti
    const totalProducts = Object.values(allProductsByCampaign).reduce((sum, campaign) => sum + campaign.product_count, 0);

        console.log('\n======================================================');
        console.log('## 💾 İŞLEM TAMAMLANDI: GRATIS ÖZET');
        console.log('======================================================');
        console.log(`Toplam Kampanya Kartı Sayısı: ${campaigns.length}`);
        console.log(`Toplam Çekilen Ürün Sayısı: ${totalProducts}`);
        console.log('\n✅ Gratis İşlemi Tamamlandı (Veri Döndürüldü).');

        // Artık sadece nihai veriyi döndürüyoruz.
        return { 
            campaigns: finalDataStructure.gratis_campaigns, 
            products: finalDataStructure.gratis_products_by_campaign, 
            totalProducts, 
            fullData: finalDataStructure // Tüm yapıyı döndür
        };
    }
export { main as runGratisScraper };