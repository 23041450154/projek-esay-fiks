/**
 * SafeSpace - Frontend Application
 * Handles authentication, navigation, and feature interactions
 */

// ============================================
// State Management
// ============================================
const state = {
  user: null,
  currentTab: 'companions',
  currentSessionId: null,
  currentSession: null,
  lastMessageTime: null,
  pollingInterval: null,
  realtimeChannel: null,
  sessions: [],
  messages: [],
  journals: [],
  moods: [],
  companions: [],
  selectedCompanionId: null,
  isSendingMessage: false,
};

// ============================================
// API Helpers
// ============================================
async function api(endpoint, options = {}) {
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  const response = await fetch(`/api${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// ============================================
// Loading Overlay
// ============================================
let loadingCount = 0;

function showLoading() {
  loadingCount++;
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  }
}

// ============================================
// Authentication
// ============================================
async function checkAuth() {
  try {
    const data = await api('/me');
    state.user = data.user;

    if (!state.user.hasConsented) {
      window.location.href = '/onboarding.html';
      return false;
    }

    document.getElementById('userName').textContent = state.user.displayName;
    return true;
  } catch (err) {
    window.location.href = '/landing.html';
    return false;
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
  // Redirect regardless of result
  window.location.href = '/landing.html';
}

// ============================================
// Navigation
// ============================================
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId, saveToStorage = true) {
  // Update nav tabs
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });

  // Update content
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  state.currentTab = tabId;
  
  // Save tab to localStorage for persistence across reloads
  if (saveToStorage) {
    localStorage.setItem('rd_app_last_tab', tabId);
  }

  // Toggle chat-lock class for body scroll behavior
  if (tabId === 'chat') {
    document.body.classList.add('chat-lock');
    setAppHeight(); // Recalculate app height for chat
    
    // On mobile, reset to list view when entering chat tab
    if (window.innerWidth <= 768 && !state.currentSessionId) {
      const chatLayout = document.getElementById('chatLayout');
      if (chatLayout) {
        chatLayout.classList.remove('viewing-chat');
      }
    }
  } else {
    document.body.classList.remove('chat-lock');
    
    // Reset chat mobile view when leaving chat tab
    const chatLayout = document.getElementById('chatLayout');
    if (chatLayout) {
      chatLayout.classList.remove('viewing-chat');
    }
  }

  // Load tab data only when switching tabs (without loading overlay for better UX)
  switch (tabId) {
    case 'companions':
      loadCompanionsTab();
      break;
    case 'chat':
      // Only load sessions list, don't auto-load messages
      loadSessions();
      // Stop polling if no session selected
      if (!state.currentSessionId) {
        stopPolling();
      }
      break;
    case 'journal':
      loadJournals();
      break;
    case 'mood':
      loadMoods();
      break;
    case 'insight':
      loadInsightData();
      break;
  }
}

// ============================================
// Chat Feature
// ============================================
async function loadSessions() {
  try {
    const data = await api('/chat/sessions');
    state.sessions = data.sessions;
    renderSessions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSessions() {
  const container = document.getElementById('sessionList');

  if (state.sessions.length === 0) {
    container.innerHTML = `
      <div class="session-empty">
        <div class="session-empty-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
        </div>
        <h4 class="session-empty-title">Belum ada chat</h4>
        <p class="session-empty-desc">Tekan tombol + untuk memulai percakapan baru</p>
      </div>
    `;
    return;
  }

  // Group sessions by companion
  const withCompanion = state.sessions.filter(s => s.companionName);
  const withoutCompanion = state.sessions.filter(s => !s.companionName);

  let html = '';

  // Sessions with companion (Teman Ngobrol)
  if (withCompanion.length > 0) {
    html += '<div class="session-section-label">Teman Ngobrol</div>';
    html += withCompanion.map(session => renderChatItem(session, 'companion')).join('');
  }

  // Sessions without companion (Grup)
  if (withoutCompanion.length > 0) {
    html += '<div class="session-section-label">Grup</div>';
    html += withoutCompanion.map(session => renderChatItem(session, 'group')).join('');
  }

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.chat-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectSession(item.dataset.sessionId);
    });
  });
}

function renderChatItem(session, type) {
  const isActive = session.sessionId === state.currentSessionId;
  const preview = session.lastMessage || 'Belum ada pesan';
  const time = formatChatTime(session.lastMessageAt || session.createdAt);
  const unread = session.unreadCount || 0;
  
  // Avatar content
  const avatarIcon = type === 'companion' 
    ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`
    : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`;
  
  // Title - show companion name for companion chats, topic for group
  const title = type === 'companion' ? session.companionName : session.topic;
  
  // Preview - show topic for companion chats, last message for all
  const previewText = type === 'companion' 
    ? `<span class="chat-item-companion">${escapeHtml(session.topic)}</span>` 
    : escapeHtml(preview);

  return `
    <div class="chat-item ${isActive ? 'active' : ''}" data-session-id="${session.sessionId}">
      <div class="chat-item-avatar ${type}">
        ${avatarIcon}
      </div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <span class="chat-item-title">${escapeHtml(title)}</span>
          <span class="chat-item-time ${unread > 0 ? 'unread' : ''}">${time}</span>
        </div>
        <div class="chat-item-footer">
          <span class="chat-item-preview ${unread > 0 ? 'unread' : ''}">${previewText}</span>
          ${unread > 0 ? `<span class="chat-item-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function formatChatTime(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const chatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (chatDate.getTime() === today.getTime()) {
    // Today - show time
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } else if (chatDate.getTime() === yesterday.getTime()) {
    // Yesterday
    return 'Kemarin';
  } else if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
    // Within a week - show day name
    return date.toLocaleDateString('id-ID', { weekday: 'short' });
  } else {
    // Older - show date
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
  }
}

// ============================================
// Companions Feature
// ============================================
async function loadCompanions() {
  try {
    const data = await api('/companions');
    state.companions = data.companions || [];
    renderCompanions();
  } catch (err) {
    console.error('Failed to load companions:', err);
    state.companions = [];
    renderCompanions();
  }
}

async function loadCompanionsTab() {
  try {
    const data = await api('/companions');
    state.companions = data.companions || [];
    updateListenerCard();
  } catch (err) {
    console.error('Failed to load companions:', err);
    updateListenerCard(true); // Show error state
  }
}

function updateListenerCard(error = false) {
  const avatarsContainer = document.getElementById('listenerAvatars');
  const countText = document.getElementById('listenerCount');
  const statusText = document.getElementById('listenerStatusText');
  const responseTime = document.getElementById('responseTime');
  const statusDot = document.querySelector('.listener-status .status-dot');
  
  if (error || state.companions.length === 0) {
    // No listeners available
    if (avatarsContainer) {
      avatarsContainer.innerHTML = `
        <div class="listener-avatar" style="background: var(--surface-alt); color: var(--text-muted);">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
      `;
    }
    if (countText) countText.textContent = 'Pendengar sedang tidak tersedia';
    if (statusText) statusText.textContent = 'Tidak tersedia';
    if (statusDot) {
      statusDot.classList.remove('active');
      statusDot.classList.add('busy');
    }
    if (responseTime) responseTime.textContent = 'Coba lagi nanti';
    return;
  }
  
  // Show available listeners
  const displayCompanions = state.companions.slice(0, 3);
  const remaining = state.companions.length - 3;
  
  if (avatarsContainer) {
    avatarsContainer.innerHTML = displayCompanions.map(c => `
      <div class="listener-avatar">${c.name.charAt(0).toUpperCase()}</div>
    `).join('') + (remaining > 0 ? `
      <div class="listener-avatar listener-avatar-more">+${remaining}</div>
    ` : '');
  }
  
  if (countText) {
    const count = state.companions.length;
    countText.textContent = `${count} pendengar siap menemanimu`;
  }
  
  if (statusText) statusText.textContent = 'Pendengar tersedia';
  if (statusDot) {
    statusDot.classList.remove('busy');
    statusDot.classList.add('active');
  }
  if (responseTime) responseTime.textContent = 'Respon dalam beberapa menit';
}

function openCompanionChatModal(companionId, companionName) {
  // Close the picker if open
  closeListenerPicker();
  
  // Check if there's already an existing chat with this companion
  const existingSession = state.sessions.find(
    session => session.companionId === companionId
  );

  if (existingSession) {
    // If chat exists, switch to chat tab and open that session
    switchTab('chat');
    selectSession(existingSession.sessionId);
    showToast('Membuka chat dengan ' + companionName, 'success');
  } else {
    // If no existing chat, open modal to create new chat
    state.selectedCompanionId = companionId;
    document.getElementById('selectedCompanionName').textContent = companionName;
    document.getElementById('companionChatModal').hidden = false;
    document.getElementById('companionChatTopic').focus();
  }
}

// ============================================
// New Chat Options Bottom Sheet
// ============================================
function openNewChatOptions() {
  const overlay = document.getElementById('newChatOptionsOverlay');
  if (!overlay) return;
  
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeNewChatOptions() {
  const overlay = document.getElementById('newChatOptionsOverlay');
  if (!overlay) return;
  
  overlay.hidden = true;
  document.body.style.overflow = '';
}

// ============================================
// Listener Picker Bottom Sheet
// ============================================
function openListenerPicker() {
  const overlay = document.getElementById('listenerPickerOverlay');
  if (!overlay) return;
  
  // Render the list first
  renderListenerPicker();
  
  // Show the picker
  overlay.hidden = false;
  document.body.style.overflow = 'hidden'; // Prevent background scroll
  
  // Focus trap - focus the close button
  const closeBtn = document.getElementById('btnClosePicker');
  if (closeBtn) {
    setTimeout(() => closeBtn.focus(), 100);
  }
}

function closeListenerPicker() {
  const overlay = document.getElementById('listenerPickerOverlay');
  if (!overlay) return;
  
  overlay.hidden = true;
  document.body.style.overflow = ''; // Restore scroll
}

function renderListenerPicker() {
  const container = document.getElementById('pickerList');
  if (!container) return;
  
  if (state.companions.length === 0) {
    container.innerHTML = `
      <div class="picker-empty">
        <div class="picker-empty-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h4 class="picker-empty-title">Belum ada pendengar tersedia</h4>
        <p class="picker-empty-desc">Pendengar sedang tidak online. Silakan coba lagi nanti.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = state.companions.map(c => {
    const isOnline = true; // You can add online status logic here
    const responseTime = 'Respon cepat'; // You can customize this per companion
    
    return `
      <div class="listener-item" data-companion-id="${c.companion_id}" data-companion-name="${escapeHtml(c.name)}">
        <div class="listener-item-avatar">
          ${c.name.charAt(0).toUpperCase()}
          <span class="listener-item-status-badge ${isOnline ? '' : 'offline'}"></span>
        </div>
        <div class="listener-item-info">
          <div class="listener-item-name">${escapeHtml(c.name)}</div>
          <div class="listener-item-meta">
            <span class="listener-item-status ${isOnline ? '' : 'offline'}">
              ${isOnline ? 'Aktif' : 'Offline'}
            </span>
            <span class="listener-item-response">${responseTime}</span>
          </div>
        </div>
        <button class="btn-select-listener" data-companion-id="${c.companion_id}" data-companion-name="${escapeHtml(c.name)}">
          Pilih
        </button>
      </div>
    `;
  }).join('');
  
  // Add click handlers to items and buttons
  container.querySelectorAll('.listener-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn-select-listener')) {
        const companionId = item.dataset.companionId;
        const companionName = item.dataset.companionName;
        openCompanionChatModal(companionId, companionName);
      }
    });
  });
  
  container.querySelectorAll('.btn-select-listener').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const companionId = btn.dataset.companionId;
      const companionName = btn.dataset.companionName;
      openCompanionChatModal(companionId, companionName);
    });
  });
}

