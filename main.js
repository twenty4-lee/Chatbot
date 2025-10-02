const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');

const PLACEHOLDER_RESPONSES = [
    "Hello! I'm your friendly placeholder bot.",
    "Thanks for reaching out. I'm standing in until the real backend arrives.",
    "Imagine a smart Qwen 3 response here!",
    "Appreciate your message. What should we chat about next?"
];

function scrollToBottom() {
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
}

function addMessage(text, sender) {
    const bubble = document.createElement('div');
    bubble.className = `message ${sender}`;
    bubble.textContent = text;
    chatWindow.appendChild(bubble);
    scrollToBottom();
}

function handleBotReply() {
    const message = PLACEHOLDER_RESPONSES[Math.floor(Math.random() * PLACEHOLDER_RESPONSES.length)];
    setTimeout(() => addMessage(message, 'bot'), 1000);
}

chatForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = messageInput.value.trim();
    if (!text) {
        return;
    }

    addMessage(text, 'user');
    messageInput.value = '';
    messageInput.focus();
    handleBotReply();
});

messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

addMessage("Hi! I'm a placeholder bot response while we connect Qwen 3.", 'bot');
