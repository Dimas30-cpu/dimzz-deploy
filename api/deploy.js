Export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  const { method } = req;
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

  // ==== 1. ENDPOINT POST (Initiate Deployment) ====
  if (method === 'POST') {
    try {
      const { projectName, files } = req.body;

      if (!projectName || !files || files.length === 0) {
        return res.status(400).json({ success: false, error: "Project name and files are required." });
      }

      // Bersihkan nama project dari spasi / karakter aneh agar aman jadi domain
      const cleanProjectName = projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const vercelFiles = files.map(f => ({
        file: f.file,
        data: f.data,
        encoding: "base64"
      }));

      const vercelResponse = await fetch('https://api.vercel.com/v13/deployments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanProjectName, // Gunakan nama yang di-input dari web
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

      // Buat URL rapi sesuai nama project yang diisi di web
      const customUrl = `${cleanProjectName}.vercel.app`;

      return res.status(200).json({
        success: true,
        deploymentId: vercelData.id,
        url: customUrl
      });

    } catch (error) {
      console.error("[POST Deploy] Error:", error);
      return res.status(500).json({ success: false, error: "Internal Server Error." });
    }
  } 
  
  // ==== 2. ENDPOINT GET (Check Status & Notify Telegram) ====
  else if (method === 'GET') {
    try {
      const { id, projectName, filesCount, totalSize } = req.query;

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
      
      // Pakai nama project yang di-input untuk URL Telegram & Response
      const cleanName = projectName ? projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';
      const targetUrl = cleanName ? `${cleanName}.vercel.app` : vercelData.url;

      // Jika READY, kirim Telegram log (Hanya 1 kali)
      if (status === 'READY' && req.query.notify === 'true') {
        await sendTelegramLog({
          projectName: cleanName || projectName, 
          filesCount, 
          totalSize, 
          url: targetUrl, 
          id 
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

async function sendTelegramLog({ projectName, filesCount, totalSize, url, id }) {
  const botToken = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT;
  
  if (!botToken || !chatId) return;

  const text = `✅ <b>DEPLOY VERCEL SUKSES!</b>\n\n` +
               `📂 <b>Project:</b> ${projectName}\n` +
               `📄 <b>Files:</b> ${filesCount}\n` +
               `💾 <b>Size:</b> ${totalSize} KB\n` +
               `🌐 <b>URL:</b> https://${url}\n` +
               `🔑 <b>ID:</b> <code>${id}</code>`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (error) {
    console.error("Telegram send failed:", error);
  }
}          name: cleanProjectName,
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
        url: customUrl
      });

    } catch (error) {
      console.error("[POST Deploy] Error:", error);
      return res.status(500).json({ success: false, error: "Internal Server Error." });
    }
  } 
  
  // ==== 2. ENDPOINT GET (Check Status & Notify Telegram) ====
  else if (method === 'GET') {
    try {
      const { id, projectName, filesCount, totalSize } = req.query;

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

      if (status === 'READY' && req.query.notify === 'true') {
        await sendTelegramLog({
          projectName: cleanName || projectName, 
          filesCount, 
          totalSize, 
          url: targetUrl, 
          id
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

async function sendTelegramLog({ projectName, filesCount, totalSize, url, id }) {
  const botToken = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT;
  
  if (!botToken || !chatId) return;

  const text = `✅ <b>DEPLOY VERCEL SUKSES!</b>\n\n` +
               `📂 <b>Project:</b> ${projectName}\n` +
               `📄 <b>Files:</b> ${filesCount}\n` +
               `💾 <b>Size:</b> ${totalSize} KB\n` +
               `🌐 <b>URL:</b> https://${url}\n` +
               `🆔 <b>ID:</b> <code>${id}</code>`;

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