function renderCompanions() {
  const container = document.getElementById('companionList');
  
  if (state.companions.length === 0) {
    container.innerHTML = '<p class="text-muted">Tidak ada teman ngobrol tersedia</p>';
    return;
  }

  container.innerHTML = `
    <label class="companion-option ${!state.selectedCompanionId ? 'selected' : ''}" data-companion-id="">
      <input type="radio" name="companion" value="" ${!state.selectedCompanionId ? 'checked' : ''}>
      <div class="companion-avatar">?</div>
      <div class="companion-info">
        <div class="companion-name">Tanpa Teman Ngobrol</div>
        <div class="companion-specialty">Chat dengan user lain saja</div>
      </div>
    </label>
    ${state.companions.map(c => `
      <label class="companion-option ${state.selectedCompanionId === c.companion_id ? 'selected' : ''}" data-companion-id="${c.companion_id}">
        <input type="radio" name="companion" value="${c.companion_id}" ${state.selectedCompanionId === c.companion_id ? 'checked' : ''}>
        <div class="companion-avatar">${c.name.charAt(0)}</div>
        <div class="companion-info">
          <div class="companion-name">${escapeHtml(c.name)}</div>
          <div class="companion-specialty">${escapeHtml(c.specialty || '')}</div>
        </div>
      </label>
    `).join('')}
  `;

  // Add click handlers
  container.querySelectorAll('.companion-option').forEach((option) => {
    option.addEventListener('click', () => {
      state.selectedCompanionId = option.dataset.companionId || null;
      // Update selected state
      container.querySelectorAll('.companion-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    });
  });
}

async function selectSession(sessionId) {
  // Stop polling for previous session
  stopPolling();
  
  // Reset state for new session
  state.currentSessionId = sessionId;
  state.currentSession = state.sessions.find(s => s.sessionId === sessionId) || null;
  state.lastMessageTime = null;
  state.messages = [];
  
  // Save current room to localStorage for persistence across reloads
  localStorage.setItem('rd_app_last_room', sessionId);
  localStorage.setItem('rd_app_last_tab', 'chat');

  // Update UI - update both old and new class names for compatibility
  document.querySelectorAll('.session-item, .chat-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.sessionId === sessionId);
  });

  // Show chat header and input
  const chatHeader = document.getElementById('chatHeader');
  const chatInputArea = document.getElementById('chatInputArea');
  
  chatHeader.hidden = false;
  chatInputArea.hidden = false;
  
  // Mobile: Show chat view, hide sidebar
  if (window.innerWidth <= 768) {
    const chatLayout = document.getElementById('chatLayout');
    if (chatLayout) {
      chatLayout.classList.add('viewing-chat');
    }
    chatInputArea.style.display = 'block';
  }

  // Find session and update header
  const session = state.sessions.find((s) => s.sessionId === sessionId);
  if (session) {
    const topicEl = document.getElementById('chatTopic');
    if (session.companionName) {
      topicEl.innerHTML = `${escapeHtml(session.topic)} <span class="companion-badge">${escapeHtml(session.companionName)}</span>`;
    } else {
      topicEl.textContent = session.topic;
    }
    
    // Show delete button if user is the creator
    const deleteBtn = document.getElementById('deleteChatBtn');
    if (deleteBtn) {
      deleteBtn.style.display = session.createdBy === state.user?.userId ? 'block' : 'none';
    }
  }

  // Load messages
  await loadMessages();

  // Start polling
  startPolling();
}

async function loadMessages(forceScroll = false) {
  if (!state.currentSessionId) return;

  try {
    let endpoint = `/chat/messages?sessionId=${state.currentSessionId}`;
    if (state.lastMessageTime) {
      endpoint += `&after=${encodeURIComponent(state.lastMessageTime)}`;
    }

    const data = await api(endpoint);
    const isInitialLoad = !state.lastMessageTime;

    if (state.lastMessageTime && data.messages.length > 0) {
      // Append new messages, but deduplicate by messageId
      const existingIds = new Set(state.messages.map(m => m.messageId));
      const newMessages = data.messages.filter(m => !existingIds.has(m.messageId));
      
      if (newMessages.length > 0) {
        state.messages = [...state.messages, ...newMessages];
        console.log('New messages received:', newMessages.length);
        
        // Update last message time to the newest message
        state.lastMessageTime = newMessages[newMessages.length - 1].createdAt;
        
        // Render and scroll to new messages
        renderMessages(false);
      }
    } else if (!state.lastMessageTime) {
      // Initial load - replace all messages
      state.messages = data.messages;
      
      // Update last message time
      if (data.messages.length > 0) {
        state.lastMessageTime = data.messages[data.messages.length - 1].createdAt;
      } else {
        state.lastMessageTime = data.serverTime;
      }
      
      // Render with scroll to bottom
      renderMessages(true);
    }

    // Check if room is closed (from session info in response)
    if (data.session && data.session.status === 'closed') {
      handleClosedRoom();
    }
  } catch (err) {
    console.error('Failed to load messages:', err);
    // If error mentions closed room, handle it
    if (err.message && err.message.includes('ditutup')) {
      handleClosedRoom();
    }
  }
}

/**
 * Handle closed room state - show banner and disable input
 */
function handleClosedRoom() {
  const chatInputArea = document.getElementById('chatInputArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (chatInputArea) {
    // Replace input area with closed banner
    chatInputArea.innerHTML = `
      <div class="chat-closed-banner">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
        <span>Ruang grup ini telah ditutup oleh pendamping.</span>
      </div>
    `;
    chatInputArea.hidden = false;
  }

  // Clear room from localStorage since it's closed
  localStorage.removeItem('rd_app_last_room');

  // Stop polling for closed rooms
  stopPolling();
}

/**
 * Enable chat input (restore normal state)
 */
function enableChatInput() {
  const chatInputArea = document.getElementById('chatInputArea');
  
  // Check if it has the closed banner, if so restore normal input
  if (chatInputArea && chatInputArea.querySelector('.chat-closed-banner')) {
    chatInputArea.innerHTML = `
      <form id="messageForm">
        <textarea id="messageInput" placeholder="Ceritakan apa yang kamu rasakan..." rows="1"></textarea>
        <button type="submit" class="btn btn-primary btn-send">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
          </svg>
        </button>
      </form>
    `;
    // Re-attach form submit handler
    const form = document.getElementById('messageForm');
    if (form) {
      form.addEventListener('submit', handleMessageSubmit);
    }
  }
}

/**
 * Check if user is near bottom of chat (within threshold)
 * @param {HTMLElement} container - The messages container
 * @param {number} threshold - Pixels from bottom to consider "near bottom"
 * @returns {boolean}
 */
function isNearBottom(container, threshold = 120) {
  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

/**
 * Scroll to bottom of chat messages
 * @param {HTMLElement} container - The messages container
 * @param {boolean} smooth - Whether to use smooth scrolling
 */
function scrollToBottom(container, smooth = false) {
  if (smooth) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  } else {
    container.scrollTop = container.scrollHeight;
  }
}

function renderMessages(forceScroll = false) {
  const container = document.getElementById('messagesContainer');

  if (state.messages.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Belum ada pesan. Mulai bercerita!</p>';
    return;
  }

  // Check if user is near bottom before rendering
  const wasNearBottom = isNearBottom(container);

  container.innerHTML = state.messages
    .map(
      (msg) => {
        const time = new Date(msg.createdAt);
        const timeStr = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        // System message (e.g., room closed notification)
        if (msg.isSystem) {
          return `
    <div class="message message-system">
      <div class="message-text">${escapeHtml(msg.text)}</div>
    </div>
  `;
        }
        
        // Status icon for own messages
        let statusIcon = '';
        if (msg.isOwn) {
          statusIcon = '<span class="message-status read"></span>';
        }
        
        return `
    <div class="message ${msg.isOwn ? 'message-self' : 'message-other'}">
      ${!msg.isOwn ? `<div class="message-sender">${escapeHtml(msg.displayName)}</div>` : ''}
      <div class="message-text">${escapeHtml(msg.text)}</div>
      <div class="message-time">${timeStr} ${statusIcon}</div>
    </div>
  `;
      }
    )
    .join('');

  // Auto-scroll logic:
  // - Force scroll on initial load or when user sends message
  // - Smooth scroll if user was near bottom (receiving new messages)
  // - Don't scroll if user is reading older messages
  if (forceScroll) {
    // Use timeout to ensure DOM is updated before scrolling
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 50);
  } else if (wasNearBottom) {
    setTimeout(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }, 50);
  }
}

