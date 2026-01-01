import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function processSokPdf(pdfName, folderName) {
    // __dirname veya process.cwd() kullanarak TAM YOL (Absolute Path) oluşturuyoruz
    const rootDir = process.cwd(); 
    const pdfPath = path.join(rootDir, 'uploads/pdf', pdfName);
    const outputDir = path.join(rootDir, 'public/images/brosurler/sok', folderName);
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Yetki sorunlarını aşmak için klasöre tam yetki verelim
    fs.chmodSync(outputDir, 0o777);

    // Çıktı formatı
    const outputPath = path.join(outputDir, '%d-sayfa.png');

    // -dNOSAFER yetki hatalarını aşar, %d ise sayfaları numaralandırır
    const gsCommand = `gs -dNOSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r150 -sOutputFile="${outputPath}" "${pdfPath}"`;

    try {
        console.log("⏳ Ghostscript ile 6 sayfa parçalanıyor...");
        await execPromise(gsCommand);

        // Dosyaları oku ve sayısal sırala (1-sayfa, 2-sayfa...)
        const files = fs.readdirSync(outputDir).sort((a, b) => {
            return parseInt(a) - parseInt(b);
        });

        const urls = files.map(file => `/images/brosurler/sok/${folderName}/${file}`);
        return urls;
    } catch (err) {
        console.error("❌ Ghostscript Hatası:", err);
        throw err;
    }
}
