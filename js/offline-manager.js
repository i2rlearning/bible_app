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
 *        Automatically adds "Offline" button to appropriate locations
 */

class OfflineManager {
  constructor() {
    this.availableVersions = [];
    this.downloading = new Set();
    this.ui = {};
    this.button = null;
    
    this.init();
  }
  
  async init() {
    await this.loadAvailableVersions();
    this.createModal();
    this.addButtonToPage();
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
  
  createModal() {
    const modalHTML = `
      <div id="offline-modal" class="modal" style="display: none;">
        <div class="modal-content offline-modal-content">
          <button type="button" id="close-offline-modal" class="modal-close">&times;</button>
          
          <h2>Offline Bible Setup</h2>
          
          <p>Select Bible versions to download for offline use. You can download up to 3 versions.</p>
          
          <div id="offline-versions-list"></div>
          
          <div id="offline-progress" style="display: none; margin: 15px 0;">
            <div class="progress-bar-container">
              <div id="offline-progress-bar" class="progress-bar" style="width: 0%;"></div>
            </div>
          </div>
          
          <div id="offline-status" style="margin: 15px 0; min-height: 20px;"></div>
          
          <div class="modal-actions">
            <button type="button" id="download-selected" class="btn btn-primary">Download Selected</button>
            <button type="button" id="close-offline-btn" class="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    this.ui.modal = document.getElementById('offline-modal');
    this.ui.versionList = document.getElementById('offline-versions-list');
    this.ui.progressBar = document.getElementById('offline-progress');
    this.ui.progressBarInner = document.getElementById('offline-progress-bar');
    this.ui.statusText = document.getElementById('offline-status');
  }
  
  addButtonToPage() {
    if (document.getElementById('toggle-offline-mode')) return;
    
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.id = 'toggle-offline-mode';
    this.button.className = 'offline-toggle-btn';
    this.button.innerHTML = '<i class="fa fa-download" aria-hidden="true"></i><span>Offline</span>';
    this.button.title = 'Manage offline Bible versions';
    
    const path = window.location.pathname;
    
    // Study Desk: Add below New Study button in left sidebar
    if (path.includes('study-desk.html')) {
      const newStudyBtn = document.querySelector('.study-sidebar button, .left-panel button, .menu button, [class*="new-study"], [class*="New Study"]');
      if (newStudyBtn) {
        newStudyBtn.insertAdjacentElement('afterend', this.button);
        return;
      }
    }
    
    // Search: Add to header toolbar (same as index/verse)
    if (path.includes('search.html')) {
      const header = document.querySelector('.landing-header-actions, header, .header, .container.flex, .search-header');
      if (header) {
        header.appendChild(this.button);
        return;
      }
    }
    
    // Verse: Add to toolbar
    if (path.includes('verse.html')) {
      const toolbar = document.querySelector('.verse-toolbar, .toolbar, .verse-header, .header-toolbar');
      if (toolbar) {
        toolbar.appendChild(this.button);
        return;
      }
    }
    
    // Default (index.html): Add to header
    const header = document.querySelector('.landing-header-actions, header, .header, .container.flex');
    if (header) {
      header.appendChild(this.button);
    }
  }
  
  setupEventListeners() {
    // Use event delegation for the button since it's added dynamically
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'toggle-offline-mode') {
        this.showModal();
      }
    });
    
    if (this.ui.closeButton) {
      this.ui.closeButton.addEventListener('click', () => this.hideModal());
    }
    
    const closeBtn = document.getElementById('close-offline-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideModal());
    }
    
    const downloadBtn = document.getElementById('download-selected');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadSelectedVersions());
    }
    
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
    this.ui.modal.style.display = 'flex';
  }
  
  hideModal() {
    this.ui.modal.style.display = 'none';
  }
  
  async renderVersionList() {
    if (!this.ui.versionList) return;
    
    this.ui.versionList.innerHTML = '<p style="text-align: center; color: #666;">Loading Bible versions...</p>';
    
    const downloaded = await window.OfflineBible.listDownloadedVersions();
    const downloadedIds = new Set(downloaded.map(v => v.bibleId));
    
    if (this.availableVersions.length === 0) {
      this.ui.versionList.innerHTML = '<p style="text-align: center; color: #d32f2f;">No Bible versions available. Please check your internet connection.</p>';
      return;
    }
    
    const listHTML = this.availableVersions.map(version => {
      const isDownloaded = downloadedIds.has(version.id);
      
      return `
        <label class="version-item">
          <input type="checkbox" name="bible-version" value="${version.id}" 
                 ${isDownloaded ? 'checked disabled' : ''} ${this.downloading.has(version.id) ? 'disabled' : ''}>
          <span class="version-name">${version.name}</span>
          <span class="version-abbr">(${version.abbreviation})</span>
          ${isDownloaded ? '<span class="version-downloaded">✓ Downloaded</span>' : ''}
        </label>
      `;
    }).join('');
    
    this.ui.versionList.innerHTML = listHTML;
  }
  
  async downloadSelectedVersions() {
    const checkboxes = document.querySelectorAll('#offline-versions-list input[type="checkbox"]:checked:not([disabled])');
    
    if (checkboxes.length === 0) {
      this.ui.statusText.textContent = 'Please select at least one Bible version.';
      this.ui.statusText.style.color = '#d32f2f';
      return;
    }
    
    if (checkboxes.length > 3) {
      this.ui.statusText.textContent = 'Maximum of 3 versions allowed.';
      this.ui.statusText.style.color = '#d32f2f';
      return;
    }
    
    const versionsToDownload = Array.from(checkboxes).map(cb => cb.value);
    
    this.ui.progressBar.style.display = 'block';
    this.ui.progressBarInner.style.width = '0%';
    this.ui.statusText.textContent = `Downloading ${versionsToDownload.length} version(s)...`;
    this.ui.statusText.style.color = '#333';
    
    let downloadedCount = 0;
    
    for (const versionId of versionsToDownload) {
      this.downloading.add(versionId);
      this.renderVersionList();
      
      try {
        const progress = Math.round(((downloadedCount + 1) / versionsToDownload.length) * 100);
        this.ui.progressBarInner.style.width = `${progress}%`;
        
        await this.downloadVersion(versionId);
        
        downloadedCount++;
        this.ui.statusText.textContent = `Downloaded ${downloadedCount} of ${versionsToDownload.length}`;
      } catch (error) {
        console.error(`Failed to download ${versionId}:`, error);
        this.ui.statusText.textContent = `Error downloading ${versionId}`;
        this.ui.statusText.style.color = '#d32f2f';
      } finally {
        this.downloading.delete(versionId);
        this.renderVersionList();
      }
    }
    
    this.ui.statusText.textContent = `✓ ${downloadedCount} version(s) ready for offline use!`;
    this.ui.statusText.style.color = '#4CAF50';
    
    setTimeout(() => {
      this.ui.progressBar.style.display = 'none';
    }, 2000);
  }
  
  async downloadVersion(bibleId) {
    try {
      const response = await fetch(`/api/bible-download/${bibleId}`);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      await window.OfflineBible.storeBibleVersion(bibleId, data);
      await this.storeBooksAndChapters(bibleId, data);
      
      return true;
    } catch (error) {
      console.error(`[Offline] Failed to download ${bibleId}:`, error);
      throw error;
    }
  }
  
  async storeBooksAndChapters(bibleId, bibleData) {
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.OfflineManager = new OfflineManager();
});