function startPolling() {
  // Only start polling if there's an active session
  if (!state.currentSessionId) {
    return;
  }

  // Clear existing interval first to prevent duplicates
  stopPolling();

  // Poll every 1.5 seconds for new messages (fast enough for real-time feel)
  state.pollingInterval = setInterval(async () => {
    // Only poll if we have an active session and are on chat tab
    if (state.currentSessionId) {
      try {
        await loadMessages();
      } catch (err) {
        console.error('Polling error:', err);
      }
    }
  }, 1500);
  
  console.log('Polling started for session:', state.currentSessionId);
}

function stopPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
    console.log('Polling stopped');
  }
}

async function sendMessage(text) {
  if (!state.currentSessionId || !text.trim()) return false;

  // Prevent duplicate sends
  if (state.isSendingMessage) {
    return false;
  }

  try {
    state.isSendingMessage = true;

    const data = await api('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.currentSessionId,
        text: text.trim(),
      }),
    });

    // Immediately add message to UI for instant feedback (optimistic update)
    if (data.message) {
      const newMessage = {
        messageId: data.message.messageId || data.message.message_id,
        sessionId: state.currentSessionId,
        userId: state.user.userId,
        displayName: state.user.displayName,
        text: text.trim(),
        createdAt: data.message.createdAt || data.message.created_at || new Date().toISOString(),
        isOwn: true
      };
      
      // Check if message already exists
      const exists = state.messages.some(m => m.messageId === newMessage.messageId);
      if (!exists) {
        state.messages.push(newMessage);
        state.lastMessageTime = newMessage.createdAt;
        renderMessages(true); // Force scroll after sending
      }
    } else {
      // Fallback: fetch messages if response doesn't include the message
      await loadMessages(true);
    }

    // Check for risk warning
    if (data.warning) {
      console.log('Risk warning detected:', data.warning);
    }

    state.isSendingMessage = false;
    return true;
  } catch (err) {
    state.isSendingMessage = false;
    showToast(err.message, 'error');
    return false;
  }
}

