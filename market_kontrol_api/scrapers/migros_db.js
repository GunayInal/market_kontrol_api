import pkg from 'pg';
const { Pool } = pkg;
import { runMigrosScraper } from './migros.js'; 

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function saveMigrosToDB() {
    const client = await pool.connect();
    const storeSlug = 'migros';
    const currentTime = new Date();

    try {
        const data = await runMigrosScraper();
        if (!data || !data.fullData) {
            console.log("⚠️ Migros verisi boş döndü.");
            return;
        }

        await client.query('BEGIN');

        // 1. Market ID'sini al
        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);
        const storeId = storeRes.rows[0].id;

        console.log(`\n💾 Migros Verileri DB'ye yazılıyor... (${data.totalCampaigns} Kampanya)`);

        // --- MİGROS KAMPANYA VE ÜRÜN DÖNGÜSÜ ---
        for (const campaign of data.fullData.migros_campaigns) {
            // Kampanya Kaydı
            const campId = `migros_camp_${campaign.id}`;
            const campUrl = `https://www.migros.com.tr/kampanyalar/${campaign.slug}`;

            await client.query(`
                INSERT INTO campaigns (id, store_id, title, image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET created_at = $6
            `, [campId, storeId, campaign.name, campaign.imageUrl, campUrl, currentTime]);

            // Ürünlerin Kaydı
            for (const prod of campaign.products) {
                // Rozetleri ve indirim oranlarını badges dizisine ekle
                const badges = [];
                if (prod.discountRate) badges.push(`%${prod.discountRate} İndirim`);
                if (prod.campaignText) badges.push(prod.campaignText);

                await client.query(`
                    INSERT INTO products (campaign_id, name, price, regular_price, image_url, product_url, badges)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    campId, 
                    prod.name, 
                    parseFloat(prod.price), 
                    prod.regularPrice ? parseFloat(prod.regularPrice) : null,
                    prod.imageUrl,
                    `https://www.migros.com.tr/${prod.prettyName}-p-${prod.id}`,
                    badges
                ]);
            }
        }

        // --- TEMİZLİK (Eski batchleri sil) ---
        await client.query(`
            DELETE FROM campaigns 
            WHERE store_id = $1 AND created_at NOT IN (
                SELECT DISTINCT created_at FROM campaigns 
                WHERE store_id = $1 
                ORDER BY created_at DESC 
                LIMIT 5
            )
        `, [storeId]);

        await client.query('COMMIT');
        console.log(`✅ Migros başarıyla DB'ye işlendi. (Toplam ${data.totalProducts} ürün)`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migros DB Hatası:', e.stack);
    } finally {
        client.release();
    }
}
