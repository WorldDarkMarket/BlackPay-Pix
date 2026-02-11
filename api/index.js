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
        name: 'Cacau Show',
        ci: process.env.CI_CACAO,
        cs: process.env.CS_CACAO,
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Logo_Cacau_Show.svg/1200px-Logo_Cacau_Show.svg.png',
        color: '#4b2d1f'
    }
};

export default async function handler(req, res) {
    const host = req.headers.host;
    // Fallback para o seu novo domínio principal
    const client = CLIENTS[host] || CLIENTS['checkout.nextrustx.com']; 

    if (req.method === 'POST') {
        const payload = req.body;
        if (payload.status === 'COMPLETO') {
            console.log(`✅ PAGO: ${host} - ID ${payload.transactionId}`);
        }
        return res.status(200).json({ status: 'ok' });
    }

    const valorRaw = req.url.replace('/', '');
    const amount = parseFloat(valorRaw.replace(',', '.'));

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send("Insira um valor na URL. Ex: checkout.nextrustx.com/29.90");
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
            headers: {
                'ci': client.ci,
                'cs': client.cs,
                'Content-Type': 'application/json'
            }
        });

        const data = response.data.data;
        const htmlPath = path.join(process.cwd(), 'public', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // --- CORREÇÕES DE SUBSTITUIÇÃO ---
        
        // 1. Valor
        html = html.replace(/{{ valor }}/g, amount.toFixed(2));
        
        // 2. Pix Copia e Cola
        html = html.replace('{{ code }}', data.copyPaste);
        
        // 3. QR CODE (Esta é a correção principal: removemos o src falso e injetamos o Base64)
        html = html.replace('src="/static/qrcode_{{ valor }}.png"', `src="${data.qrCodeBase64}"`);
        
        // 4. Branding
        html = html.replace('NexTrustX', client.name);
        html = html.replace(/#00875F/g, client.color);
        html = html.replace('https://res.cloudinary.com/dhwqfkhzm/image/upload/v1762957978/Captura_de_tela_2025-11-11_141146_bvmsf6.png', client.logo);
        
        // 5. Link de Partilha
        html = html.replace("const PAYMENT_LINK = 'https://suaempresa.com.br/pagamento/{{ valor }}/{{ code }}';", `const PAYMENT_LINK = window.location.href;`);

        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        console.error("Erro na MisticPay:", error.response?.data || error.message);
        return res.status(500).send("Erro ao processar pagamento.");
    }
}