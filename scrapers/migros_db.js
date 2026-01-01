import pkg from 'pg';
const { Pool } = pkg;
import { runMigrosScraper } from './migros.js'; 

const pool = new Pool({
    user: 'marketuser',
    host: '127.0.0.1',
    database: 'marketdb',
    password: 'Market_1234',
    port: 5432,
});

export async function saveMigrosToDB() {
    const client = await pool.connect();
    const storeSlug = 'migros';
    const currentTime = new Date();

    try {
        const data = await runMigrosScraper();
        // Veri yapısı kontrolü
        if (!data || !data.fullData || !data.fullData.migros_campaigns) {
            console.log("⚠️ Migros verisi beklenen yapıda değil veya boş.");
            return;
        }

        await client.query('BEGIN');

        // 1. Market ID'sini al
        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);
        if (storeRes.rows.length === 0) {
            throw new Error("Migros marketi 'stores' tablosunda bulunamadı. Önce mağazayı ekleyin.");
        }
        const storeId = storeRes.rows[0].id;

        console.log(`\n💾 Migros Verileri DB'ye yazılıyor... (${data.totalCampaigns} Kampanya)`);

        // --- MİGROS KAMPANYA VE ÜRÜN DÖNGÜSÜ ---
        for (const campaign of data.fullData.migros_campaigns) {
            
            // --- GÜVENLİK KONTROLÜ (Hatanın Çözümü) ---
            if (!campaign || typeof campaign.id === 'undefined') {
                console.log("⏩ Geçersiz bir kampanya atlandı.");
                continue;
            }

            const campId = `migros_camp_${campaign.id}`;
            const campUrl = campaign.slug ? `https://www.migros.com.tr/kampanyalar/${campaign.slug}` : 'https://www.migros.com.tr/kampanyalar';

            await client.query(`
                INSERT INTO campaigns (id, store_id, title, image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET 
                    title = EXCLUDED.title,
                    image_url = EXCLUDED.image_url,
                    created_at = $6
            `, [campId, storeId, campaign.name || 'İsimsiz Kampanya', campaign.imageUrl, campUrl, currentTime]);

            // Ürünlerin Kaydı (Eğer ürün varsa)
            if (campaign.products && Array.isArray(campaign.products)) {
                for (const prod of campaign.products) {
                    if (!prod || !prod.name) continue;

                    const badges = [];
                    if (prod.discountRate) badges.push(`%${prod.discountRate} İndirim`);
                    if (prod.campaignText) badges.push(prod.campaignText);

                    // Ürün tablosunda external_id veya UNIQUE bir alan varsa ON CONFLICT eklenmeli. 
                    // Senin tabloda id SERIAL olduğu için şimdilik doğrudan ekliyoruz.
                    await client.query(`
                        INSERT INTO products (campaign_id, name, price, regular_price, image_url, product_url, badges)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        campId, 
                        prod.name, 
                        parseFloat(prod.price) || 0, 
                        prod.regularPrice ? parseFloat(prod.regularPrice) : null,
                        prod.imageUrl,
                        `https://www.migros.com.tr/${prod.prettyName || 'urun'}-p-${prod.id}`,
                        badges
                    ]);
                }
            }
        }

        // --- TEMİZLİK (Sadece son güncel verileri tutar) ---
        await client.query(`
            DELETE FROM campaigns 
            WHERE store_id = $1 AND created_at != $2
        `, [storeId, currentTime]);

        await client.query('COMMIT');
        console.log(`✅ Migros başarıyla DB'ye işlendi. (Tahmini ${data.totalProducts} ürün)`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migros DB Hatası:', e.message);
    } finally {
        client.release();
    }
}
