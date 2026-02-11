import axios from 'axios';
import fs from 'fs';
import path from 'path';

// CONFIGURAÇÃO DOS CLIENTES
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
    // Fallback caso o domínio não esteja mapeado
    const client = CLIENTS[host] || CLIENTS['checkout.nextrustx.com']; 

    // ROTA PARA WEBHOOK
    if (req.method === 'POST') {
        const payload = req.body;
        // Na MisticPay, o status de sucesso é "COMPLETO"
        if (payload.status === 'COMPLETO') {
            console.log(`✅ PAGAMENTO CONFIRMADO: ${host} - ID ${payload.transactionId} - Valor: ${payload.value}`);
        }
        return res.status(200).json({ status: 'ok' });
    }

    // CAPTURA DE VALOR NA URL
    const valorRaw = req.url.split('?')[0].replace('/', ''); // Remove query params se houver
    const amount = parseFloat(valorRaw.replace(',', '.'));

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send("Por favor, insira um valor válido na URL. Ex: checkout.nextrustx.com/29.90");
    }

    try {
        // CHAMADA API MISTICPAY
        const response = await axios.post('https://api.misticpay.com/api/transactions/create', {
            amount: amount,
            payerName: "Cliente " + client.name,
            payerDocument: "00000000000",
            transactionId: `TX-${Date.now()}`,
            description: `Pagamento via ${client.name}`,
            projectWebhook: `https://${host}/` 
        }, {
            headers: {
                'ci': client.ci,
                'cs': client.cs,
                'Content-Type': 'application/json'
            }
        });

        const data = response.data.data;

        // LEITURA DO HTML
        const htmlPath = path.join(process.cwd(), 'public', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // --- INJEÇÃO DINÂMICA (SUBSTITUIÇÕES) ---
        
        // 1. Injeta o Valor
        html = html.replace(/{{ valor }}/g, amount.toFixed(2));
        
        // 2. Injeta o Pix Copia e Cola
        html = html.replace('{{ code }}', data.copyPaste);
        
        // 3. Injeta o QR CODE (Troca o placeholder pelo Base64 real)
        html = html.replace('src="/static/qrcode_{{ valor.png }}"', `src="${data.qrCodeBase64}"`);
        // Caso o HTML tenha o nome que usamos antes:
        html = html.replace('src="/static/qrcode_{{ valor }}.png"', `src="${data.qrCodeBase64}"`);
        
        // 4. Branding & Cores
        html = html.replace(/NexTrustX/g, client.name);
        html = html.replace('--primary-color: #00875F;', `--primary-color: ${client.color};`);
        html = html.replace(/#00875F/g, client.color); // Fallback para cores no corpo do HTML
        html = html.replace('https://res.cloudinary.com/dhwqfkhzm/image/upload/v1762957978/Captura_de_tela_2025-11-11_141146_bvmsf6.png', client.logo);
        
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        console.error("Erro na Provedora de Pagamento:", error.response?.data || error.message);
        return res.status(500).send("Erro ao processar o Pix. Verifique a configuração do cliente ou tente novamente mais tarde.");
    }
}