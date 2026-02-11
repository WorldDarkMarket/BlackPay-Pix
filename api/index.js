const axios = require('axios');
const fs = require('fs');
const path = require('path');

// CONFIGURAÇÃO DOS CLIENTES (Adicione novos domínios aqui)
const CLIENTS = {
    'pix.codex.art': {
        name: 'Codex Art',
        ci: process.env.CI_CODEX, // Definir na Vercel
        cs: process.env.CS_CODEX, // Definir na Vercel
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
    const client = CLIENTS[host] || CLIENTS['pix.codex.art']; // Default caso o domínio não esteja na lista

    // ROTA PARA WEBHOOK (Onde a MisticPay avisa que foi pago)
    if (req.method === 'POST') {
        const payload = req.body;
        if (payload.status === 'COMPLETO') {
            console.log(`✅ PAGAMENTO CONFIRMADO: Domínio ${host} - ID ${payload.transactionId}`);
        }
        return res.status(200).json({ status: 'ok' });
    }

    // ROTA PARA GERAR PÁGINA (GET)
    const valorRaw = req.url.replace('/', '');
    const amount = parseFloat(valorRaw.replace(',', '.'));

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send("Por favor, insira um valor válido na URL. Exemplo: seu-dominio.com/29.90");
    }

    try {
        // Chamada API MisticPay
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

        // Carregar seu HTML
        const htmlPath = path.join(process.cwd(), 'public', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Substituições Dinâmicas (Branding e Dados do Pix)
        html = html.replace(/{{ valor }}/g, amount.toFixed(2));
        html = html.replace('{{ code }}', data.copyPaste);
        html = html.replace('/static/qrcode_{{ valor }}.png', data.qrCodeBase64);
        html = html.replace('NexTrustX', client.name);
        html = html.replace(/#00875F/g, client.color);
        html = html.replace('https://res.cloudinary.com/dhwqfkhzm/image/upload/v1762957978/Captura_de_tela_2025-11-11_141146_bvmsf6.png', client.logo);
        
        // Ajuste para o botão Partilhar funcionar em qualquer domínio
        html = html.replace("const PAYMENT_LINK = 'https://suaempresa.com.br/pagamento/{{ valor }}/{{ code }}';", `const PAYMENT_LINK = window.location.href;`);

        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        console.error("Erro na MisticPay:", error.response?.data || error.message);
        return res.status(500).send("Erro ao processar pagamento.");
    }
}