const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;
const API_KEY = import.meta.env.VITE_EVOLUTION_API_KEY;
const INSTANCE = import.meta.env.VITE_EVOLUTION_INSTANCE;
const DEFAULT_RECIPIENT = import.meta.env.VITE_WHATSAPP_DEFAULT_RECIPIENT;

export const whatsappService = {
  sendText: async (text: string, customNumber?: string): Promise<boolean> => {
    try {
      let recipient = (customNumber || DEFAULT_RECIPIENT || '').trim();
      
      // Se for um número de telefone comum, remove caracteres não-numéricos.
      // Se for um ID de grupo (contendo '@'), mantém o ID original intacto.
      if (!recipient.includes('@')) {
        recipient = recipient.replace(/\D/g, '');
      }
      
      if (!recipient) {
        throw new Error('Nenhum destinatário de WhatsApp configurado.');
      }

      if (!API_URL || API_URL.includes('SUA_URL_DA_RAILWAY')) {
        throw new Error('Evolution API URL não configurada ou inválida no arquivo .env.');
      }

      const response = await fetch(`${API_URL}/message/sendText/${INSTANCE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': API_KEY || ''
        },
        body: JSON.stringify({
          number: recipient,
          text: text,
          delay: 1200,
          linkPreview: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro na resposta da API (${response.status}): ${errorText}`);
      }

      return true;
    } catch (error) {
      console.error('Falha ao enviar WhatsApp:', error);
      throw error;
    }
  }
};
