import pkg from 'pg';
const { Pool } = pkg;
import { runA101Scraper } from './a101.js';

const pool = new Pool({
    user: 'marketuser',
    host: '127.0.0.1',
    database: 'marketdb',
    password: 'Market_1234',
    port: 5432,
});

export async function saveA101ToDB() {
    const client = await pool.connect();
    const storeSlug = 'a101';
    const currentTime = new Date();

    try {
        console.log("🚀 A101 Scraper başlatılıyor...");
        const data = await runA101Scraper();

        if (!data || !data.fullData) {
            console.error("❌ Hata: Scraper'dan veri alınamadı!");
            return;
        }

        await client.query('BEGIN');

        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);
        const storeId = storeRes.rows[0].id;

        // 1. TEMİZLİK (Yeni Mimariye Göre)
        // SIRALAMA ÇOK ÖNEMLİ: Önce ürünler ve sayfalar, en son ana tablolar!
        
        await client.query("DELETE FROM brochure_pages WHERE brochure_id LIKE 'a101%'");
        await client.query("DELETE FROM products WHERE campaign_id LIKE 'a101%'"); // Önce ürünler!
        await client.query("DELETE FROM campaigns WHERE store_id = $1", [storeId]); // Sonra kampanyalar!
        await client.query("DELETE FROM brochures WHERE store_id = $1", [storeId]); // Sonra broşürler!

        console.log("🧹 Veritabanı temizlendi. Yazma işlemi başlıyor...");

        // 2. KAMPANYALAR VE ÜRÜNLER
        const allCampaigns = [...data.fullData.a101_side_campaigns_api, ...data.fullData.a101_side_campaigns_html];

        for (const campaign of allCampaigns) {
            const campId = `a101_camp_${campaign.link.split('/').filter(Boolean).pop()}`;

            await client.query(`
                INSERT INTO campaigns (id, store_id, title, image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET created_at = $6
            `, [campId, storeId, campId, campaign.image_url, campaign.link, currentTime]);

            for (const prod of campaign.products) {
                // Fiyat Çözümleme (Sayı veya Obje)
                let finalPrice = 0, regularPrice = null;
                if (prod.price && typeof prod.price === 'object') {
                    finalPrice = prod.price.final || 0;
                    regularPrice = prod.price.original || null;
                } else {
                    finalPrice = parseFloat(prod.price) || 0;
                }

                let finalImageUrl = prod.image_url || (prod.images?.main || '');

                await client.query(`
                    INSERT INTO products (
                        campaign_id, name, price, regular_price, image_url, product_url, badges,
                        p1_qty, p1_total_price, p1_original_price, p1_unit_price, p1_savings,
                        p2_qty, p2_total_price, p2_original_price, p2_unit_price, p2_savings
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                `, [
                    campId, prod.title || 'İsimsiz Ürün', finalPrice, regularPrice, finalImageUrl,
                    prod.link.startsWith('http') ? prod.link : `https://www.a101.com.tr${prod.link}`,
                    prod.brand ? [prod.brand] : [],
                    prod.promotion?.quantity || null, prod.promotion?.price_for_quantity || null, prod.promotion?.original_price || null, 
                    prod.promotion?.unit_price ? parseFloat(prod.promotion.unit_price) : null, prod.promotion?.savings || null,
                    prod.alternative_promotion?.quantity || null, prod.alternative_promotion?.price_for_quantity || null, prod.alternative_promotion?.original_price || null,
                    prod.alternative_promotion?.unit_price ? parseFloat(prod.alternative_promotion.unit_price) : null, prod.alternative_promotion?.savings || null
                ]);
            }
        }

        // 3. BROŞÜRLER (Artık Kendi Tablosunda)
        for (const brochure of data.fullData.a101_brochures) {
            const brochureId = `a101_bro_${brochure.link.split('/').filter(Boolean).pop()}`;

            await client.query(`
                INSERT INTO brochures (id, store_id, title, main_image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET created_at = $6
            `, [brochureId, storeId, brochure.title, brochure.main_image_url, brochure.link, currentTime]);

            for (const page of brochure.pages) {
                await client.query(`
                    INSERT INTO brochure_pages (brochure_id, page_number, image_url)
                    VALUES ($1, $2, $3)
                `, [brochureId, page.page_number, page.image_url]);
            }
        }

        await client.query('COMMIT');
        console.log(`✅ İşlem Başarılı! 11 Kampanya, 5 Broşür ve ${data.totalProducts} ürün işlendi.`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ DB Hatası:', e.message);
    } finally {
        client.release();
    }
}
