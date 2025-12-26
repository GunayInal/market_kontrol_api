import pkg from 'pg';

const { Pool } = pkg;

import { runBizimScraper } from './bizim.js'; 



const pool = new Pool({

    connectionString: process.env.DATABASE_URL,

    ssl: { rejectUnauthorized: false }

});



export async function saveBizimToDB() {

    const client = await pool.connect();

    const storeSlug = 'bizim';

    const currentTime = new Date();



    try {

        const data = await runBizimScraper();

        if (!data || !data.fullData || data.fullData.bizim_campaigns.length === 0) {

            console.log("⚠️ Veri bulunamadı.");

            return;

        }



        await client.query('BEGIN');

        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);



        if (storeRes.rows.length === 0) {

            console.error("❌ Hata: 'bizim' mağazası veritabanında kayıtlı değil! Önce INSERT INTO stores... komutunu çalıştırın.");

            await client.query('ROLLBACK');

            return;

        }

        const storeId = storeRes.rows[0].id;



        for (const campaign of data.fullData.bizim_campaigns) {

            const campId = `bizim_camp_${campaign.id}`;



            // Kampanya görseli URL tamamlama

            let campImg = campaign.imageUrl;

            if (campImg && !campImg.startsWith('http')) campImg = `https://www.bizimtoptan.com.tr${campImg}`;



            await client.query(`

                INSERT INTO campaigns (id, store_id, title, image_url, link, created_at)

                VALUES ($1, $2, $3, $4, $5, $6)

                ON CONFLICT (id) DO UPDATE SET created_at = $6

            `, [campId, storeId, campaign.title, campImg, campaign.detailUrl, currentTime]);



            for (const item of campaign.products) {

                // Ürün görseli URL tamamlama

                let productImg = item.imageUrl;

                if (productImg && !productImg.startsWith('http')) productImg = `https://www.bizimtoptan.com.tr${productImg}`;



                const badges = [];

                if (item.bulkDiscountText) badges.push(item.bulkDiscountText);

                if (item.brand) badges.push(item.brand);



                await client.query(`

                    INSERT INTO products (campaign_id, name, price, regular_price, image_url, product_url, category, badges)

                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)

                `, [campId, item.name, item.price, item.bulkPrice, productImg, item.url, item.category, badges]);

            }

        }

        await client.query('COMMIT');

        console.log(`✅ Bizim Toptan Başarıyla Tamamlandı!`);

    } catch (e) {

        await client.query('ROLLBACK');

        console.error('❌ Hata:', e);

    } finally {

        client.release();

    }

}
