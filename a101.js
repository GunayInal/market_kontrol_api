// Gerekli kütüphaneleri içeri aktar
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.a101.com.tr';
const URL_MAIN = BASE_URL + '/';
const API_BASE_URL = 'https://rio.a101.com.tr/dbmk89vnr/CALL/Store/search/VS032';
const ITEMS_PER_PAGE = 60; // API'dan çekilen varsayılan ürün adedi

// User-Agent başlığını tanımlıyoruz (403 hatasını önlemek için)
const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
};

// ======================================================================
// BÖLÜM 1: YAN KAYDIRICI KAMPANYALARINI ÇEKME (AYNI)
// ======================================================================
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
            // Link düzeltmesi
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

// ... [BÖLÜM 2 ve BÖLÜM 3 aynı kalır] ...

// ======================================================================
// BÖLÜM 2: BROŞÜR KAMPANYALARINI ÇEKME (AYNI)
// ======================================================================
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

// ======================================================================
// BÖLÜM 3: TEK BİR BROŞÜRÜN SAYFALARINI ÇEKME (AYNI)
// ======================================================================
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

// ======================================================================
// ======================================================================
// BÖLÜM 4: KAMPANYA KODU VE TOPLAM ÜRÜN SAYISINI ÇEKME (NİHAİ)
// ======================================================================
async function getCampaignApiBase(campaignLink) {
    // --- YENİ EKLENEN KONTROL: LİSTE SAYFALARINI ATLA ---
    if (campaignLink.includes('/liste/')) {
        return { 
            promotionCode: null, 
            totalItems: 0, 
            error: "Bu kampanya linki API yerine doğrudan HTML ile ürün listesi gösteriyor (liste/ yapısı)." 
        };
    }
    // --------------------------------------------------

    let promotionCode = null;
    let totalItems = 0;
    let error = null;

    try {
        const { data } = await axios.get(campaignLink, config);
        const $ = cheerio.load(data);

        // --- 1. AŞAMA: ÖZEL DURUM KURALI (Hardcode edilen kodlar) ---
        // Bu, genel yakalama mekanizmalarımızın (Regex/Linkten çekme) başarısız olduğu kritik kodlardır.
        if (campaignLink.includes('/haftanin-yildizlari')) {
            promotionCode = 'Z100';
        } else if (campaignLink.includes('/10tl-ve-uzeri-alisverislerinizde-indirimli-urunler')) {
            promotionCode = 'Z010';
        } else if (campaignLink.includes('/cok-al-az-ode')) {
            promotionCode = 'ZP01';
        } else if (campaignLink.includes('/aldin-aldin')) {
            // KESİNLEŞEN KURAL
            promotionCode = 'Z110'; 
        }

        // --- 2. AŞAMA: Linkten doğrudan kodu çekmeyi dene (Örn: S6022) ---
        if (!promotionCode) {
            const linkCodeMatch = campaignLink.match(/-(S|Z|C)[0-9]{3,4}$/i);
            if (linkCodeMatch) {
                promotionCode = linkCodeMatch[0].substring(1).toUpperCase(); 
            }
        }

        // --- 3. AŞAMA: Toplam Ürün Sayısını Çekme (totalItems'ı 0'dan kurtarmak için) ---
        const pageText = $('body').text();
        const totalItemsMatch = pageText.match(/(\d{1,4})\s+ürün listeleniyor/);

        if (totalItemsMatch && totalItemsMatch[1]) {
            totalItems = parseInt(totalItemsMatch[1], 10);
        } else {
             // totalItems'ı çekemesek bile, BÖLÜM 5'teki garantili 7 sayfa mantığı çalıştığı için bu değerin önemi azdır.
             totalItems = 0; // Veya bir önceki denememizdeki gibi 60
        }

        // ... (Kalan kod, hata kontrolleri aynı kalır) ...

    } catch (e) {
        error = `Veri çekme sırasında hata oluştu: ${e.message}`;
    }

    if (!promotionCode) {
        error = error || "Geçerli 'promotionCode' bulunamadı.";
        return { promotionCode: null, totalItems: 0, error: error };
    }

    return { promotionCode: promotionCode, totalItems: totalItems, error: null };
}
// ======================================================================
// ======================================================================
// BÖLÜM 5: TÜM API URL ZİNCİRİNİ OLUŞTURMA (7 SAYFA GARANTİLİ NİHAİ)
// ======================================================================
async function generateAllApiUrls(promotionCode, totalItems) {
    const apiUrls = [];
    let currentFrom = 0;

    // Güvenliği sağlamak için 7 sayfa (7 * 60 = 420 ürün) varsayıyoruz.
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

    // totalItems bilgisini artık kullanmadığımız için, bu değeri URL oluşturma mantığından kaldırıyoruz.
    // Ancak BÖLÜM 4'te çekilen bilgiyi çıktıya eklemeye devam edebiliriz.

    return apiUrls;
}

