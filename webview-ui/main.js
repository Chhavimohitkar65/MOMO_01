// Get access to the VS Code API
const vscode = acquireVsCodeApi();

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const askModeButton = document.getElementById('askMode');
const agentModeButton = document.getElementById('agentMode');
const clearChatButton = document.getElementById('clearChat');

// State
let currentMode = 'ask';
let isLoading = false;

// Initialize
window.addEventListener('load', () => {
  // Restore previous state if any
  const state = vscode.getState();
  if (state) {
    if (state.chatHistory) {
      renderChatHistory(state.chatHistory);
    }
    if (state.mode) {
      setMode(state.mode);
    }
  }

  // Focus on input
  userInput.focus();
});

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

askModeButton.addEventListener('click', () => {
  setMode('ask');
  vscode.postMessage({ type: 'setMode', mode: 'ask' });
});

agentModeButton.addEventListener('click', () => {
  setMode('agent');
  vscode.postMessage({ type: 'setMode', mode: 'agent' });
});

clearChatButton.addEventListener('click', () => {
  chatMessages.innerHTML = '';
  vscode.postMessage({ type: 'clearChat' });
  vscode.setState({ chatHistory: [], mode: currentMode });
});

// Handle messages from the extension
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'updateChatHistory':
      renderChatHistory(message.history);
      vscode.setState({ chatHistory: message.history, mode: currentMode });
      break;
    case 'setLoading':
      setLoading(message.isLoading);
      break;
    case 'setMode':
      setMode(message.mode);
      break;
  }
});

// Functions
function sendMessage() {
  const message = userInput.value.trim();
  if (message && !isLoading) {
    // Clear input
    userInput.value = '';
    
    // Send message to extension
    vscode.postMessage({
      type: 'sendMessage',
      message
    });
  }
}

function renderChatHistory(history) {
  chatMessages.innerHTML = '';
  
  history.forEach((msg) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.role}-message`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.textContent = msg.role === 'user' ? 'You' : 'Momo';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Render markdown content
    contentDiv.innerHTML = renderMarkdown(msg.content);
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
  });
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMarkdown(text) {
  // Simple markdown rendering
  // Code blocks
  text = text.replace(/```(\w*)\n([\s\S]*?)\n```/g, '<pre><code>$2</code></pre>');
  
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Lists
  text = text.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Paragraphs
  text = text.replace(/^(.+)$/gm, (match) => {
    if (match.startsWith('<')) return match;
    return `<p>${match}</p>`;
  });
  
  // Line breaks
  text = text.replace(/\n\n/g, '<br>');
  
  return text;
}

function setLoading(loading) {
  isLoading = loading;
  
  if (loading) {
    sendButton.disabled = true;
    
    // Add loading spinner
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.id = 'loadingSpinner';
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    
    loadingDiv.appendChild(spinner);
    chatMessages.appendChild(loadingDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } else {
    sendButton.disabled = false;
    
    // Remove loading spinner
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
      loadingSpinner.remove();
    }
  }
}

function setMode(mode) {
  currentMode = mode;
  
  // Update UI
  if (mode === 'ask') {
    askModeButton.classList.add('active');
    agentModeButton.classList.remove('active');
  } else {
    askModeButton.classList.remove('active');
    agentModeButton.classList.add('active');
  }
  
  // Update state
  const state = vscode.getState() || {};
  vscode.setState({ ...state, mode });
} 