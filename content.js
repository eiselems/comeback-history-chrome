// Initialize variables
let notificationContainer = null;
let isNotificationVisible = false;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showNotification' && message.visitCount && !isNotificationVisible) {
    showNotification(message.visitCount);
    sendResponse({ success: true });
  }
  return true;
});

// Function to create and show the notification
function showNotification(visitCount) {
  // Create container if it doesn't exist
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.className = 'comeback-notification';
    notificationContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #ffffff;
      border: 1px solid #cccccc;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      padding: 12px 16px;
      z-index: 9999;
      font-family: Arial, sans-serif;
      max-width: 300px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    document.body.appendChild(notificationContainer);
  }

  // Set notification content
  notificationContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h3 style="margin: 0; font-size: 14px; color: #333;">Frequent Visit Detected</h3>
      <button id="close-notification" style="background: none; border: none; cursor: pointer; font-size: 16px; color: #000;">×</button>
    </div>
    <p style="margin: 0; font-size: 12px; color: #555;">
      You've visited this page ${visitCount} times recently.
    </p>
    <button id="bookmark-page" style="
      background-color: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
      align-self: flex-start;
    ">Add to Bookmarks</button>
  `;

  // Add event listeners
  document.getElementById('close-notification').addEventListener('click', () => {
    notificationContainer.remove();
    notificationContainer = null;
    isNotificationVisible = false;
  });

  document.getElementById('bookmark-page').addEventListener('click', () => {
    chrome.runtime.sendMessage({ 
      action: 'addToBookmarks', 
      url: window.location.href,
      title: document.title
    }, (response) => {
      if (response && response.success) {
        // Update button to show success
        const bookmarkBtn = document.getElementById('bookmark-page');
        bookmarkBtn.textContent = 'Bookmarked!';
        bookmarkBtn.style.backgroundColor = '#4CAF50';
        
        // Hide notification after a delay
        setTimeout(() => {
          notificationContainer.remove();
          notificationContainer = null;
          isNotificationVisible = false;
        }, 2000);
      }
    });
  });

  isNotificationVisible = true;
}