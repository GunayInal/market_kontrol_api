import pkg from 'pg';
const { Pool } = pkg;
import { runGratisScraper } from './gratis.js';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const formatPrice = (priceText) => {
    if (!priceText) return null;
    let price = priceText.replace(/[^\d,.-]/g, '').replace(',', '.');
    return parseFloat(price) || 0;
};

// Fonksiyon adını diğerleriyle uyumlu hale getirip export ediyoruz
export async function saveGratisToDB() {
    const client = await pool.connect();
    const storeSlug = 'gratis';
    const currentTime = new Date();

    try {
        console.log(`\n🚀 Gratis Scraper başlatılıyor...`);
        const scrapedData = await runGratisScraper(); // Veriyi burada çekiyoruz

        if (!scrapedData || !scrapedData.campaigns) {
            console.error("❌ Gratis verisi alınamadı.");
            return;
        }

        await client.query('BEGIN');

        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);
        const storeId = storeRes.rows[0].id;

        console.log(`💾 Veritabanına yazılıyor: ${storeSlug}...`);

        // ÖNCE TEMİZLİK (Foreign Key hatası almamak için)
        // Gratis için tüm eski kampanya ve ürünlerini siliyoruz (veya senin limit 5 mantığını uyguluyoruz)
        await client.query("DELETE FROM products WHERE campaign_id LIKE 'gratis_%' OR campaign_id IN (SELECT id FROM campaigns WHERE store_id = $1)", [storeId]);
        await client.query("DELETE FROM campaigns WHERE store_id = $1", [storeId]);

        for (const campaign of scrapedData.campaigns) {
            const campId = campaign.campaign_id.toString();

            await client.query(`
                INSERT INTO campaigns (id, store_id, title, image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET created_at = $6
            `, [campId, storeId, campaign.title, campaign.image_url, campaign.link, currentTime]);

            const campaignProductsObj = scrapedData.products[campId];
            if (campaignProductsObj && campaignProductsObj.products) {
                for (const prod of campaignProductsObj.products) {
                    await client.query(`
                        INSERT INTO products (campaign_id, name, price, regular_price, image_url, product_url)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        campId,
                        prod.title,
                        formatPrice(prod.discounted_price),
                        formatPrice(prod.original_price),
                        prod.image_url,
                        prod.product_url
                    ]);
                }
            }
        }

        await client.query('COMMIT');
        console.log(`✅ ${storeSlug} başarıyla DB'ye işlendi.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Gratis DB Hatası:', e);
    } finally {
        client.release();
    }
}