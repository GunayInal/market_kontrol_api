

// BİM.js - Express Uyumlu Final Versiyon

// Gerekli Kütüphaneleri İçe Aktar
import axios from 'axios';
import * as cheerio from 'cheerio';
// import fs from 'fs/promises'; // 🚨 KALDIRILDI - Express sunucusu yazacak
import https from 'https'; 

// Sabitler
const URL_BIM_BROCHURES = 'https://www.bim.com.tr/Categories/680/afisler.aspx';
const URL_BIM_MAIN = 'https://www.bim.com.tr/';
const BASE_URL = 'https://www.bim.com.tr';

// Axios yapılandırması (SSL kontrolü devre dışı bırakıldı)
const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    // Sertifika hatasını çözmek için eklenen kısım (Gerekiyorsa tutulabilir)
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
};

// ======================================================================
// BÖLÜM 1 & 2: TÜM BROŞÜRLERİ VE SAYFALARINI TEK GEÇİŞTE ÇEKME
// ======================================================================
async function scrapeBimBrochures() {
    const allBrochures = [];

    console.log(`BİM Broşürleri çekiliyor: ${URL_BIM_BROCHURES}`);

    try {
        const { data } = await axios.get(URL_BIM_BROCHURES, config);
        const $ = cheerio.load(data);

        // Ana broşür gruplarını hedef alıyoruz (Sizin verdiğiniz HTML'e göre)
        // '.grup2.genelgrup.leftArea' veya '.grup1' gibi birden fazla broşür grubu olabilir.
        // Genellikle ".genelgrup" ana kartı temsil eder.
        $('.genelgrup').each((groupIndex, groupEl) => {
            const $group = $(groupEl);

            // 1. Broşür Adı ve Başlık Tespiti
            // Başlık genellikle '.subTabArea .text' içinde
            const title = $group.find('.subTabArea .text').text().trim();

            // Eğer başlık yoksa bu grubu atla
            if (!title) {
                console.log(`   -> Grup ${groupIndex + 1} için başlık bulunamadı, atlanıyor.`);
                return; 
            }

            const currentBrochure = {
                title: title,
                link: URL_BIM_BROCHURES, // Ana sayfa linki
                pages: []
            };

            // 2. Broşür Sayfalarını Çekme
            // Sayfalar: bigArea (Kapak Sayfası) ve smallArea (Diğer Sayfalar)
            let pageCount = 1;

            // A) Kapak Sayfası (bigArea)
            const $bigAreaLink = $group.find('.bigArea a.fancyboxImage');
            const coverImageUrl = $bigAreaLink.attr('href'); // Büyük resim linki
            const coverThumbnailUrl = $bigAreaLink.find('img').attr('src'); // Küçük resim linki

            if (coverImageUrl) {
                currentBrochure.pages.push({
                    page_number: pageCount++,
                    image_url: coverImageUrl, // Yüksek çözünürlüklü sayfa resmi
                    thumbnail_url: coverThumbnailUrl // Önizleme resmi
                });
            }

            // B) Diğer Sayfalar (smallArea)
            // smallArea içindeki her 'a.small' etiketi bir sayfayı temsil eder.
            $group.find('.smallArea a.small').each((smallIndex, smallEl) => {
                const $smallLink = $(smallEl);
                const bigImageUrl = $smallLink.attr('data-bigimg'); // Büyük resim linki
                const thumbnailUrl = $smallLink.attr('data-img') || $smallLink.find('img').attr('src'); // Önizleme resmi

                if (bigImageUrl) {
                    currentBrochure.pages.push({
                        page_number: pageCount++,
                        image_url: bigImageUrl,
                        thumbnail_url: thumbnailUrl
                    });
                }
            });

            console.log(`   -> Broşür: "${title}" - ${currentBrochure.pages.length} sayfa çekildi.`);

            if (currentBrochure.pages.length > 0) {
                 allBrochures.push(currentBrochure);
            }
        });

        return allBrochures;

    } catch (error) {
        console.error('Genel veri çekme hatası (BİM Broşür Sayfası):', error.message);
        return [];
    }
}

// tek tek ürünleri çekme //

