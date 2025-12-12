// gratis.js - Nihai JSON Parsing Versiyonu

// Gerekli Kütüphaneleri İçe Aktar
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import https from 'https'; 

// Sabitler
const URL_GRATIS_MAIN = 'https://www.gratis.com/';
const BASE_URL = 'https://www.gratis.com';

// Axios yapılandırması
const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
};

// ======================================================================
// BÖLÜM 1: GÖMÜLÜ JSON VERİSİNİ ÇEKME
// ======================================================================

async function scrapeGratisCampaigns() {
    console.log(`\nGratis Kampanyaları (Gömülü JSON) ile çekiliyor: ${URL_GRATIS_MAIN}`);

    try {
        const { data } = await axios.get(URL_GRATIS_MAIN, config);
        const $ = cheerio.load(data);

        let rawCampaigns = [];

        // 1. ADIM: JSON bloğunu içeren script etiketini bulma
        // Genellikle bu tür veriler, bir `<script>` etiketi içinde bir değişkene atanır.

        // Tüm script etiketlerini alıp içinde kampanya verisi arıyoruz.
        // Anahtar kelimeler: "banners", "campaigns", "sliderData"
        $('script').each((i, el) => {
            const scriptContent = $(el).html();

            // Sizin bulduğunuz veri yapısına göre, bu genellikle "promoBanner" veya "campaigns" içerir.
            if (scriptContent && scriptContent.includes('startDate') && scriptContent.includes('imageUrl')) {

                // Bu kod, script içeriğindeki JSON dizisinin sınırlarını bulmaya çalışır.
                // Gratis, genellikle veriyi bir değişkene atar: var sliderData = [...];

                // JSON dizisinin başlangıcını (en yaygın işaretleyici) buluyoruz: `[`
                const start = scriptContent.indexOf('[');
                // JSON dizisinin sonunu buluyoruz: `]`
                const end = scriptContent.lastIndexOf(']');

                if (start !== -1 && end !== -1 && end > start) {
                    const jsonString = scriptContent.substring(start, end + 1);

                    try {
                        // JSON string'i parse etme
                        rawCampaigns = JSON.parse(jsonString);
                        console.log(`   ✅ Kampanya JSON Bloğu başarıyla ayrıştırıldı.`);
                        // Tek bir doğru JSON bloğu bulduğumuz için döngüyü sonlandırabiliriz
                        return false; 
                    } catch (e) {
                        // Hatalı JSON formatı varsa (örneğin JavaScript kodu kalmışsa) yoksay
                        // console.warn("   ⚠️ JSON ayrıştırma hatası:", e.message); 
                    }
                }
            }
        });

        // 2. ADIM: Ayrıştırılan veriyi temiz ve standart formata dönüştürme
        const cleanedCampaigns = rawCampaigns.map((item, index) => {
            // Sadece 'active: true' olanları ve gerekli alanları alıyoruz
            if (item.active && item.title && item.imageUrl) {
                // Linkin tam URL'sini oluşturuyoruz
                const fullUrl = item.url.startsWith('http') ? item.url : BASE_URL + item.url;

                return {
                    campaign_id: item.id || index + 1,
                    title: item.title,
                    subtitle: item.shortDescription || item.filter || null,
                    link: fullUrl,
                    image_url: item.imageUrl,
                    start_date: item.startDate ? new Date(item.startDate).toISOString() : null,
                    end_date: item.endDate ? new Date(item.endDate).toISOString() : null
                };
            }
            return null;
        }).filter(item => item !== null); // null olanları (active: false veya eksik veri) filtrele

        console.log(`   -> Toplam ${cleanedCampaigns.length} aktif kampanya kartı çekildi.`);
        return cleanedCampaigns;

    } catch (error) {
        console.error('Gratis Kampanya çekilirken kritik hata oluştu:', error.message);
        return [];
    }
}


// ======================================================================
// ANA ÇALIŞTIRMA FONKSİYONU (main)
// ======================================================================
async function main() {
    const campaigns = await scrapeGratisCampaigns();

    // NIHAI JSON YAPISINI OLUŞTURMA
    const finalDataStructure = {
        last_updated: new Date().toISOString(),
        gratis_campaigns: campaigns
    };

    const jsonOutput = JSON.stringify(finalDataStructure, null, 2);

    // JSON dosyasını kaydetme
    try {
        await fs.writeFile('gratis_kampanyalar.json', jsonOutput);
        console.log('\n✅ Gratis Kampanya verisi "gratis_kampanyalar.json" dosyasına kaydedildi.');
    } catch (fileError) {
         console.error('\n⚠️ JSON dosyasına yazma hatası:', fileError.message);
    }

    // Konsol özeti
    console.log('\n======================================================');
    console.log('## 💾 İŞLEM TAMAMLANDI: GRATIS ÖZET');
    console.log('======================================================');
    console.log(`Toplam Kampanya Kartı Sayısı: ${campaigns.length}`);
    if (campaigns.length > 0) {
         console.log(`İlk Kampanya: ${campaigns[0].title} (${campaigns[0].subtitle})`);
    }
    console.log('\n✅ Gratis İşlemi Tamamlandı.');
}

export { main as runGratisScraper };