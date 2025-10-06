const logoutBtn = document.getElementById('logoutBtn');
const authLinks = document.getElementById('authLinks');
const authGreeting = document.getElementById('authGreeting');
const greetingLabel = document.getElementById('greetingLabel');
const homeLink = document.getElementById('homeLink');

const chatHistory = document.getElementById('chatHistory');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const savedChatList = document.getElementById('savedChatList');
const savedEmptyMsg = document.getElementById('savedEmptyMsg');
const modelButtons = document.querySelectorAll('.model-button');
const modelActiveLabel = document.getElementById('modelActiveLabel');
const newChatBtn = document.getElementById('newChatBtn');
const deleteModal = document.getElementById('deleteModal');
const deleteModalMessage = document.getElementById('deleteModalMessage');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

const MENU_OPEN_CLASS = 'open';

export function setupChatUI(chatbot) {
    let editingConversationId = null;
    let pendingFocusChatId = null;
    let pendingDeleteChatId = null;
    let lastErrorMessage = '';
    let latestState = chatbot.getState();
    let previousConversationId = latestState.activeConversationId;

    function getActiveConversation(state) {
        return state.conversations.find((item) => item.id === state.activeConversationId) ?? null;
    }

    function resetChatHistory() {
        chatHistory.innerHTML = '';
    }

    function appendMessage(text, sender, options = {}) {
        const { cssClass = '' } = options;
        const bubble = document.createElement('div');
        bubble.className = `chat-message ${sender}`;
        if (cssClass) {
            bubble.classList.add(cssClass);
        }
        bubble.textContent = text;
        chatHistory.appendChild(bubble);
        return bubble;
    }

    function scrollChatToBottom() {
        chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: 'smooth' });
    }

    function displayWelcomeMessage() {
        resetChatHistory();
        appendMessage('안녕하세요! Channel Console 챗봇입니다.', 'bot');
        appendMessage('메시지를 입력하면 대화가 자동으로 저장됩니다.', 'bot');
    }

    function formatConversationTitle(conversation) {
        const date = new Date(conversation.createdAt || Date.now());
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function renderConversation(state) {
        const conversation = getActiveConversation(state);
        resetChatHistory();

        if (!conversation || !conversation.messages.length) {
            displayWelcomeMessage();
        } else {
            conversation.messages.forEach((message) => {
                appendMessage(message.text, message.sender);
            });
        }

        if (state.isSendingMessage) {
            lastErrorMessage = '';
            appendMessage('모델이 응답 중입니다…', 'bot', { cssClass: 'pending' });
        } else if (lastErrorMessage) {
            appendMessage(lastErrorMessage, 'bot', { cssClass: 'error' });
        }

        scrollChatToBottom();
    }

    function renderSavedChats(state) {
        savedChatList.innerHTML = '';

        if (!state.conversations.length) {
            savedEmptyMsg.hidden = false;
            return;
        }

        savedEmptyMsg.hidden = true;

        state.conversations.forEach((conversation) => {
            const item = document.createElement('li');
            const wrapper = document.createElement('div');
            wrapper.className = 'chat-item';
            if (conversation.id === state.activeConversationId) {
                wrapper.classList.add('active');
            }

            if (conversation.id === editingConversationId) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'chat-edit-input';
                input.dataset.chatId = conversation.id;
                input.value = conversation.title || formatConversationTitle(conversation);
                wrapper.appendChild(input);
                pendingFocusChatId = conversation.id;
            } else {
                const selectBtn = document.createElement('button');
                selectBtn.type = 'button';
                selectBtn.className = 'chat-select';
                selectBtn.dataset.chatId = conversation.id;
                selectBtn.textContent = conversation.title || formatConversationTitle(conversation);
                wrapper.appendChild(selectBtn);
            }

            const menuTrigger = document.createElement('button');
            menuTrigger.type = 'button';
            menuTrigger.className = 'chat-menu-trigger';
            menuTrigger.dataset.chatId = conversation.id;
            menuTrigger.setAttribute('aria-label', '채팅 메뉴');
            menuTrigger.textContent = '⋯';

            const menu = document.createElement('div');
            menu.className = 'chat-menu';
            menu.dataset.chatId = conversation.id;

            const renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.dataset.action = 'rename';
            renameBtn.dataset.chatId = conversation.id;
            renameBtn.textContent = '이름 변경';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.dataset.action = 'delete';
            deleteBtn.dataset.chatId = conversation.id;
            deleteBtn.textContent = '삭제';

            menu.appendChild(renameBtn);
            menu.appendChild(deleteBtn);

            wrapper.appendChild(menuTrigger);
            wrapper.appendChild(menu);
            item.appendChild(wrapper);
            savedChatList.appendChild(item);
        });

        if (pendingFocusChatId) {
            requestAnimationFrame(() => {
                const input = savedChatList.querySelector(`.chat-edit-input[data-chat-id="${pendingFocusChatId}"]`);
                if (input) {
                    input.focus();
                    input.select();
                }
                pendingFocusChatId = null;
            });
        }
    }

    function updateAuthUI(state) {
        const displayName = state.currentUser?.email?.split('@')[0] ?? '게스트';
        if (authGreeting) {
            greetingLabel.textContent = `${displayName}님 안녕하세요!`;
            authGreeting.hidden = !state.isAuthenticated;
            authGreeting.style.display = state.isAuthenticated ? 'inline-flex' : 'none';
        }
        if (authLinks) {
            authLinks.hidden = state.isAuthenticated;
            authLinks.style.display = state.isAuthenticated ? 'none' : 'inline-flex';
        }
        if (homeLink) {
            homeLink.hidden = false;
            homeLink.style.display = 'inline-flex';
        }
    }

    function applyModelSelection(state) {
        if (modelButtons && modelButtons.length) {
            modelButtons.forEach((button) => {
                const isActive = button.dataset.modelId === state.selectedModelId;
                button.classList.toggle('active', isActive);
            });
        }
        if (modelActiveLabel) {
            const name = state.modelDisplayNames[state.selectedModelId] || state.selectedModelId;
            modelActiveLabel.textContent = `현재 선택: ${name}`;
        }
    }

    function closeAllChatMenus() {
        savedChatList.querySelectorAll(`.chat-menu.${MENU_OPEN_CLASS}`).forEach((menu) => {
            menu.classList.remove(MENU_OPEN_CLASS);
        });
    }

    function openDeleteModal(chatId) {
        pendingDeleteChatId = chatId;
        const conversation = latestState.conversations.find((item) => item.id === chatId);
        const title = conversation ? (conversation.title || formatConversationTitle(conversation)) : '선택한 대화';
        if (deleteModalMessage) {
            deleteModalMessage.textContent = `"${title}" 대화를 삭제할까요? 삭제하면 복구할 수 없습니다.`;
        }
        deleteModal?.removeAttribute('hidden');
    }

    function closeDeleteModal() {
        pendingDeleteChatId = null;
        deleteModal?.setAttribute('hidden', '');
    }

    function handleChatMenuAction(action, chatId) {
        if (action === 'rename') {
            editingConversationId = chatId;
            renderSavedChats(latestState);
        } else if (action === 'delete') {
            closeAllChatMenus();
            openDeleteModal(chatId);
        }
    }

    function commitChatRename(chatId, value) {
        editingConversationId = null;
        chatbot.renameConversation(chatId, value);
    }

    function cancelChatRename() {
        if (editingConversationId === null) {
            return;
        }
        editingConversationId = null;
        renderSavedChats(latestState);
    }

    function handleSavedChatClick(event) {
        const menuTrigger = event.target.closest('.chat-menu-trigger');
        if (menuTrigger) {
            const menu = menuTrigger.parentElement.querySelector('.chat-menu');
            const isOpen = menu.classList.contains(MENU_OPEN_CLASS);
            closeAllChatMenus();
            if (!isOpen) {
                menu.classList.add(MENU_OPEN_CLASS);
            }
            event.stopPropagation();
            return;
        }

        const menuAction = event.target.closest('.chat-menu button[data-action]');
        if (menuAction) {
            const { action, chatId } = menuAction.dataset;
            handleChatMenuAction(action, chatId);
            closeAllChatMenus();
            event.stopPropagation();
            return;
        }

        const selectBtn = event.target.closest('.chat-select');
        if (selectBtn) {
            closeAllChatMenus();
            chatbot.selectConversation(selectBtn.dataset.chatId);
        }

        const editInput = event.target.closest('.chat-edit-input');
        if (editInput) {
            event.stopPropagation();
        }
    }

    function handleChatEditKeydown(event) {
        const input = event.target.closest('.chat-edit-input');
        if (!input) {
            return;
        }
        const chatId = input.dataset.chatId;
        if (event.key === 'Enter') {
            event.preventDefault();
            commitChatRename(chatId, input.value);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelChatRename();
        }
    }

    function handleChatEditBlur(event) {
        const input = event.target.closest('.chat-edit-input');
        if (!input) {
            return;
        }
        commitChatRename(input.dataset.chatId, input.value);
    }

    async function handleChatSubmit(event) {
        event.preventDefault();
        if (latestState.isSendingMessage) {
            return;
        }
        const text = messageInput.value.trim();
        if (!text) {
            return;
        }

        messageInput.value = '';
        lastErrorMessage = '';
        try {
            await chatbot.sendMessage(text);
        } catch (error) {
            console.error(error);
            lastErrorMessage = '모델 응답 중 오류가 발생했습니다.';
        }
    }

    function handleModelSelection(event) {
        const target = event.target.closest('.model-button');
        if (!target) {
            return;
        }
        const { modelId } = target.dataset;
        if (!modelId || modelId === latestState.selectedModelId) {
            return;
        }
        chatbot.selectModel(modelId);
    }

    function setupTabGroups() {
        document.querySelectorAll('.column').forEach((column) => {
            const buttons = column.querySelectorAll('.tab-button');
            const panels = column.querySelectorAll('[data-tab-content]');
            if (!buttons.length || !panels.length) {
                return;
            }

            let current = Array.from(buttons).find((button) => button.classList.contains('active'))?.dataset.tabTarget;
            if (!current) {
                current = buttons[0].dataset.tabTarget;
            }

            function activate(target) {
                buttons.forEach((button) => {
                    const isActive = button.dataset.tabTarget === target;
                    button.classList.toggle('active', isActive);
                    button.setAttribute('aria-selected', String(isActive));
                });

                panels.forEach((panel) => {
                    panel.hidden = panel.dataset.tabContent !== target;
                });

                current = target;
            }

            buttons.forEach((button) => {
                button.addEventListener('click', () => {
                    const target = button.dataset.tabTarget;
                    if (!target || target === current) {
                        return;
                    }
                    activate(target);
                });
            });
        });
    }

    function bindUI() {
        setupTabGroups();

        chatForm.addEventListener('submit', handleChatSubmit);
        messageInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                chatForm.requestSubmit();
            }
        });

        savedChatList.addEventListener('click', handleSavedChatClick);
        savedChatList.addEventListener('keydown', handleChatEditKeydown);
        savedChatList.addEventListener('blur', handleChatEditBlur, true);

        const modelOptions = document.getElementById('modelOptions');
        if (modelButtons.length && modelOptions) {
            modelOptions.addEventListener('click', handleModelSelection);
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                const conversation = chatbot.createConversation();
                editingConversationId = conversation.id;
                lastErrorMessage = '';
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                chatbot.logout();
            });
        }

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.chat-item')) {
                closeAllChatMenus();
            }
        });

        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', closeDeleteModal);
        }

        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                if (pendingDeleteChatId) {
                    chatbot.deleteConversation(pendingDeleteChatId);
                }
                closeDeleteModal();
            });
        }

        if (deleteModal) {
            deleteModal.addEventListener('click', (event) => {
                if (event.target === deleteModal) {
                    closeDeleteModal();
                }
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!deleteModal?.hasAttribute('hidden')) {
                    closeDeleteModal();
                }
                cancelChatRename();
                closeAllChatMenus();
            }
        });
    }

    function render(state) {
        if (state.activeConversationId !== previousConversationId) {
            lastErrorMessage = '';
        }
        latestState = state;
        updateAuthUI(state);
        applyModelSelection(state);
        renderSavedChats(state);
        renderConversation(state);
        previousConversationId = state.activeConversationId;
    }

    chatbot.subscribe((state) => {
        latestState = state;
        if (!editingConversationId) {
            render(state);
        } else {
            updateAuthUI(state);
            applyModelSelection(state);
            renderSavedChats(state);
            renderConversation(state);
            previousConversationId = state.activeConversationId;
        }
    });

    bindUI();

    // Initial render with current state
    render(latestState);
}
