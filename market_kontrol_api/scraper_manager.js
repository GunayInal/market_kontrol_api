// scrapers/scraper_manager.js
import { saveA101ToDB } from './scrapers/a101_db.js';
import { saveBimToDB } from './scrapers/bim_db.js';
import { saveMigrosToDB } from './scrapers/migros_db.js';
import { saveGratisToDB } from './scrapers/gratis_db.js';
import { saveBizimToDB } from './scrapers/bizim_db.js';
import { saveSokToDB } from './scrapers/sok_db.js';

export async function runAllScrapers() {
    const summary = {};
    const tasks = [
        //{ name: 'A101', func: saveA101ToDB },
        { name: 'BIM', func: saveBimToDB },
        //{ name: 'Migros', func: saveMigrosToDB },
        //{ name: 'Gratis', func: saveGratisToDB },
        //{ name: 'Bizim', func: saveBizimToDB },
        //{ name: 'ŞOK', func: saveSokToDB }
    ];

    console.log("🚀 MERKEZİ SİSTEM: Marketler sırayla işleniyor...");

    for (const task of tasks) {
        console.log(`\n>>> [${task.name}] KİLİTLENDİ VE BAŞLATILIYOR...`);
        try {
            await task.func(); // await burada olduğu sürece bir sonraki markete asla geçemez.
            summary[task.name] = "Başarılı";
            console.log(`<<< [${task.name}] BİTTİ.\n`);
        } catch (err) {
            console.error(`❌ [${task.name}] Hata verdi:`, err.message);
            summary[task.name] = "Hata: " + err.message;
        }
    }
    return summary;
}