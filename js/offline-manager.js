/**
 * OFFLINE MANAGER - USER INTERFACE & DOWNLOAD LOGIC
 *
 * Purpose: Provides the UI modal and logic for users to select and download
 *          Bible versions for offline use. Manages the download process.
 *
 * Features:
 * - Modal UI for selecting Bible versions
 * - Progress tracking during downloads
 * - Storage of downloaded versions in IndexedDB
 * - Limit of 3 versions (configurable)
 * - Automatic UI updates
 *
 * Usage: Access via window.OfflineManager instance
 *        Automatically adds "Offline" button to header
 */

class OfflineManager {
  constructor() {
    this.availableVersions = [];
    this.downloading = new Set();
    this.ui = {
      modal: null,
      versionList: null,
      progressBar: null,
      statusText: null
    };
    
    this.init();
  }
  
  async init() {
    await this.loadAvailableVersions();
    this.setupUI();
    this.setupEventListeners();
  }
  
  async loadAvailableVersions() {
    try {
      const response = await fetch('/api/bible-versions');
      const data = await response.json();
      this.availableVersions = data.versions || [];
    } catch (error) {
      console.error('Failed to load Bible versions:', error);
      this.availableVersions = [];
    }
  }
  
  setupUI() {
  // Create modal if it doesn't exist
  if (!document.getElementById('offline-modal')) {
    this.createModal();
  }

  this.ui.modal = document.getElementById('offline-modal');
  this.ui.versionList = document.getElementById('offline-versions-list');
  this.ui.progressBar = document.getElementById('offline-progress');
  this.ui.statusText = document.getElementById('offline-status');
  this.ui.closeButton = document.getElementById('close-offline-modal');

  // Add button based on current page
  this.addPageSpecificButton();
}

addPageSpecificButton() {
  // Check if button already exists
  if (document.getElementById('toggle-offline-mode')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'toggle-offline-mode';
  button.className = 'offline-toggle-btn';
  button.innerHTML = '<i class="fa fa-download" aria-hidden="true"></i><span>Offline</span>';
  button.title = 'Manage offline Bible versions';

  // Page-specific placement
  const path = window.location.pathname;

  if (path.includes('study-desk.html')) {
    // Study Desk: Add to left sidebar
    const sidebar = document.querySelector('.study-sidebar') ||
                   document.querySelector('.sidebar') ||
                   document.querySelector('.nav-left');
    
    if (sidebar) {
      const newStudyBtn = sidebar.querySelector('.btn, button');
      if (newStudyBtn) {
        newStudyBtn.insertAdjacentElement('afterend', button);
      } else {
        sidebar.appendChild(button);
      }
    }

  } else if (path.includes('search.html')) {
    // Search: Add to menu area
    const menuArea = document.querySelector('.search-header') ||
                    document.querySelector('.search-toolbar') ||
                    document.querySelector('header') ||
                    document.querySelector('.container.flex');
    
    if (menuArea) {
      menuArea.appendChild(button);
    }

  } else if (path.includes('verse.html')) {
    // Verse: Add to toolbar
    const toolbar = document.querySelector('.verse-toolbar') ||
                   document.querySelector('.toolbar') ||
                   document.querySelector('.verse-header');
    
    if (toolbar) {
      toolbar.appendChild(button);
    }

  } else {
    // Default: index.html or others - add to header
    const header = document.querySelector('.landing-header-actions') ||
                  document.querySelector('header') ||
                  document.querySelector('.container.flex');
    
    if (header) {
      header.appendChild(button);
    }
  }
}

createModal() {
  const modalHTML = `
    <div id="offline-modal" class="modal" style="display: none;">
      <div class="modal-content offline-modal-content">
        <button type="button" id="close-offline-modal" class="modal-close">&times;</button>
        
        <h2>Offline Bible Setup</h2>
        
        <p>Select Bible versions to download for offline use. You can download up to 3 versions.</p>
        
        <div id="offline-versions-list" style="margin: 20px 0;"></div>
        
        <div id="offline-progress" style="display: none; margin: 15px 0;">
          <div class="progress-bar-container">
            <div id="offline-progress-bar" class="progress-bar"></div>
          </div>
        </div>
        
        <div id="offline-status" style="margin: 15px 0; min-height: 20px;"></div>
        
        <div class="modal-actions">
          <button type="button" id="download-selected" class="btn btn-primary">Download Selected</button>
          <button type="button" id="close-offline-btn" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <style>
      /* Offline Modal Styles */
      #offline-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      }
      
      #offline-modal .modal-content {
        background: white;
        padding: 25px;
        border-radius: 8px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }
      
      #offline-modal .modal-close {
        float: right;
        font-size: 28px;
        cursor: pointer;
        background: none;
        border: none;
        color: #666;
      }
      
      #offline-modal h2 {
        margin-top: 0;
        color: #333;
      }
      
      #offline-modal p {
        color: #666;
        margin-bottom: 20px;
      }
      
      .version-item {
        padding: 12px;
        margin: 8px 0;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        transition: background 0.2s;
      }
      
      .version-item:hover {
        background: #f9f9f9;
      }
      
      .version-item input[type="checkbox"] {
        margin-right: 12px;
      }
      
      .version-item .version-name {
        flex: 1;
        font-weight: 500;
        color: #333;
      }
      
      .version-item .version-abbr {
        color: #777;
        margin-left: 10px;
        font-size: 0.9em;
      }
      
      .version-item .version-downloaded {
        color: #4CAF50;
        margin-left: 10px;
        font-size: 0.85em;
        font-weight: 500;
      }
      
      .progress-bar-container {
        height: 20px;
        background: #f0f0f0;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .progress-bar {
        height: 100%;
        width: 0%;
        background: #4CAF50;
        transition: width 0.3s ease;
      }
      
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      
      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      
      .btn-primary {
        background: #4CAF50;
        color: white;
      }
      
      .btn-secondary {
        background: #f5f5f5;
        color: #333;
      }
      
      /* Offline Toggle Button Styles */
      .offline-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #1976d2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
        margin-left: 8px;
      }
      
      .offline-toggle-btn:hover {
        background: #1565c0;
      }
      
      .offline-toggle-btn i {
        font-size: 16px;
      }
      
      /* Study Desk specific - move button to left sidebar */
      .study-sidebar .offline-toggle-btn {
        width: 100%;
        justify-content: center;
        margin: 10px 0;
      }
      
      /* Search page specific */
      .search-header .offline-toggle-btn {
        margin-left: 15px;
      }
    </style>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  }
}
  
  setupEventListeners() {
    // Toggle modal
    if (this.ui.toggleButton) {
      this.ui.toggleButton.addEventListener('click', () => this.showModal());
    }
    
    // Close modal
    if (this.ui.closeButton) {
      this.ui.closeButton.addEventListener('click', () => this.hideModal());
    }
    
    const closeBtn = document.getElementById('close-offline-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideModal());
    }
    
    // Download selected
    const downloadBtn = document.getElementById('download-selected');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadSelectedVersions());
    }
    
    // Close on outside click
    if (this.ui.modal) {
      this.ui.modal.addEventListener('click', (e) => {
        if (e.target === this.ui.modal) {
          this.hideModal();
        }
      });
    }
  }
  
  async showModal() {
    await this.renderVersionList();
    this.ui.modal.style.display = 'block';
  }
  
  hideModal() {
    this.ui.modal.style.display = 'none';
  }
  
  async renderVersionList() {
    if (!this.ui.versionList) return;
    
    this.ui.versionList.innerHTML = '<p>Loading Bible versions...</p>';
    
    const downloaded = await window.OfflineBible.listDownloadedVersions();
    const downloadedIds = new Set(downloaded.map(v => v.bibleId));
    
    const listHTML = this.availableVersions.map(version => {
      const isDownloaded = downloadedIds.has(version.id);
      
      return `
        <label class="version-item">
          <input type="checkbox" name="bible-version" value="${version.id}" 
                 ${isDownloaded ? 'checked disabled' : ''} ${this.downloading.has(version.id) ? 'disabled' : ''}>
          <span class="version-name">${version.name}</span>
          <span class="version-abbr">(${version.abbreviation})</span>
          ${isDownloaded ? '<span class="version-downloaded">Downloaded</span>' : ''}
        </label>
      `;
    }).join('');
    
    this.ui.versionList.innerHTML = listHTML || '<p>No Bible versions available.</p>';
  }
  
  async downloadSelectedVersions() {
    const checkboxes = document.querySelectorAll('#offline-versions-list input[type="checkbox"]:checked:not([disabled])');
    
    if (checkboxes.length === 0) {
      alert('Please select at least one Bible version to download.');
      return;
    }
    
    if (checkboxes.length > 3) {
      alert('You can download a maximum of 3 Bible versions for offline use.');
      return;
    }
    
    const versionsToDownload = Array.from(checkboxes).map(cb => cb.value);
    
    // Show progress
    this.ui.progressBar.style.display = 'block';
    this.ui.statusText.textContent = `Downloading ${versionsToDownload.length} version(s)...`;
    
    let downloadedCount = 0;
    
    for (const versionId of versionsToDownload) {
      this.downloading.add(versionId);
      this.renderVersionList(); // Update UI to show downloading state
      
      try {
        // Update progress
        const progress = Math.round(((downloadedCount + 1) / versionsToDownload.length) * 100);
        document.getElementById('offline-progress-bar').style.width = `${progress}%`;
        
        // Download this version
        await this.downloadVersion(versionId);
        
        downloadedCount++;
        this.ui.statusText.textContent = `Downloaded ${downloadedCount} of ${versionsToDownload.length} versions`;
      } catch (error) {
        console.error(`Failed to download ${versionId}:`, error);
        this.ui.statusText.textContent = `Error downloading ${versionId}: ${error.message}`;
      } finally {
        this.downloading.delete(versionId);
        this.renderVersionList();
      }
    }
    
    // Complete
    this.ui.statusText.textContent = `Download complete! ${downloadedCount} version(s) ready for offline use.`;
    
    // Hide progress after delay
    setTimeout(() => {
      this.ui.progressBar.style.display = 'none';
    }, 2000);
  }
  
  async downloadVersion(bibleId) {
    this.ui.statusText.textContent = `Downloading ${bibleId}...`;
    
    try {
      // Fetch the Bible data from server
      const response = await fetch(`/api/bible-download/${bibleId}`);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store in IndexedDB
      await window.OfflineBible.storeBibleVersion(bibleId, data);
      
      // Also store books and chapters for faster access
      await this.storeBooksAndChapters(bibleId, data);
      
      console.log(`[Offline] Downloaded and stored ${bibleId}`);
      return true;
    } catch (error) {
      console.error(`[Offline] Failed to download ${bibleId}:`, error);
      throw error;
    }
  }
  
  async storeBooksAndChapters(bibleId, bibleData) {
    // Store books
    if (bibleData.books && Array.isArray(bibleData.books)) {
      for (const book of bibleData.books) {
        await window.OfflineBible.storeBook({
          id: `${bibleId}::${book.id}`,
          bibleId,
          bookId: book.id,
          name: book.name,
          abbreviation: book.abbreviation,
          testament: book.testament
        });
        
        // Store chapters
        if (book.chapters && Array.isArray(book.chapters)) {
          for (const chapter of book.chapters) {
            await window.OfflineBible.storeChapter({
              id: `${bibleId}::${book.id}::${chapter.id}`,
              bibleId,
              bookId: book.id,
              chapterId: chapter.id,
              reference: chapter.reference
            });
          }
        }
      }
    }
  }
  
  // Check if currently offline
  static isOffline() {
    return !navigator.onLine;
  }
}

// Initialize and export
window.OfflineManager = new OfflineManager();