async function scrapeBimProducts() {
    let allProducts = [];
    const productSelector = '.product.col-xl-3'; 
    const categoryBaseUrl = `${BASE_URL}/categories/100/aktuel-urunler.aspx`; // Temel kategori URL'si

    console.log(`\nBİM Ürün Kategorileri HTML ile çekiliyor...`);

    try {
        // 1. ADIM: Tüm Kategori Sekmelerini Toplama
        const { data: mainData } = await axios.get(URL_BIM_MAIN, config);
        const $main = cheerio.load(mainData);

        const categories = [];

        // Kategori sekmelerini hedefliyoruz
        $main('.subButton').each((index, el) => {
            const $el = $main(el);
            const relativeHref = $el.attr('href');
            const categoryTitle = $el.find('.text').text().trim();

            if (relativeHref && categoryTitle) {
                // Sadece Bim_AktuelTarihKey içeren linkleri almalıyız
                if (relativeHref.includes('Bim_AktuelTarihKey')) {
                    // Tam URL'yi oluşturuyoruz
                    const fullUrl = `${BASE_URL}${relativeHref}`;
                    categories.push({
                        title: categoryTitle,
                        url: fullUrl
                    });
                }
            }
        });

        console.log(`   -> Tespit edilen kategori sekmesi sayısı: ${categories.length}`);

        // 2. ADIM: Her Bir Kategori Sekmesini Tek Tek Scraping
        for (const category of categories) {
            console.log(`\n   -> Kategori Scraping Başlatıldı: "${category.title}"`);

            const categoryProducts = [];

            try {
                const { data: categoryData } = await axios.get(category.url, config);
                const $category = cheerio.load(categoryData);

                // Ürünleri Çekme (Aynı HTML yapısını kullanıyoruz)
                $category(productSelector).each((index, el) => {
                    const $product = $category(el);

                    // Link
                    const $linkElement = $product.find('.imageArea a');
                    const link = $linkElement.attr('href') ? BASE_URL + $linkElement.attr('href') : null;

                    // Görsel
                    const imageUrl = $product.find('.imageArea img').attr('src');

                    // Başlık ve Marka
                    const subTitle = $product.find('.descArea .subTitle').text().trim(); 
                    const title = $product.find('.descArea .title').text().trim(); 

                    // Detay
                    const detail = $product.find('.textArea .gramajadet').text().trim().replace('•', '').trim();

                    // Fiyat
                    const priceText = $product.find('.priceArea .text.quantify').text().trim();
                    const price = parseFloat(priceText.replace('.', '').replace(',', '.')) || 0; 

                    if (link && title && price > 0) {
                        const productID = link.match(/\/(\d+)\//)?.[1] || `${category.title}_${index}`; 

                        categoryProducts.push({
                            product_id: productID,
                            category: category.title, // Kategori adını buraya ekliyoruz
                            title: `${subTitle} ${title}`.trim(),
                            link: link,
                            image_url: imageUrl,
                            detail: detail,
                            price: price,
                            currency: 'TL'
                        });
                    }
                });

                console.log(`      -> "${category.title}" kategorisinden ${categoryProducts.length} ürün çekildi.`);
                allProducts.push(...categoryProducts);

            } catch (error) {
                console.error(`      -> Kategori "${category.title}" çekilirken hata oluştu:`, error.message);
            }
        }

        console.log(`\n   -> TÜM KATEGORİLERDEN toplam ${allProducts.length} ürün çekildi.`);
        return allProducts;

    } catch (error) {
        console.error('BİM Ana Kategori listesi çekilirken hata oluştu:', error.message);
        return [];
    }
}

// ======================================================================
// ANA ÇALIŞTIRMA FONKSİYONU (KONSOLDA ÜRÜN GÖSTERİMİ EKLENDİ)
// ======================================================================
async function main() {
    console.log(`\n============================================`);
    console.log(`## 🛒 BİM Veri Çekimi Başladı`);
    console.log(`============================================`);

    let brochures = [];
    let products = [];
    let error = null;

    try {
        // Broşürleri ve Ürünleri Asenkron Çek
        brochures = await scrapeBimBrochures();
        products = await scrapeBimProducts();

    } catch (e) {
        error = e.message;
        console.error('BİM genel veri çekme hatası:', error);
    }

    // NIHAI JSON YAPISINI OLUŞTURMA
    const finalDataStructure = {
        last_updated: new Date().toISOString(),
        bim_brochures: brochures,
        bim_products: products
    };

    // --- KONSOLA YAZDIRMA (Özet) ---
    console.log('\n======================================================');
    console.log('## 💾 İŞLEM TAMAMLANDI: BİM ÖZET');
    console.log('======================================================');
    console.log(`Toplam Broşür Sayısı: ${brochures.length}`);
    console.log(`Toplam Aktüel Ürün Sayısı: ${products.length}`);
    console.log('\n✅ BİM İşlemi Tamamlandı (Veri Döndürüldü).');

    // Express'e döndürülecek obje
    return { 
        totalBrochures: brochures.length,
        totalProducts: products.length, 
        fullData: finalDataStructure,
        error: error
    };
}


// Express sunucusunun çağıracağı isimle dışa aktar
export { main as runBimScraper };