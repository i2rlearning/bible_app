// /js/offline-manager.js - Manage offline Bible versions

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
    this.ui.toggleButton = document.getElementById('toggle-offline-mode');
    this.ui.closeButton = document.getElementById('close-offline-modal');
  }
  
  createModal() {
    const modalHTML = `
      <div id="offline-modal" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow: auto;">
          <button type="button" id="close-offline-modal" class="modal-close" style="float: right; font-size: 28px; cursor: pointer;">&times;</button>
          
          <h2 style="margin-top: 0;">Offline Bible Setup</h2>
          
          <p style="margin-bottom: 20px;">Select Bible versions to download for offline use. You can download up to 3 versions.</p>
          
          <div id="offline-versions-list" style="margin-bottom: 20px;"></div>
          
          <div id="offline-progress" style="display: none; margin-bottom: 15px;">
            <div style="height: 20px; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
              <div id="offline-progress-bar" style="height: 100%; width: 0%; background: #4CAF50; transition: width 0.3s;"></div>
            </div>
          </div>
          
          <div id="offline-status" style="margin-bottom: 15px; min-height: 20px;"></div>
          
          <div style="text-align: right;">
            <button type="button" id="download-selected" class="btn btn-primary" style="padding: 8px 16px;">Download Selected</button>
            <button type="button" id="close-offline-btn" class="btn btn-secondary" style="padding: 8px 16px; margin-left: 10px;">Close</button>
          </div>
        </div>
      </div>
      
      <style>
        #offline-modal .modal-content {
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        #offline-modal .version-item {
          padding: 10px;
          margin: 5px 0;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        #offline-modal .version-item:hover {
          background: #f9f9f9;
        }
        #offline-modal .version-item input[type="checkbox"] {
          margin-right: 10px;
        }
        #offline-modal .version-item .version-name {
          flex: 1;
          font-weight: bold;
        }
        #offline-modal .version-item .version-abbr {
          color: #666;
          margin-left: 10px;
        }
        #offline-modal .version-item .version-downloaded {
          color: #4CAF50;
          margin-left: 10px;
          font-size: 12px;
        }
        #offline-modal .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        #offline-modal .btn-primary {
          background: #4CAF50;
          color: white;
        }
        #offline-modal .btn-secondary {
          background: #f0f0f0;
          color: #333;
        }
      </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add offline toggle button to your header
    if (!document.getElementById('toggle-offline-mode')) {
      const headerActions = document.querySelector('.landing-header-actions') ||
                           document.querySelector('.verse-toolbar-left') ||
                           document.querySelector('.container.flex') ||
                           document.body;
      
      const offlineBtn = document.createElement('button');
      offlineBtn.type = 'button';
      offlineBtn.id = 'toggle-offline-mode';
      offlineBtn.className = 'auth-button';
      offlineBtn.innerHTML = '<i class="fa fa-download" aria-hidden="true"></i><span>Offline</span>';
      offlineBtn.title = 'Manage offline Bible versions';
      offlineBtn.style.marginLeft = '10px';
      
      headerActions.appendChild(offlineBtn);
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
