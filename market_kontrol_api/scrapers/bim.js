import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const URL_BIM_BROCHURES = 'https://www.bim.com.tr/Categories/680/afisler.aspx';
const BASE_URL = 'https://www.bim.com.tr';

const config = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Referer': 'https://www.bim.com.tr/'
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
};

function fixImageUrl(url) {
    if (!url) return null;

    if (url.includes('data:image') || url.includes('placeholder') || url.includes('loading')) {
        return null;
    }

    if (url.startsWith('//')) {
        return 'https:' + url;
    }

    if (url.startsWith('/') && !url.startsWith('http')) {
        return BASE_URL + url;
    }

    return url;
}

async function scrapeBimBrochures() {
    const allBrochures = [];
    try {
        console.log('\n📖 BİM Broşürleri çekiliyor...');
        const { data } = await axios.get(URL_BIM_BROCHURES, config);
        const $ = cheerio.load(data);

        $('.genelgrup').each((index, groupEl) => {
            const $group = $(groupEl);
            const title = $group.find('.subTabArea .text').text().trim();
            if (!title) return;

            const currentBrochure = { title: title, link: URL_BIM_BROCHURES, pages: [] };
            let pageCount = 1;

            const $bigAreaLink = $group.find('.bigArea a.fancyboxImage');
            if ($bigAreaLink.attr('href')) {
                currentBrochure.pages.push({
                    page_number: pageCount++,
                    image_url: fixImageUrl($bigAreaLink.attr('href')),
                    thumbnail_url: fixImageUrl($bigAreaLink.find('img').attr('src'))
                });
            }

            $group.find('.smallArea a.small').each((i, smallEl) => {
                const $smallLink = $(smallEl);
                if ($smallLink.attr('data-bigimg')) {
                    currentBrochure.pages.push({
                        page_number: pageCount++,
                        image_url: fixImageUrl($smallLink.attr('data-bigimg')),
                        thumbnail_url: fixImageUrl($smallLink.attr('data-img'))
                    });
                }
            });

            if (currentBrochure.pages.length > 0) {
                console.log(`   ✅ "${title}": ${currentBrochure.pages.length} sayfa`);
                allBrochures.push(currentBrochure);
            }
        });

        console.log(`\n✅ Toplam ${allBrochures.length} broşür bulundu`);
        return allBrochures;
    } catch (error) { 
        console.error('❌ Broşür çekme hatası:', error.message);
        return []; 
    }
}

async function main() {
    console.log('\n============================================');
    console.log('🛒 BİM Broşür Çekimi Başladı');
    console.log('============================================');

    const brochures = await scrapeBimBrochures();

    console.log('\n============================================');
    console.log('✅ BİM Broşür Çekimi Tamamlandı');
    console.log('============================================\n');

    return { 
        fullData: { 
            bim_brochures: brochures
        },
        totalBrochures: brochures.length,
        totalProducts: 0
    };
}

export { main as runBimScraper };