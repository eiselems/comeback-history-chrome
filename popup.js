document.addEventListener('DOMContentLoaded', async () => {
  // Get elements
  const suggestionsList = document.getElementById('suggestions-list');
  const noSuggestionsEl = document.getElementById('no-suggestions');
  const lastAnalysisEl = document.getElementById('last-analysis');
  const statusMessage = document.getElementById('status-message');
  const settingsPanel = document.getElementById('settingsPanel');
  const toggleSettingsBtn = document.getElementById('toggleSettings');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const analyzeNowBtn = document.getElementById('analyzeNow');
  const lookbackDaysInput = document.getElementById('lookbackDays');
  const minVisitsInput = document.getElementById('minVisits');
  
  // Load suggestions and settings
  await loadSuggestions();
  await loadSettings();
  
  // Toggle settings panel
  toggleSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });
  
  // Save settings
  saveSettingsBtn.addEventListener('click', async () => {
    await saveSettings();
    showStatusMessage('Settings saved!', 'success');
  });
  
  // Analyze now button
  analyzeNowBtn.addEventListener('click', async () => {
    showStatusMessage('Analyzing browsing history...', 'info');
    await chrome.runtime.sendMessage({ action: 'analyzeHistory' });
    await loadSuggestions();
    showStatusMessage('Analysis complete!', 'success');
  });
  
  // Load suggestions from storage
  async function loadSuggestions() {
    const data = await chrome.storage.local.get(['suggestions', 'lastAnalysis']);
    const suggestions = data.suggestions || [];
    const lastAnalysis = data.lastAnalysis || 0;
  
    // Display last analysis time
    if (lastAnalysis) {
      const date = new Date(lastAnalysis);
      lastAnalysisEl.textContent = `Last analyzed: ${date.toLocaleString()}`;
    } else {
      lastAnalysisEl.textContent = 'Not analyzed yet';
    }
  
    // Clear the list
    suggestionsList.innerHTML = '';
  
    // Show/hide no suggestions message
    if (suggestions.length === 0) {
      noSuggestionsEl.classList.remove('hidden');
      return;
    }
  
    noSuggestionsEl.classList.add('hidden');
  
    // Sort suggestions by visit count (descending order)
    suggestions.sort((a, b) => b.count - a.count);
  
    // Add each suggestion to the list
    suggestions.forEach(suggestion => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
  
      const title = document.createElement('div');
      title.className = 'suggestion-title';
      title.textContent = suggestion.title || new URL(suggestion.url).hostname;
  
      const url = document.createElement('div');
      url.className = 'suggestion-url';
      url.textContent = suggestion.url;
  
      const visits = document.createElement('div');
      visits.className = 'suggestion-visits';
      visits.textContent = `Visited ${suggestion.count} times`;
  
      const bookmarkBtn = document.createElement('button');
      bookmarkBtn.className = 'bookmark-btn';
      bookmarkBtn.textContent = '+ Add Bookmark';
      bookmarkBtn.addEventListener('click', async () => {
        try {
          // Find the comeback folder
          const bookmarkTree = await chrome.bookmarks.getTree();
          const bookmarkBar = bookmarkTree[0].children.find(child => child.title === 'Bookmarks Bar');
          const comebackFolder = bookmarkBar.children.find(child => child.title === 'comeback');
  
          if (comebackFolder) {
            // Create the bookmark
            await chrome.bookmarks.create({
              parentId: comebackFolder.id,
              title: suggestion.title || new URL(suggestion.url).hostname,
              url: suggestion.url
            });
  
            // Remove from the list
            li.remove();
  
            // Update suggestions in storage
            const data = await chrome.storage.local.get('suggestions');
            const updatedSuggestions = data.suggestions.filter(s => s.url !== suggestion.url);
            await chrome.storage.local.set({ suggestions: updatedSuggestions });
  
            // Show success message
            showStatusMessage('Bookmark added!', 'success');
  
            // If no more suggestions, show no suggestions message
            if (updatedSuggestions.length === 0) {
              noSuggestionsEl.classList.remove('hidden');
            }
          } else {
            showStatusMessage('Comeback folder not found', 'error');
          }
        } catch (error) {
          showStatusMessage('Error adding bookmark: ' + error.message, 'error');
        }
      });
  
      li.appendChild(title);
      li.appendChild(url);
      li.appendChild(visits);
      li.appendChild(bookmarkBtn);
      suggestionsList.appendChild(li);
    });
  }
  
  // Load settings
  async function loadSettings() {
    const data = await chrome.storage.local.get('settings');
    const settings = data.settings || {
      lookbackDuration: 28,
      minVisits: 2
    };
    
    lookbackDaysInput.value = settings.lookbackDuration;
    minVisitsInput.value = settings.minVisits;
  }
  
  // Save settings
  async function saveSettings() {
    const lookbackDays = parseInt(lookbackDaysInput.value) || 28;
    const minVisits = parseInt(minVisitsInput.value) || 2;
    
    await chrome.storage.local.set({
      settings: {
        lookbackDuration: lookbackDays,
        minVisits: minVisits,
        lastAnalysis: Date.now()
      }
    });
  }
  
  // Show status message
  function showStatusMessage(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    
    // Hide after 3 seconds
    setTimeout(() => {
      statusMessage.textContent = '';
      statusMessage.className = 'status';
    }, 3000);
  }
});

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'suggestionsUpdated') {
    loadSuggestions();
  }
});