// ... (Diğer tüm kodlar, BÖLÜM 1-5 aynı kalır) ...

// ... (BÖLÜM 1, 2, 3, 4, 5 aynı kalır) ...

// ... (BÖLÜM 1, 2, 3, 4, 5 aynı kalır) ...

// ======================================================================
// BÖLÜM 6: LİSTE SAYFALARINDAN ÜRÜN ÇEKME (YÖNLENDİRME KONTROLLÜ)
// ======================================================================
async function scrapePaginatedHtmlProducts(campaignLink) {
    const allProducts = [];
    const productSelector = '.product-container'; 
    let page = 1;
    const MAX_PAGES = 30; 

    // Axios yapılandırmasını kopyalayıp yönlendirmeyi kapatıyoruz
    const redirectConfig = { 
        ...config,
        maxRedirects: 0 // Yönlendirmeleri otomatik takip etme
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
            // Yönlendirmeleri engellediğimiz için bu kısım başarılı olursa ürün vardır.
            const { data } = await axios.get(url, redirectConfig); 
            const $ = cheerio.load(data);

            const $products = $(productSelector);
            productsOnPage = $products.length;

            if (productsOnPage === 0) {
                // Kritik Durdurma Koşulu: Yönlendirme olmasa bile ürün yoksa dur
                console.log(`   -> Sayfa ${page} çekildi: 0 ürün bulundu. Çekme işlemi sonlandırıldı.`);
                break;
            }

            // Ürünleri işleme ve ana listeye ekleme
            $products.each((index, el) => {
                // Ürün verilerini çekme mantığı (Aynı kalır)
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
            page++; // Bir sonraki sayfaya geç

        } catch (error) {
            // Hata Kontrolü
            if (error.response && (error.response.status === 302 || error.response.status === 301)) {
                // **KRİTİK DURMA KOŞULU:** 301/302 (Yönlendirme) hatası aldık. Bu, sayfanın sonuna ulaştığımız anlamına gelir.
                 console.log(`   -> Sayfa ${page} yönlendirme (Redirect) hatası aldı (${error.response.status}). Ürünler tükenmiş/sayfa mevcut değil. Çekme işlemi sonlandırıldı.`);
            } else if (error.response && error.response.status === 404) {
                 console.log(`   -> HTTP 404 hatası alındı. Sayfa ${page} mevcut değil. Çekme işlemi sonlandırıldı.`);
            } else {
                 // Diğer beklenmedik hatalar
                 console.log(`   -> Sayfa ${page} çekilirken beklenmedik bir hata oluştu. Sonlandırılıyor. Hata: ${error.message}`);
                 return { products: allProducts, error: `Beklenmedik Hata: ${error.message}` };
            }
            break; 
        }
    }

    console.log(`-> HTML Sayfalama Tamamlandı. Toplam ${allProducts.length} ürün çekildi.`);
    return { products: allProducts, error: null };
}

// ======================================================================
// ANA ÇALIŞTIRMA FONKSİYONU (SON FİNAL VERSİYONU)
// ======================================================================
async function main() {
    console.log(`Veriler ana sayfadan çekiliyor: ${URL_MAIN}`);

    try {
        const { data } = await axios.get(URL_MAIN, config);
        const $ = cheerio.load(data);

        const sideCampaigns = await getFilteredCampaigns($);
        let brochureCampaigns = await getBrochureCampaigns($);

        // Broşür Sayfalarını Çekme
        for (let i = 0; i < brochureCampaigns.length; i++) {
            const brochurePages = await getBrochurePages(brochureCampaigns[i].link);
            brochureCampaigns[i].pages = brochurePages;
        }

        // Tüm Yan Kampanyalar İçin API VEYA HTML Sayfalama Yöntemini Kullanma
        for (const campaign of sideCampaigns) {

            if (campaign.link.includes('/liste/')) {
                // HTML SAYFALAMALI KAMPANYALAR (/liste/ yapısı)
                console.log(`\n-- Kampanya (HTML): ${campaign.link}`);
                const htmlProductsResult = await scrapePaginatedHtmlProducts(campaign.link);
                campaign.product_type = 'HTML_PAGINATION';
                campaign.products = htmlProductsResult.products;
                campaign.html_error = htmlProductsResult.error;

            } else {
                // API PAGINATION KAMPANYALARI (/kapida/ yapısı)
                console.log(`\n-- Kampanya (API): ${campaign.link}`);
                const apiBaseResult = await getCampaignApiBase(campaign.link);
                campaign.product_type = 'API_PAGINATION';

                if (apiBaseResult.error) {
                    campaign.api_urls = [];
                    campaign.api_error = apiBaseResult.error;
                } else {
                    const apiUrls = await generateAllApiUrls(apiBaseResult.promotionCode, apiBaseResult.totalItems);
                    campaign.api_urls = apiUrls;
                    campaign.promotion_code = apiBaseResult.promotionCode;
                }
            }
        }

        // --- NİHAİ JSON AYRIŞTIRMA VE KAYDETME BÖLÜMÜ (YENİ) ---

        const apiCampaigns = sideCampaigns.filter(c => c.product_type === 'API_PAGINATION');
        const htmlCampaigns = sideCampaigns.filter(c => c.product_type === 'HTML_PAGINATION');

        const allData = {
            last_updated: new Date().toISOString(),
            api_campaigns: apiCampaigns,
            html_campaigns: htmlCampaigns,
            brochures: brochureCampaigns
        };

        const filesToSave = [
            { name: 'api_kampanyalar.json', data: { last_updated: allData.last_updated, campaigns: apiCampaigns } },
            { name: 'html_kampanyalar.json', data: { last_updated: allData.last_updated, campaigns: htmlCampaigns } },
            { name: 'broşürler.json', data: { last_updated: allData.last_updated, brochures: brochureCampaigns } },
            { name: 'a101_tum_veriler.json', data: allData } // Genel çıktı da kalsın
        ];

        try {
            const fs = await import('fs/promises');
            for (const file of filesToSave) {
                const jsonOutput = JSON.stringify(file.data, null, 2);
                await fs.writeFile(file.name, jsonOutput);
                console.log(`\n✅ Nihai JSON verisi "${file.name}" dosyasına kaydedildi.`);
            }
        } catch (fileError) {
             console.error('\n⚠️ JSON dosyasına yazma hatası:', fileError.message);
        }

        console.log('\n======================================================');
        console.log('## 💾 İŞLEM TAMAMLANDI: ÖZET ÇIKTI');
        console.log('======================================================');
        console.log(`API Kampanyaları: ${apiCampaigns.length} adet`);
        console.log(`HTML Kampanyaları: ${htmlCampaigns.length} adet`);
        console.log(`Broşürler: ${brochureCampaigns.length} adet`);
        console.log('\n✅ Tüm veriler ayrı ayrı JSON dosyalarına başarılı bir şekilde kaydedildi.');

    } catch (error) {
        console.error('Genel veri çekme hatası (Ana Sayfa):', error.message);
    }
}

export { main as runA101Scraper };




