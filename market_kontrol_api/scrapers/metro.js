// scrapers/metro.js

import { parse } from 'node-html-parser';

const METRO_URL = 'https://www.metro-tr.com/promosyonlar';
const MARKET_NAME = 'Metro';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};

/**
 * 🧹 Metro Market broşürlerini çeker ve formatlar.
 */
export const runMetroScraper = async () => {
    console.log(`Starting ${MARKET_NAME} Scraper...`);
    let brochures = [];

    try {
        const response = await fetch(METRO_URL, { headers: DEFAULT_HEADERS });

        if (!response.ok) {
            console.error(`${MARKET_NAME} fetch failed: ${response.status}`);
            return {
                marketName: MARKET_NAME,
                fullData: { metro_brochures: [] },
                totalBrochures: 0
            };
        }

        const html = await response.text();
        const root = parse(html);

        // Hedef element: <li class="catalog">
        const catalogItems = root.querySelectorAll('li.catalog');

        if (catalogItems.length === 0) {
            console.warn(`${MARKET_NAME}: Broşür elementleri bulunamadı.`);
        }

        catalogItems.forEach(item => {
            try {
                // Link ve Kapak Resmi
                const linkElement = item.querySelector('a');
                const imageElement = item.querySelector('.catalog-image img');

                // Başlık ve Tarih
                const titleElement = item.querySelector('.catalog-title strong');
                // Tarih için <a> içindeki ikinci span'ı hedefliyoruz.
                const contentSpans = item.querySelectorAll('.catalog-content span'); 

                const title = titleElement ? titleElement.text.trim() : 'Başlıksız Katalog';

                // Tarih aralığı (genellikle ikinci span)
                let dateRange = '';
                if (contentSpans.length > 1) {
                    dateRange = contentSpans[1].text.trim(); 
                }

                const coverImage = imageElement ? imageElement.getAttribute('src') : null;
                const detailUrl = linkElement ? linkElement.getAttribute('href') : null;

                // Tüm veriler mevcutsa ekle
                if (coverImage && detailUrl) {
                    brochures.push({
                        id: detailUrl.split('/').pop() || String(Math.random()),
                        marketName: MARKET_NAME,
                        title: title,
                        dateRange: dateRange,
                        imageUrl: coverImage, // Kapak resmi
                        detailUrl: detailUrl, // Harici broşür URL'si
                        // Metro'da ürün listesi çekilemiyor, sadece broşür gösteriliyor.
                        pages: [] // Boş bırakılabilir
                    });
                }
            } catch (itemError) {
                console.warn(`Metro: Broşür ayrıştırma hatası: ${itemError.message}`);
            }
        });

        console.log(`Metro: Scoped ${brochures.length} brochures.`);

        return {
            marketName: MARKET_NAME,
            fullData: {
                metro_brochures: brochures, // Broşür listesi
            },
            totalBrochures: brochures.length,
            // Ürün olmadığı için toplam ürün 0
            totalProducts: 0
        };

    } catch (error) {
        console.error(`Error in ${MARKET_NAME} Scraper:`, error);
        return {
            marketName: MARKET_NAME,
            fullData: { metro_brochures: [] },
            totalBrochures: 0
        };
    }
};