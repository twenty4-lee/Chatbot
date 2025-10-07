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
const dataManageList = document.getElementById('dataManageList');
const dataManageEmptyMsg = document.getElementById('dataManageEmpty');
const dataManageBtn = document.getElementById('dataManageBtn');
const dataDeleteModal = document.getElementById('dataDeleteModal');
const dataDeleteModalMessage = document.getElementById('dataDeleteModalMessage');
const dataDeleteCancelBtn = document.getElementById('dataDeleteCancelBtn');
const dataDeleteConfirmBtn = document.getElementById('dataDeleteConfirmBtn');
const dataManageModal = document.getElementById('dataManageModal');
const dataManageForm = document.getElementById('dataManageForm');
const dataManageFileInput = document.getElementById('dataManageFileInput');
const dataManageCancelBtn = document.getElementById('dataManageCancelBtn');
const dataManageError = document.getElementById('dataManageError');
const dataManageSuccessModal = document.getElementById('dataManageSuccessModal');
const dataManageSuccessCloseBtn = document.getElementById('dataManageSuccessCloseBtn');

const MENU_OPEN_CLASS = 'open';
const ALLOWED_EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xltx', '.xltm'];

export function setupChatUI(chatbot) {
    let editingConversationId = null;
    let pendingFocusChatId = null;
    let pendingDeleteChatId = null;
    let pendingDeleteEntryId = null;
    let lastErrorMessage = '';
    let latestState = chatbot.getState();
    let previousConversationId = latestState.activeConversationId;
    let isComposingMessage = false;
    let pendingSubmitAfterComposition = false;
    let shouldForceClearAfterComposition = false;

    function showDataManageError(message) {
        if (!dataManageError) {
            return;
        }
        dataManageError.textContent = message;
        dataManageError.hidden = !message;
    }

    function resetDataManageModal() {
        dataManageForm?.reset();
        showDataManageError('');
    }

    function isExcelFile(file) {
        if (!file?.name) {
            return false;
        }
        const name = file.name.toLowerCase();
        return ALLOWED_EXCEL_EXTENSIONS.some((extension) => name.endsWith(extension));
    }

    function openDataManageModal() {
        resetDataManageModal();
        dataManageModal?.removeAttribute('hidden');
        requestAnimationFrame(() => {
            dataManageFileInput?.focus();
        });
    }

    function closeDataManageModal() {
        resetDataManageModal();
        dataManageModal?.setAttribute('hidden', '');
    }

    function openDataManageSuccessModal() {
        dataManageSuccessModal?.removeAttribute('hidden');
        requestAnimationFrame(() => {
            dataManageSuccessCloseBtn?.focus();
        });
    }

    function closeDataManageSuccessModal() {
        dataManageSuccessModal?.setAttribute('hidden', '');
    }

    function openDataDeleteModal(entryId) {
        pendingDeleteEntryId = entryId;
        const entry = latestState.dataEntries.find((item) => item.id === entryId);
        if (dataDeleteModalMessage && entry) {
            dataDeleteModalMessage.textContent = `"${entry.name}" 데이터를 삭제할까요? 삭제하면 복구할 수 없습니다.`;
        }
        dataDeleteModal?.removeAttribute('hidden');
        requestAnimationFrame(() => {
            dataDeleteConfirmBtn?.focus();
        });
    }

    function closeDataDeleteModal() {
        pendingDeleteEntryId = null;
        dataDeleteModal?.setAttribute('hidden', '');
    }

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

    function clearMessageInput() {
        const reset = () => {
            messageInput.value = '';
            messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        };

        shouldForceClearAfterComposition = true;
        reset();

        setTimeout(() => {
            if (!isComposingMessage) {
                reset();
                shouldForceClearAfterComposition = false;
            }
        }, 120);
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

    function formatFileSize(bytes) {
        if (!bytes && bytes !== 0) {
            return '-';
        }
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function formatDateTime(timestamp) {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function renderDataEntries(state) {
        if (!dataManageList || !dataManageEmptyMsg) {
            return;
        }

        dataManageList.innerHTML = '';

        if (!state.dataEntries.length) {
            dataManageEmptyMsg.hidden = false;
            return;
        }

        dataManageEmptyMsg.hidden = true;

        state.dataEntries.forEach((entry) => {
            const item = document.createElement('li');
            item.className = 'data-item';

            const info = document.createElement('div');
            info.className = 'data-info';
            const name = document.createElement('span');
            name.className = 'data-name';
            name.textContent = entry.name;
            const meta = document.createElement('span');
            meta.className = 'data-meta';
            meta.textContent = `${formatFileSize(entry.size)} · ${formatDateTime(entry.uploadedAt)}`;
            info.appendChild(name);
            info.appendChild(meta);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn btn--text data-delete';
            deleteButton.dataset.entryId = entry.id;
            deleteButton.textContent = '삭제';

            item.appendChild(info);
            item.appendChild(deleteButton);
            dataManageList.appendChild(item);
        });
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

    function handleDataManageFileChange() {
        const file = dataManageFileInput?.files?.[0] ?? null;
        if (!file) {
            showDataManageError('');
            return;
        }
        if (!isExcelFile(file)) {
            showDataManageError('엑셀 형식(.xlsx, .xls 등)만 업로드할 수 있습니다.');
            dataManageFileInput.value = '';
            return;
        }
        showDataManageError('');
    }

    function handleDataManageSubmit(event) {
        event.preventDefault();
        const file = dataManageFileInput?.files?.[0] ?? null;
        if (!file) {
            showDataManageError('업로드할 엑셀 파일을 선택해주세요.');
            return;
        }
        if (!isExcelFile(file)) {
            showDataManageError('엑셀 형식(.xlsx, .xls 등)만 업로드할 수 있습니다.');
            dataManageFileInput.value = '';
            return;
        }
        showDataManageError('');
        const newEntry = chatbot.addDataEntry({ name: file.name, size: file.size, type: file.type });
        latestState = chatbot.getState();
        closeDataManageModal();
        renderDataEntries(latestState);
        if (newEntry?.id) {
            const row = dataManageList?.querySelector(`.data-delete[data-entry-id="${newEntry.id}"]`);
            row?.focus?.();
        }
        openDataManageSuccessModal();
    }

    function handleDataManageListClick(event) {
        const deleteBtn = event.target.closest('.data-delete');
        if (!deleteBtn) {
            return;
        }
        const entryId = deleteBtn.dataset.entryId;
        if (!entryId) {
            return;
        }
        openDataDeleteModal(entryId);
    }

    function handleDataDeleteConfirm() {
        if (!pendingDeleteEntryId) {
            closeDataDeleteModal();
            return;
        }
        chatbot.deleteDataEntry(pendingDeleteEntryId);
        closeDataDeleteModal();
    }

    async function handleChatSubmit(event) {
        event.preventDefault();
        pendingSubmitAfterComposition = false;
        if (latestState.isSendingMessage) {
            return;
        }
        const text = messageInput.value.trim();
        if (!text) {
            return;
        }

        clearMessageInput();
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
        messageInput.addEventListener('compositionstart', () => {
            isComposingMessage = true;
        });

        function submitMessage() {
            pendingSubmitAfterComposition = false;
            chatForm.requestSubmit();
        }

        messageInput.addEventListener('compositionend', () => {
            isComposingMessage = false;

            requestAnimationFrame(() => {
                if (shouldForceClearAfterComposition) {
                    if (messageInput.value) {
                        messageInput.value = '';
                        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    shouldForceClearAfterComposition = false;
                }
            });

            if (pendingSubmitAfterComposition) {
                submitMessage();
            }
        });

        messageInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                if (event.isComposing || isComposingMessage) {
                    pendingSubmitAfterComposition = true;
                    return;
                }
                event.preventDefault();
                submitMessage();
            }
        });

        savedChatList.addEventListener('click', handleSavedChatClick);
        savedChatList.addEventListener('keydown', handleChatEditKeydown);
        savedChatList.addEventListener('blur', handleChatEditBlur, true);

        if (dataManageList) {
            dataManageList.addEventListener('click', handleDataManageListClick);
        }

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

        if (dataManageBtn) {
            dataManageBtn.addEventListener('click', openDataManageModal);
        }

        if (dataManageCancelBtn) {
            dataManageCancelBtn.addEventListener('click', closeDataManageModal);
        }

        if (dataManageForm) {
            dataManageForm.addEventListener('submit', handleDataManageSubmit);
        }

        if (dataManageFileInput) {
            dataManageFileInput.addEventListener('change', handleDataManageFileChange);
        }

        if (dataDeleteCancelBtn) {
            dataDeleteCancelBtn.addEventListener('click', closeDataDeleteModal);
        }

        if (dataDeleteConfirmBtn) {
            dataDeleteConfirmBtn.addEventListener('click', handleDataDeleteConfirm);
        }

        if (dataManageSuccessCloseBtn) {
            dataManageSuccessCloseBtn.addEventListener('click', closeDataManageSuccessModal);
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

        if (dataManageModal) {
            dataManageModal.addEventListener('click', (event) => {
                if (event.target === dataManageModal) {
                    closeDataManageModal();
                }
            });
        }

        if (dataManageSuccessModal) {
            dataManageSuccessModal.addEventListener('click', (event) => {
                if (event.target === dataManageSuccessModal) {
                    closeDataManageSuccessModal();
                }
            });
        }

        if (dataDeleteModal) {
            dataDeleteModal.addEventListener('click', (event) => {
                if (event.target === dataDeleteModal) {
                    closeDataDeleteModal();
                }
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!deleteModal?.hasAttribute('hidden')) {
                    closeDeleteModal();
                }
                if (!dataManageModal?.hasAttribute('hidden')) {
                    closeDataManageModal();
                }
                if (!dataManageSuccessModal?.hasAttribute('hidden')) {
                    closeDataManageSuccessModal();
                }
                if (!dataDeleteModal?.hasAttribute('hidden')) {
                    closeDataDeleteModal();
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
        renderDataEntries(state);
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
            renderDataEntries(state);
            previousConversationId = state.activeConversationId;
        }
    });

    bindUI();

    // Initial render with current state
    render(latestState);
}
