import { createChatbot } from './chatbot.js';
import { setupChatUI } from './chat-ui.js';

const chatbot = createChatbot();
setupChatUI(chatbot);

(async () => {
    try {
        await chatbot.initialize();
    } catch (error) {
        console.error('챗봇 초기화 중 오류가 발생했습니다.', error);
    }
})();