function showRiskWarning(warning) {
  const modal = document.getElementById('riskWarningModal');
  document.getElementById('riskWarningMessage').textContent = warning.message;

  const resourcesHtml = warning.resources
    .map(
      (r) => `<p><strong>${r.name}:</strong> ${r.contact}</p>`
    )
    .join('');
  document.getElementById('riskResources').innerHTML = resourcesHtml;

  modal.hidden = false;
}

async function createSession(topic, companionId = null) {
  try {
    showLoading();
    const data = await api('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ topic, companionId }),
    });

    state.sessions.unshift(data.session);
    renderSessions();
    selectSession(data.session.sessionId);
    
    // On mobile, switch to chat view after creating session
    if (window.innerWidth <= 768) {
      const chatLayout = document.querySelector('.chat-layout');
      if (chatLayout) {
        chatLayout.classList.add('viewing-chat');
        // Recalculate app height for chat view
        setTimeout(() => {
          setAppHeight();
          scrollToBottom();
        }, 50);
      }
    }
    
    hideLoading();
    showToast('Ruang chat berhasil dibuat');
    
    // Reset companion selection
    state.selectedCompanionId = null;
    
    return true;
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    return false;
  }
}

async function deleteSession(sessionId) {
  if (!sessionId) return false;
  
  if (!confirm('Apakah kamu yakin ingin menghapus ruang chat ini?')) {
    return false;
  }

  try {
    showLoading();
    await api(`/chat/sessions?sessionId=${sessionId}`, {
      method: 'DELETE',
    });

    // Remove from state
    state.sessions = state.sessions.filter(s => s.sessionId !== sessionId);
    renderSessions();
    
    // Clear current session if it was deleted
    if (state.currentSessionId === sessionId) {
      state.currentSessionId = null;
      state.currentSession = null;
      state.messages = [];
      document.getElementById('chatHeader').hidden = true;
      
      const chatInputArea = document.getElementById('chatInputArea');
      chatInputArea.hidden = true;
      chatInputArea.style.display = 'none';
      
      document.getElementById('messagesContainer').innerHTML = '';
      stopPolling();
      
      // Clear room from localStorage since it's deleted
      localStorage.removeItem('rd_app_last_room');
      
      // On mobile, go back to list view
      if (window.innerWidth <= 768) {
        const chatLayout = document.querySelector('.chat-layout');
        if (chatLayout) {
          chatLayout.classList.remove('viewing-chat');
        }
      }
    }
    
    hideLoading();
    showToast('Ruang chat berhasil dihapus');
    return true;
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    return false;
  }
}

async function reportSession(reason) {
  if (!state.currentSessionId) return;

  try {
    showLoading();
    await api('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetSessionId: state.currentSessionId,
        reason,
      }),
    });

    hideLoading();
    showToast('Laporan berhasil dikirim. Terima kasih.');
    return true;
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    return false;
  }
}

