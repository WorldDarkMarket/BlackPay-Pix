import axios from 'axios';
import fs from 'fs';
import path from 'path';

const CLIENTS = {
    'checkout.nextrustx.com': {
        name: 'NexTrustX',
        ci: process.env.CI_NEXTRUSTX,
        cs: process.env.CS_NEXTRUSTX,
        logo: 'https://res.cloudinary.com/dhwqfkhzm/image/upload/v1762957978/Captura_de_tela_2025-11-11_141146_bvmsf6.png',
        color: '#00875F'
    },
    'pagamento.cacaushow.fun': {
        name: 'CacauShow',
        ci: process.env.CI_CACAO,
        cs: process.env.CS_CACAO,
        logo: 'https://files.catbox.moe/8tsf1t.jpg',
        color: '#4b2d1f'
    }
};

export default async function handler(req, res) {
    const host = req.headers.host;
    const client = CLIENTS[host] || CLIENTS['checkout.nextrustx.com'];

    if (req.method === 'POST') {
        return res.status(200).json({ status: 'ok' });
    }

    const valorRaw = req.url.split('?')[0].replace('/', '');
    const amount = parseFloat(valorRaw.replace(',', '.'));

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send("Valor inválido na URL.");
    }

    try {
        const response = await axios.post('https://api.misticpay.com/api/transactions/create', {
            amount: amount,
            payerName: "Cliente " + client.name,
            payerDocument: "00000000000",
            transactionId: `TX-${Date.now()}`,
            description: `Pagamento via ${client.name}`,
            projectWebhook: `https://${host}/`
        }, {
            headers: { 'ci': client.ci, 'cs': client.cs, 'Content-Type': 'application/json' }
        });

        const data = response.data.data;
        const htmlPath = path.join(process.cwd(), 'public', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // SUBSTITUIÇÕES BLINDADAS
        html = html.replace(/{{ valor }}/g, amount.toFixed(2));
        html = html.replace(/{{ code }}/g, data.copyPaste);
        html = html.replace(/{{ clientName }}/g, client.name);
        
        // Injeção de Imagens via Marcadores Únicos
        const qrCodeImg = data.qrCodeBase64.startsWith('data:') ? data.qrCodeBase64 : `data:image/png;base64,${data.qrCodeBase64}`;
        html = html.replace('ID_DO_QRCODE', qrCodeImg);
        html = html.replace('ID_DA_LOGO', client.logo);

        // Injeção de Cores
        html = html.replace('--primary-color: #00875F;', `--primary-color: ${client.color};`);
        html = html.replace(/#00875F/g, client.color);

        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        console.error("ERRO CRÍTICO:", error.response?.data || error.message);
        return res.status(500).send("Erro técnico ao gerar o Pix. Verifique os logs.");
    }
}