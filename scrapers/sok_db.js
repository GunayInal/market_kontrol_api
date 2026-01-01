// scrapers/sok_db.js
import pkg from 'pg';
const { Pool } = pkg;
import { runSokScraper } from './sok.js';

const pool = new Pool({
    user: 'marketuser',
    host: '127.0.0.1',
    database: 'marketdb',
    password: 'Market_1234',
    port: 5432,
});

export async function saveSokToDB() {
    const client = await pool.connect();
    const storeSlug = 'Sok';
    const currentTime = new Date();

    try {
        console.log("🚀 ŞOK Scraper başlatılıyor...");
        const data = await runSokScraper();

        if (!data || !data.fullData.sok_campaigns) {
            console.error("❌ Hata: ŞOK verisi alınamadı!");
            return;
        }

        await client.query('BEGIN');

        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);
        const storeId = storeRes.rows[0].id;

        // 1. TEMİZLİK
        // ŞOK'a ait eski ürünleri ve kampanyaları temizle
        await client.query("DELETE FROM products WHERE campaign_id LIKE 'sok_%'");
        await client.query("DELETE FROM campaigns WHERE store_id = $1", [storeId]);

        console.log("🧹 ŞOK eski verileri temizlendi. Yazma başlıyor...");

        for (const campaign of data.fullData.sok_campaigns) {
            const campId = `sok_camp_${campaign.id}`;

            // Kampanyayı ekle
            await client.query(`
                INSERT INTO campaigns (id, store_id, title, image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET created_at = $6
            `, [campId, storeId, campaign.title, campaign.image_url, campaign.link, currentTime]);

            // Ürünleri ekle
            for (const prod of campaign.products) {
                await client.query(`
                    INSERT INTO products (
                        campaign_id, name, price, regular_price, image_url, product_url, badges
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    campId,
                    prod.title || 'İsimsiz Ürün',
                    prod.price.final,
                    prod.price.original,
                    prod.image_url,
                    prod.link,
                    prod.badge_promotions.map(b => b.text) // Win para vb. rozetleri badge olarak ekle
                ]);
            }
        }

        await client.query('COMMIT');
        console.log(`✅ ŞOK Başarıyla Tamamlandı! (${data.totalProducts} ürün)`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ ŞOK DB Hatası:', e.message);
    } finally {
        client.release();
    }
}