// ============================================
// Journal Feature
// ============================================
async function loadJournals() {
  try {
    const data = await api('/journal');
    state.journals = data.entries || [];
    renderJournals();
    updateJournalCount();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateJournalCount() {
  const countEl = document.getElementById('journalCount');
  if (countEl) {
    const count = state.journals.length;
    countEl.textContent = `${count} entri`;
  }
}

function renderJournals() {
  const container = document.getElementById('journalList');

  if (state.journals.length === 0) {
    container.innerHTML = `
      <div class="journal-empty">
        <svg class="journal-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
        </svg>
        <p class="journal-empty-text">Belum ada catatan. Mulai tulis refleksimu hari ini.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.journals
    .map(
      (entry) => `
    <div class="journal-card" data-entry-id="${entry.entryId}">
      <div class="journal-card-header">
        <h3 class="journal-card-title">${escapeHtml(entry.title)}</h3>
        <span class="journal-card-date">${formatDateShort(entry.createdAt)}</span>
      </div>
      <p class="journal-card-preview">${escapeHtml(entry.body)}</p>
      ${entry.tags && entry.tags.length > 0 ? `
        <div class="journal-card-tags">
          ${entry.tags.slice(0, 3).map((tag) => `<span class="journal-tag">${escapeHtml(tag)}</span>`).join('')}
          ${entry.tags.length > 3 ? `<span class="journal-tag">+${entry.tags.length - 3}</span>` : ''}
        </div>
      ` : ''}
    </div>
  `
    )
    .join('');

  // Add click handlers
  container.querySelectorAll('.journal-card').forEach((card) => {
    card.addEventListener('click', () => {
      viewJournal(card.dataset.entryId);
    });
  });
}

// Helper function for short date format
function formatDateShort(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Hari ini';
  } else if (diffDays === 1) {
    return 'Kemarin';
  } else if (diffDays < 7) {
    return `${diffDays} hari lalu`;
  } else {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }
}

async function viewJournal(entryId) {
  try {
    const data = await api(`/journal?entryId=${entryId}`);
    const entry = data.entry;

    document.getElementById('viewJournalTitle').textContent = entry.title;
    document.getElementById('viewJournalDate').textContent = formatDate(entry.createdAt);
    
    // Render tags as badges
    const tagsContainer = document.getElementById('viewJournalTags');
    if (entry.tags && entry.tags.length > 0) {
      tagsContainer.innerHTML = entry.tags.map(tag => 
        `<span class="journal-tag">${escapeHtml(tag)}</span>`
      ).join('');
    } else {
      tagsContainer.innerHTML = '';
    }
    
    document.getElementById('viewJournalBody').textContent = entry.body;

    // Store current entry ID for edit/delete
    document.getElementById('viewJournalModal').dataset.entryId = entryId;
    document.getElementById('viewJournalModal').hidden = false;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveJournal(entryId, title, body, tags) {
  try {
    showLoading();
    const tagsArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);

    if (entryId) {
      // Update existing
      await api('/journal', {
        method: 'PUT',
        body: JSON.stringify({ entryId, title, body, tags: tagsArray }),
      });
      hideLoading();
      showToast('Jurnal berhasil diperbarui');
    } else {
      // Create new
      await api('/journal', {
        method: 'POST',
        body: JSON.stringify({ title, body, tags: tagsArray }),
      });
      hideLoading();
      showToast('Jurnal berhasil disimpan');
    }

    loadJournals();
    return true;
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    return false;
  }
}

async function deleteJournal(entryId) {
  if (!confirm('Yakin ingin menghapus jurnal ini?')) return;

  try {
    showLoading();
    await api('/journal', {
      method: 'DELETE',
      body: JSON.stringify({ entryId }),
    });

    hideLoading();
    showToast('Jurnal berhasil dihapus');
    loadJournals();
    document.getElementById('viewJournalModal').hidden = true;
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
  }
}

// ============================================
// Mood Feature
// ============================================
async function loadMoods() {
  try {
    const data = await api('/mood?limit=30');
    state.moods = data.moods || [];
    renderMoods();
    updateMoodHistoryCount();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateMoodHistoryCount() {
  const countEl = document.getElementById('moodHistoryCount');
  if (countEl) {
    countEl.textContent = state.moods.length;
  }
}

function renderMoods() {
  const container = document.getElementById('moodHistory');

  if (state.moods.length === 0) {
    container.innerHTML = '<p class="mood-empty">Belum ada catatan mood. Mulai catat perasaanmu hari ini.</p>';
    return;
  }

  const emojiMap = {
    1: '😞',
    2: '😔', 
    3: '😐',
    4: '🙂',
    5: '😊'
  };

  container.innerHTML = state.moods
    .map(
      (mood) => `
    <div class="mood-log-item" data-expanded="false">
      <span class="mood-log-emoji">${emojiMap[mood.score] || '😐'}</span>
      <div class="mood-log-content">
        <div class="mood-log-header">
          <span class="mood-log-emotion">${escapeHtml(mood.emotion || getMoodLabel(mood.score))}</span>
          <span class="mood-log-date">${formatDateShort(mood.date)}</span>
        </div>
        ${mood.note ? `<p class="mood-log-note">${escapeHtml(mood.note)}</p>` : ''}
      </div>
    </div>
  `
    )
    .join('');

  // Add click to expand notes
  container.querySelectorAll('.mood-log-item').forEach(item => {
    item.addEventListener('click', () => {
      const noteEl = item.querySelector('.mood-log-note');
      if (noteEl) {
        noteEl.classList.toggle('expanded');
      }
    });
  });
}

function getMoodLabel(score) {
  const labels = {
    1: 'Sangat Berat',
    2: 'Berat',
    3: 'Biasa',
    4: 'Baik',
    5: 'Sangat Baik'
  };
  return labels[score] || 'Biasa';
}

async function saveMood(score, note) {
  try {
    const submitBtn = document.getElementById('moodSubmitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<svg class="animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25"></circle><path fill="currentColor" d="m4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Menyimpan...';
    submitBtn.disabled = true;
    
    // Map score to emotion
    const emotionMap = {
      1: 'Sangat Berat',
      2: 'Berat',
      3: 'Biasa',
      4: 'Baik',
      5: 'Sangat Baik'
    };
    const emotion = emotionMap[score] || 'Biasa';
    
    await api('/mood', {
      method: 'POST',
      body: JSON.stringify({ score, emotion, note }),
    });

    // Show success feedback
    const form = document.getElementById('moodForm');
    const successEl = document.getElementById('moodSuccess');
    
    form.hidden = true;
    successEl.hidden = false;
    
    // Hide success after 3 seconds and show form again
    setTimeout(() => {
      successEl.hidden = true;
      form.hidden = false;
      
      // Reset form
      document.querySelectorAll('input[name="rating"]').forEach((radio) => {
        radio.checked = false;
      });
      document.querySelectorAll('.mood-option').forEach((option) => {
        option.classList.remove('selected');
      });
      document.getElementById('moodNote').value = '';
      
      // Reset button
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }, 3000);

    loadMoods();
    return true;
  } catch (err) {
    const submitBtn = document.getElementById('moodSubmitBtn');
    submitBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Simpan Mood';
    submitBtn.disabled = false;
    showToast(err.message, 'error');
    return false;
  }
}

// Initialize mood history toggle
function initMoodHistoryToggle() {
  const toggleBtn = document.getElementById('moodHistoryToggle');
  const content = document.getElementById('moodHistoryContent');
  
  if (toggleBtn && content) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = !content.hidden;
      content.hidden = isExpanded;
      toggleBtn.classList.toggle('expanded', !isExpanded);
    });
  }
}

// ============================================
// Breathing Exercise
// ============================================
function initBreathingExercise() {
  let isRunning = false;
  let breathInterval;
  const circle = document.getElementById('breathCircle');
  const text = document.getElementById('breathText');
  const btn = document.getElementById('startBreathing');

  btn.onclick = () => {
    if (isRunning) {
      // Stop
      clearInterval(breathInterval);
      circle.classList.remove('inhale', 'exhale');
      text.textContent = 'Tarik napas';
      btn.textContent = 'Mulai Latihan';
      isRunning = false;
    } else {
      // Start
      isRunning = true;
      btn.textContent = 'Berhenti';

      let phase = 'inhale';
      const runPhase = () => {
        if (phase === 'inhale') {
          circle.classList.remove('exhale');
          circle.classList.add('inhale');
          text.textContent = 'Tarik napas...';
          phase = 'hold1';
          setTimeout(runPhase, 4000);
        } else if (phase === 'hold1') {
          text.textContent = 'Tahan...';
          phase = 'exhale';
          setTimeout(runPhase, 4000);
        } else if (phase === 'exhale') {
          circle.classList.remove('inhale');
          circle.classList.add('exhale');
          text.textContent = 'Hembuskan...';
          phase = 'hold2';
          setTimeout(runPhase, 4000);
        } else {
          text.textContent = 'Tahan...';
          phase = 'inhale';
          setTimeout(runPhase, 4000);
        }
      };
      runPhase();
    }
  };
}

// ============================================
// Utility Functions
// ============================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================
// Event Listeners Setup
// ============================================
function setupEventListeners() {
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const confirmed = confirm('Apakah Anda yakin ingin keluar?');
      if (confirmed) {
        await logout();
      }
    });
  }

  // Chat - New Chat Button (opens options bottom sheet)
  document.getElementById('newChatBtn').addEventListener('click', () => {
    openNewChatOptions();
  });

  // New Chat Options - Close on overlay click
  const newChatOptionsOverlay = document.getElementById('newChatOptionsOverlay');
  if (newChatOptionsOverlay) {
    newChatOptionsOverlay.addEventListener('click', (e) => {
      if (e.target === newChatOptionsOverlay) {
        closeNewChatOptions();
      }
    });
  }

  // New Chat Options - Companion Chat
  document.getElementById('optionNewCompanionChat').addEventListener('click', () => {
    closeNewChatOptions();
    openListenerPicker();
  });

  // New Chat Options - Group Chat
  document.getElementById('optionNewGroupChat').addEventListener('click', () => {
    closeNewChatOptions();
    document.getElementById('newChatModal').hidden = false;
    document.getElementById('chatTopicInput').focus();
  });

  document.getElementById('cancelNewChat').addEventListener('click', () => {
    document.getElementById('newChatModal').hidden = true;
  });

  document.getElementById('newChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('chatTopicInput').value;
    
    if (await createSession(topic, null)) {
      document.getElementById('newChatModal').hidden = true;
      document.getElementById('chatTopicInput').value = '';
    }
  });

  // Companion Chat Modal
  document.getElementById('cancelCompanionChat').addEventListener('click', () => {
    document.getElementById('companionChatModal').hidden = true;
  });

  document.getElementById('companionChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('companionChatTopic').value;
    const companionId = state.selectedCompanionId;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // Loading state
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Membuat...';
    submitBtn.disabled = true;
    
    if (await createSession(topic, companionId)) {
      document.getElementById('companionChatModal').hidden = true;
      document.getElementById('companionChatTopic').value = '';
      // Switch to chat tab and show the new session
      switchTab('chat');
    }
    
    // Reset button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  });

  // Chat - Send message
  document.getElementById('messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessageBtn');
    const text = input.value;
    
    // Update button text
    const originalText = sendBtn.textContent;
    sendBtn.textContent = 'Mengirim...';
    sendBtn.disabled = true;
    
    if (await sendMessage(text)) {
      input.value = '';
    }
    
    // Reset button
    sendBtn.textContent = originalText;
    sendBtn.disabled = false;
  });

  // Chat - Report
  document.getElementById('reportChatBtn').addEventListener('click', () => {
    document.getElementById('reportModal').hidden = false;
  });

  document.getElementById('cancelReport').addEventListener('click', () => {
    document.getElementById('reportModal').hidden = true;
  });

  // Chat - Delete session
  const deleteChatBtn = document.getElementById('deleteChatBtn');
  if (deleteChatBtn) {
    deleteChatBtn.addEventListener('click', async () => {
      if (state.currentSessionId) {
        await deleteSession(state.currentSessionId);
      }
    });
  }

  // Mobile Chat Navigation - List-first approach
  const chatLayout = document.querySelector('.chat-layout');
  const backToListBtn = document.getElementById('backToListBtn');

  // Back to list button - returns to chat list on mobile
  if (backToListBtn && chatLayout) {
    backToListBtn.addEventListener('click', () => {
      // Remove viewing-chat class to show list
      chatLayout.classList.remove('viewing-chat');
      // Clear current session selection
      state.currentSessionId = null;
      state.currentSession = null;
      // Stop polling
      stopPolling();
      // Clear room from localStorage (user intentionally went back to list)
      localStorage.removeItem('rd_app_last_room');
      // Hide input area on mobile
      const chatInputArea = document.getElementById('chatInputArea');
      if (chatInputArea) {
        chatInputArea.hidden = true;
        chatInputArea.style.display = 'none';
      }
      // Update UI
      document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
      });
    });
  }

  // When user selects a session on mobile, switch to chat view
  document.addEventListener('click', (e) => {
    const sessionItem = e.target.closest('.session-item');
    if (sessionItem && window.innerWidth <= 768 && chatLayout) {
      // Add viewing-chat class to show chat, hide list
      chatLayout.classList.add('viewing-chat');
      // Recalculate app height for chat view
      setTimeout(() => {
        setAppHeight();
        scrollToBottom();
      }, 50);
    }
  });

  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = document.getElementById('reportReason').value;
    if (await reportSession(reason)) {
      document.getElementById('reportModal').hidden = true;
      document.getElementById('reportReason').value = '';
    }
  });

  // Risk warning close (DISABLED - modal removed)
  // document.getElementById('closeRiskWarning').addEventListener('click', (e) => {
  //   e.stopPropagation();
  //   document.getElementById('riskWarningModal').hidden = true;
  // });

  // Risk warning modal backdrop click (DISABLED - modal removed)
  // document.getElementById('riskWarningModal').addEventListener('click', (e) => {
  //   if (e.target.id === 'riskWarningModal') {
  //     document.getElementById('riskWarningModal').hidden = true;
  //   }
  // });

  // Journal - New
  document.getElementById('newJournalBtn').addEventListener('click', () => {
    document.getElementById('journalModalTitle').textContent = 'Tulis Jurnal Baru';
    document.getElementById('journalEntryId').value = '';
    document.getElementById('journalTitle').value = '';
    document.getElementById('journalBody').value = '';
    document.getElementById('journalTags').value = '';
    document.getElementById('journalModal').hidden = false;
  });

  document.getElementById('cancelJournal').addEventListener('click', () => {
    document.getElementById('journalModal').hidden = true;
  });

  document.getElementById('journalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const entryId = document.getElementById('journalEntryId').value;
    const title = document.getElementById('journalTitle').value;
    const body = document.getElementById('journalBody').value;
    const tags = document.getElementById('journalTags').value;

    if (await saveJournal(entryId || null, title, body, tags)) {
      document.getElementById('journalModal').hidden = true;
    }
  });

  // Journal - View modal actions
  document.getElementById('closeViewJournal').addEventListener('click', () => {
    document.getElementById('viewJournalModal').hidden = true;
  });

  document.getElementById('editJournalBtn').addEventListener('click', async () => {
    const entryId = document.getElementById('viewJournalModal').dataset.entryId;
    const data = await api(`/journal?entryId=${entryId}`);
    const entry = data.entry;

    document.getElementById('journalModalTitle').textContent = 'Edit Jurnal';
    document.getElementById('journalEntryId').value = entryId;
    document.getElementById('journalTitle').value = entry.title;
    document.getElementById('journalBody').value = entry.body;
    document.getElementById('journalTags').value = entry.tags.join(', ');

    document.getElementById('viewJournalModal').hidden = true;
    document.getElementById('journalModal').hidden = false;
  });

  document.getElementById('deleteJournalBtn').addEventListener('click', () => {
    const entryId = document.getElementById('viewJournalModal').dataset.entryId;
    deleteJournal(entryId);
  });

  // Mood - Submit
  document.getElementById('moodForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedRating = document.querySelector('input[name="rating"]:checked');
    if (!selectedRating) {
      showToast('Pilih salah satu rating mood', 'error');
      return;
    }

    const score = parseInt(selectedRating.value);
    const note = document.getElementById('moodNote').value;

    await saveMood(score, note);
  });

  // Mood - Add visual effect when selecting rating
  document.querySelectorAll('input[name="rating"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      // Remove selected class from all options
      document.querySelectorAll('.mood-option').forEach((option) => {
        option.classList.remove('selected');
      });
      
      // Add selected class to the chosen option
      if (e.target.checked) {
        e.target.closest('.mood-option').classList.add('selected');
      }
    });
  });

  // Companions - Main CTA Button (opens listener picker)
  const btnStartChat = document.getElementById('btnStartChat');
  if (btnStartChat) {
    btnStartChat.addEventListener('click', () => {
      openListenerPicker();
    });
  }

  // Listener Picker - Close button
  const btnClosePicker = document.getElementById('btnClosePicker');
  if (btnClosePicker) {
    btnClosePicker.addEventListener('click', closeListenerPicker);
  }

  // Listener Picker - Close on overlay click
  const listenerPickerOverlay = document.getElementById('listenerPickerOverlay');
  if (listenerPickerOverlay) {
    listenerPickerOverlay.addEventListener('click', (e) => {
      if (e.target === listenerPickerOverlay) {
        closeListenerPicker();
      }
    });
  }

  // ESC key handler for all bottom sheets and modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close new chat options
      const newChatOptions = document.getElementById('newChatOptionsOverlay');
      if (newChatOptions && !newChatOptions.hidden) {
        closeNewChatOptions();
        return;
      }
      
      // Close listener picker
      const picker = document.getElementById('listenerPickerOverlay');
      if (picker && !picker.hidden) {
        closeListenerPicker();
        return;
      }
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.hidden = true;
      }
    });
  });

  // Handle visibility change (pause polling when tab not visible)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else if (state.currentTab === 'chat' && state.currentSessionId) {
      startPolling();
    }
  });

  // Setup mobile keyboard handling
  setupMobileKeyboard();
  
  // Setup mood history toggle
  initMoodHistoryToggle();
}

// ============================================
// Mobile Keyboard Handling (WhatsApp-like)
// ============================================
function setupMobileKeyboard() {
  // Set initial app height
  setAppHeight();

  // Use visualViewport API for precise keyboard detection
  if (window.visualViewport) {
    let pendingUpdate = false;
    
    const handleViewportChange = () => {
      if (pendingUpdate) return;
      pendingUpdate = true;
      
      requestAnimationFrame(() => {
        setAppHeight();
        
        // Calculate keyboard height and adjust input area position
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        const inputArea = document.getElementById('chatInputArea');
        const messagesContainer = document.getElementById('messagesContainer');
        
        if (keyboardHeight > 100) {
          // Keyboard is open
          if (inputArea) {
            inputArea.style.bottom = `${keyboardHeight}px`;
          }
          if (messagesContainer) {
            messagesContainer.style.paddingBottom = `${80 + keyboardHeight}px`;
            // Auto scroll to bottom when keyboard opens
            setTimeout(() => {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 50);
          }
        } else {
          // Keyboard is closed
          if (inputArea) {
            inputArea.style.bottom = '0';
          }
          if (messagesContainer) {
            messagesContainer.style.paddingBottom = '80px';
          }
        }
        
        pendingUpdate = false;
      });
    };
    
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
  } else {
    // Fallback for browsers without visualViewport
    window.addEventListener('resize', () => {
      requestAnimationFrame(setAppHeight);
    });
  }

  // Handle input focus - scroll to bottom when keyboard appears
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    messageInput.addEventListener('focus', () => {
      // Small delay to let keyboard animation complete
      setTimeout(() => {
        setAppHeight();
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 300);
    });

    messageInput.addEventListener('blur', () => {
      // Reset height when keyboard closes
      setTimeout(() => {
        setAppHeight();
        const inputArea = document.getElementById('chatInputArea');
        const messagesContainer = document.getElementById('messagesContainer');
        if (inputArea) {
          inputArea.style.bottom = '0';
        }
        if (messagesContainer) {
          messagesContainer.style.paddingBottom = '80px';
        }
      }, 100);
    });
  }
}

function setAppHeight() {
  // Only update if chat-lock is active
  if (!document.body.classList.contains('chat-lock')) return;
  
  // Use visualViewport height if available (most accurate for mobile keyboards)
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
  
  // Also ensure body dimensions are updated
  document.body.style.height = `${vh}px`;
}

// ============================================
// Insight Feature
// ============================================
async function loadInsightData() {
  try {
    // Load mood data for the chart
    const moodData = await api('/mood');
    const moods = moodData.moods || [];
    
    // Load journal count (API returns 'entries' not 'journals')
    const journalData = await api('/journal');
    const journals = journalData.entries || [];
    
    // Load chat sessions count
    const sessionData = await api('/chat/sessions');
    const sessions = sessionData.sessions || [];
    
    // Update activity stats (use unique IDs for Insight section)
    const chatCountEl = document.getElementById('insightChatCount');
    const journalCountEl = document.getElementById('insightJournalCount');
    const moodLogCountEl = document.getElementById('insightMoodCount');
    
    if (chatCountEl) chatCountEl.textContent = sessions.length;
    if (journalCountEl) journalCountEl.textContent = journals.length;
    if (moodLogCountEl) moodLogCountEl.textContent = moods.length;
    
    // Calculate weekly mood stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // API returns 'createdAt' (camelCase) and 'score' (from rating)
    const weeklyMoods = moods.filter(m => new Date(m.createdAt) >= weekAgo);
    
    // Update mood stats
    const avgMoodEl = document.getElementById('avgMood');
    const moodTrendEl = document.getElementById('moodTrend');
    const moodEntriesEl = document.getElementById('moodEntries');
    
    if (weeklyMoods.length > 0) {
      // Use 'score' from API (mapped from 'rating' in database)
      const avgMood = weeklyMoods.reduce((sum, m) => sum + m.score, 0) / weeklyMoods.length;
      if (avgMoodEl) avgMoodEl.textContent = avgMood.toFixed(1);
      
      // Calculate trend
      if (weeklyMoods.length >= 2) {
        const firstHalf = weeklyMoods.slice(0, Math.floor(weeklyMoods.length / 2));
        const secondHalf = weeklyMoods.slice(Math.floor(weeklyMoods.length / 2));
        const firstAvg = firstHalf.reduce((s, m) => s + m.score, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, m) => s + m.score, 0) / secondHalf.length;
        
        if (secondAvg > firstAvg + 0.3) {
          if (moodTrendEl) moodTrendEl.textContent = 'Naik';
        } else if (secondAvg < firstAvg - 0.3) {
          if (moodTrendEl) moodTrendEl.textContent = 'Turun';
        } else {
          if (moodTrendEl) moodTrendEl.textContent = 'Stabil';
        }
      }
    } else {
      if (avgMoodEl) avgMoodEl.textContent = '-';
      if (moodTrendEl) moodTrendEl.textContent = '-';
    }
    
    if (moodEntriesEl) moodEntriesEl.textContent = weeklyMoods.length;
    
    // Update mood chart bars
    updateMoodChart(moods);
    
  } catch (err) {
    console.error('Failed to load insight data:', err);
  }
}

function updateMoodChart(moods) {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const today = new Date();
  const bars = document.querySelectorAll('.mood-bar');
  
  bars.forEach((bar, index) => {
    // Calculate which day this bar represents (starting from 6 days ago)
    const dayOffset = 6 - index;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - dayOffset);
    
    // Find moods for this day - API returns 'createdAt' (camelCase)
    const dayMoods = moods.filter(m => {
      const moodDate = new Date(m.createdAt);
      return moodDate.toDateString() === targetDate.toDateString();
    });
    
    // Calculate average mood for this day (1-5 scale, convert to percentage)
    // API returns 'score' (mapped from 'rating' in database)
    let height = 20; // Default minimum height
    if (dayMoods.length > 0) {
      const avgMood = dayMoods.reduce((s, m) => s + m.score, 0) / dayMoods.length;
      height = (avgMood / 5) * 100;
    }
    
    bar.style.setProperty('--height', `${height}%`);
    bar.setAttribute('data-day', days[targetDate.getDay()]);
    
    // Mark today
    if (dayOffset === 0) {
      bar.classList.add('today');
    } else {
      bar.classList.remove('today');
    }
  });
}

// Modal Helper Functions
function showHelpModal() {
  const modal = document.getElementById('helpModal');
  if (modal) modal.hidden = false;
}

function showTipsModal() {
  const modal = document.getElementById('tipsModal');
  if (modal) modal.hidden = false;
}

// Close modals when clicking outside
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.hidden = true;
  }
});

// ============================================
// Initialize App
// ============================================
async function init() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  initNavigation();
  setupEventListeners();

  // Cleanup polling when leaving page
  window.addEventListener('beforeunload', () => {
    stopPolling();
  });

  // Pause/resume polling on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else if (state.currentSessionId && state.currentTab === 'chat') {
      startPolling();
    }
  });

  // ============================================
  // Check if this is a NEW USER from onboarding
  // ============================================
  const isNewUser = localStorage.getItem('rd_is_new_user') === 'true';
  
  if (isNewUser) {
    // Clear the flag so it only applies once
    localStorage.removeItem('rd_is_new_user');
    
    // New user: Force "companions" (Teman Ngobrol) tab
    // Don't use any saved state
    localStorage.removeItem('rd_app_last_tab');
    localStorage.removeItem('rd_app_last_room');
    
    state.currentTab = 'companions';
    switchTab('companions', false);
    loadCompanionsTab();
    // Preload sessions in background
    loadSessions();
    
    console.log('[init] New user detected - showing Teman Ngobrol tab');
    return; // Exit early, don't process remember state
  }

  // ============================================
  // Returning user: Restore last tab from localStorage
  // ============================================
  const lastTab = localStorage.getItem('rd_app_last_tab') || 'companions';
  const lastRoom = localStorage.getItem('rd_app_last_room');
  
  // Set initial tab state (without saving to localStorage again)
  state.currentTab = lastTab;
  
  // Handle different tab scenarios
  if (lastTab === 'chat') {
    // Chat tab - need to load sessions first, then restore room if exists
    document.body.classList.add('chat-lock');
    setAppHeight();
    
    // Load sessions first
    await loadSessions();
    
    // Try to restore the last opened room
    if (lastRoom && state.sessions.length > 0) {
      const roomExists = state.sessions.find(s => s.sessionId === lastRoom);
      if (roomExists) {
        // Room exists, open it
        switchTab('chat', false); // Don't save again
        await selectSession(lastRoom);
      } else {
        // Room no longer exists (deleted/closed), just show chat list
        switchTab('chat', false);
        localStorage.removeItem('rd_app_last_room');
      }
    } else {
      // No room to restore, just show chat list
      switchTab('chat', false);
    }
  } else if (lastTab === 'companions') {
    // Companions tab (default)
    switchTab('companions', false);
    loadCompanionsTab();
    // Preload sessions in background for quick switching
    loadSessions();
  } else {
    // Other tabs (journal, mood, insight)
    switchTab(lastTab, false);
  }
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

