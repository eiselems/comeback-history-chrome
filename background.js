// Default settings
const DEFAULT_SETTINGS = {
    lookbackDuration: 28, // days
    minVisits: 2,
    lastAnalysis: 0
  };
  
  // Initialize extension on install
  chrome.runtime.onInstalled.addListener(async () => {
    // Set default settings
    const settings = await chrome.storage.local.get('settings');
    if (!settings.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    
    // Create the "comeback" folder if it doesn't exist
    const bookmarkTree = await chrome.bookmarks.getTree();
    const bookmarkBar = bookmarkTree[0].children.find(child => child.title === 'Bookmarks Bar');
    
    if (bookmarkBar) {
      const comebackFolder = bookmarkBar.children.find(child => child.title === 'comeback');
      if (!comebackFolder) {
        await chrome.bookmarks.create({
          parentId: bookmarkBar.id,
          title: 'comeback'
        });
      }
    }
  
    // Initial analysis
    analyzeHistory();
  });
  
  // Analyze history and find frequently visited sites
  async function analyzeHistory() {
    try {
      // Get settings
      const { settings } = await chrome.storage.local.get('settings');
      const lookbackDays = settings.lookbackDuration || DEFAULT_SETTINGS.lookbackDuration;
      const minVisits = settings.minVisits || DEFAULT_SETTINGS.minVisits;
      
      // Calculate the start time (now - lookback days)
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - lookbackDays);
      
      // Get history items
      const historyItems = await chrome.history.search({
        text: '',
        startTime: startTime.getTime(),
        maxResults: 1000
      });
      
      // Count visits by domain
      const urlCounts = {};
      historyItems.forEach(item => {
        try {
          const url = new URL(item.url);
          // Skip chrome:// and extension:// URLs
          if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
            return;
          }
          
          const domain = url.hostname;
          if (!urlCounts[domain]) {
            urlCounts[domain] = { count: 0, urls: {} };
          }
          
          urlCounts[domain].count += item.visitCount;
          
          if (!urlCounts[domain].urls[item.url]) {
            urlCounts[domain].urls[item.url] = {
              count: 0,
              title: item.title
            };
          }
          urlCounts[domain].urls[item.url].count += item.visitCount;
        } catch (e) {
          // Skip invalid URLs
        }
      });
      
      // Get all bookmarks
      const allBookmarks = await getAllBookmarks();
      const bookmarkedUrls = new Set(allBookmarks.map(bookmark => bookmark.url));
      
      // Find the "comeback" folder
      const bookmarkTree = await chrome.bookmarks.getTree();
      const bookmarkBar = bookmarkTree[0].children.find(child => child.title === 'Bookmarks Bar');
      let comebackFolder = null;
      
      if (bookmarkBar) {
        comebackFolder = bookmarkBar.children.find(child => child.title === 'comeback');
      }
      
      if (!comebackFolder) {
        console.error("Comeback folder not found");
        return;
      }
      
      // Find URLs to suggest
      const suggestions = [];
      
      for (const domain in urlCounts) {
        const domainData = urlCounts[domain];
        
        // Find the most visited URL for this domain
        let bestUrl = null;
        let bestCount = 0;
        
        for (const url in domainData.urls) {
          const count = domainData.urls[url].count;
          if (count > bestCount) {
            bestCount = count;
            bestUrl = {
              url: url,
              title: domainData.urls[url].title || domain,
              count: count
            };
          }
        }
        
        // Add to suggestions if it meets the minimum visit threshold and isn't already bookmarked
        if (bestUrl && bestUrl.count >= minVisits && !bookmarkedUrls.has(bestUrl.url)) {
          suggestions.push(bestUrl);
        }
      }
      
      // Store suggestions for the popup
      await chrome.storage.local.set({ 
        suggestions: suggestions,
        lastAnalysis: Date.now()
      });
      
    } catch (error) {
      console.error("Error analyzing history:", error);
    }
  }
  
  // Helper function to get all bookmarks
  async function getAllBookmarks() {
    const bookmarkTree = await chrome.bookmarks.getTree();
    return flattenBookmarks(bookmarkTree);
  }
  
  // Recursively flatten bookmark tree into an array
  function flattenBookmarks(bookmarkItems) {
    let bookmarks = [];
    
    for (const item of bookmarkItems) {
      if (item.url) {
        bookmarks.push(item);
      }
      if (item.children) {
        bookmarks = bookmarks.concat(flattenBookmarks(item.children));
      }
    }
    
    return bookmarks;
  }
  
  // Re-analyze periodically (once a day)
  chrome.alarms.create('reanalyze', { periodInMinutes: 24 * 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'reanalyze') {
      analyzeHistory();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'analyzeHistory') {
      analyzeHistory()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error analyzing history:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }
    if (message.action === 'addToBookmarks') {
      addToBookmarks(message.url, message.title)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error adding bookmark:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }
  });

  // Check current page for frequent visits
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        // Get settings
        const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
        const lookbackDays = settings.lookbackDuration || DEFAULT_SETTINGS.lookbackDuration;
        const minVisits = settings.minVisits || DEFAULT_SETTINGS.minVisits;
  
        // Get history for this URL
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - lookbackDays);
  
        const historyItems = await chrome.history.getVisits({ url: tab.url });
  
        // Count visits in the lookback period
        const recentVisits = historyItems.filter(visit => {
          return new Date(visit.visitTime).getTime() >= startTime.getTime();
        });
  
        const visitCount = recentVisits.length;
  
        // Check if the URL is already bookmarked
        const allBookmarks = await getAllBookmarks();
        const isBookmarked = allBookmarks.some(bookmark => bookmark.url === tab.url);

        // If the visit count meets our threshold and the URL is not already bookmarked, show notification
        if (visitCount >= minVisits && !isBookmarked) {
          chrome.tabs.sendMessage(tabId, { 
            action: 'showNotification', 
            visitCount: visitCount 
          });
        }
      } catch (error) {
        console.error("Error checking page visits:", error);
      }
    }
  });
  
  // Function to add a page to the comeback folder
  async function addToBookmarks(url, title) {
    // Find the comeback folder
    const bookmarkTree = await chrome.bookmarks.getTree();
    const bookmarkBar = bookmarkTree[0].children.find(child => child.title === 'Bookmarks Bar');
    let comebackFolder = null;
    
    if (bookmarkBar) {
      comebackFolder = bookmarkBar.children.find(child => child.title === 'comeback');
    }
    
    if (!comebackFolder) {
      throw new Error("Comeback folder not found");
    }
    
    // Check if bookmark already exists
    const existingBookmarks = await chrome.bookmarks.search({ url });
    const alreadyInComebackFolder = existingBookmarks.some(
      bookmark => bookmark.parentId === comebackFolder.id
    );
    
    if (!alreadyInComebackFolder) {
      // Create the bookmark
      await chrome.bookmarks.create({
        parentId: comebackFolder.id,
        title: title || new URL(url).hostname,
        url: url
      });
    }
    
    return true;
  }