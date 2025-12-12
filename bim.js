

// Gerekli Kütüphaneleri İçe Aktar
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises'; // <-- Burayı kontrol edin ve fs/promises kullandığınızdan emin olun
import https from 'https';
// ...

//sabitler

const URL_BIM_BROCHURES = 'https://www.bim.com.tr/Categories/680/afisler.aspx';
const URL_BIM_MAIN = 'https://www.bim.com.tr/'; // Ürünler buradan çekilecek
const BASE_URL = 'https://www.bim.com.tr';

// Axios yapılandırması (SSL kontrolü devre dışı bırakıldı)
const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    // Sertifika hatasını çözmek için eklenen kısım
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
// ANA ÇALIŞTIRMA FONKSİYONU
// ======================================================================
// bim.js içinde, main fonksiyonu (güncellenmiş)

// ======================================================================
// ANA ÇALIŞTIRMA FONKSİYONU (KONSOLDA ÜRÜN GÖSTERİMİ EKLENDİ)
// ======================================================================
async function main() {
    const brochures = await scrapeBimBrochures();
    const products = await scrapeBimProducts(); 

    // NIHAI JSON YAPISINI OLUŞTURMA (Kaydetme kısmı şimdilik pasif)
    const brochureData = {
        last_updated: new Date().toISOString(),
        bim_brochures: brochures
    };

    const productData = { 
        last_updated: new Date().toISOString(),
        bim_products: products
    };

    // --- KONSOLA YAZDIRMA (İSTENEN ADIM) ---
    console.log('\n======================================================');
    console.log('## 📦 ÇEKİLEN ÜRÜNLER ÖN İZLEME (İlk 5 Ürün)');
    console.log('======================================================');

    if (products.length > 0) {
        // Tüm ürünleri değil, sadece ilk 5'ini yazdırıyoruz (Konsolu doldurmamak için)
        products.slice(0, 5).forEach((product, index) => {
            console.log(`[#${index + 1}] ${product.title}`);
            console.log(`      Fiyat: ${product.price} ${product.currency}`);
            console.log(`      Link: ${product.link.substring(0, 70)}...`);
            console.log(`      Detay: ${product.detail}`);
            console.log('---');
        });
        console.log(`...ve toplam ${products.length - 5} ürün daha var.`);
    } else {
        console.log("⚠️ API'den hiç ürün çekilemedi!");
    }
    // ------------------------------------

    // JSON dosyalarını kaydetme (Bu kısmı tekrar deniyoruz, başarısız olursa konsola yazılır)
    try {
        // 1. Broşürler Kaydediliyor
        await fs.writeFile('bim_broşürler.json', JSON.stringify(brochureData, null, 2));
        console.log('\n✅ BİM Broşür verisi "bim_broşürler.json" dosyasına kaydedildi.');

        // 2. Ürünler Kaydediliyor
        await fs.writeFile('bim_aktuel_urunler.json', JSON.stringify(productData, null, 2));
        console.log('✅ BİM Aktüel Ürünler verisi "bim_aktuel_urunler.json" dosyasına kaydedildi.');

    } catch (fileError) {
         // Eğer burada bir hata alırsak, en azından konsolda göreceğiz.
         console.error('\n⚠️ JSON dosyasına yazma hatası (Lütfen dosya izinlerini kontrol edin):', fileError.message);
    }

    // Konsol özeti
    console.log('\n======================================================');
    console.log('## 💾 İŞLEM TAMAMLANDI: BİM ÖZET');
    console.log('======================================================');
    console.log(`Toplam Broşür Sayısı: ${brochures.length}`);
    console.log(`Toplam Ürün Sayısı (API'den): ${products.length}`);
    console.log('\n✅ BİM İşlemi Tamamlandı.');
}



export { main as runBimScraper };