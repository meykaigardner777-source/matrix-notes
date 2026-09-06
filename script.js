document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // ULTRA-OPTIMIZED MATRIX CANVAS ANIMATION
  // ==========================================
  const canvas = document.getElementById('matrix');
  if (canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });

    const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789=+-*';
    const fontSize = 16;
    let columns = 0;
    let drops = [];

    const charCache = document.createElement('canvas');
    const charCtx = charCache.getContext('2d');
    const charMap = new Map();

    function prepareCharCache() {
      const scaledSize = fontSize;
      charCache.width = scaledSize * chars.length;
      charCache.height = scaledSize;
      
      if (!charCtx) return;

      charCtx.fillStyle = '#aaaaaa';
      charCtx.font = `${scaledSize}px monospace`;
      charCtx.textBaseline = 'top';

      for (let i = 0; i < chars.length; i++) {
        const char = chars.charAt(i);
        const x = i * scaledSize;
        charCtx.fillText(char, x, 0);
        charMap.set(char, x);
      }
    }
    prepareCharCache();

    function resizeCanvas() {
      const width = window.innerWidth || 800;
      const height = window.innerHeight || 600;
      canvas.width = width;
      canvas.height = height;
      
      columns = Math.max(1, Math.floor(width / fontSize));
      drops = new Array(columns).fill(1);

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    }
    resizeCanvas();

    let lastTime = 0;
    const fpsInterval = 1000 / 30;

    function drawMatrix(timestamp) {
      requestAnimationFrame(drawMatrix);

      const elapsed = timestamp - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = timestamp - (elapsed % fpsInterval);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < drops.length; i++) {
        const char = chars.charAt(Math.floor(Math.random() * chars.length));
        const sourceX = charMap.get(char);

        if (sourceX !== undefined) {
          ctx.drawImage(
            charCache,
            sourceX, 0, fontSize, fontSize,
            i * fontSize, drops[i] * fontSize, fontSize, fontSize
          );
        }

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    requestAnimationFrame(drawMatrix);

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 150);
    }, { passive: true });
  }

  // ==========================================
  // NOTE APP LOGIC
  // ==========================================
  let notes = JSON.parse(localStorage.getItem('my_notes') || '[]');
  let currentNoteId = null;

  const newNoteBtn = document.getElementById('new-note-btn');
  const saveNoteBtn = document.getElementById('save-note-btn');
  const deleteNoteBtn = document.getElementById('delete-note-btn');
  const syncNoteBtn = document.getElementById('sync-note-btn');
  const noteTitle = document.getElementById('note-title');
  const noteBody = document.getElementById('note-body');
  const notesList = document.getElementById('notes-list');

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function renderNotesList() {
    if (!notesList) return;
    
    const fragment = document.createDocumentFragment();

    if (notes.length === 0) {
      notesList.innerHTML = '<div style="color: #888; font-size: 13px; text-align: center; margin-top: 20px;">No notes yet</div>';
      return;
    }

    notes.forEach((note) => {
      const item = document.createElement('div');
      item.className = 'note-item';
      if (note.id === currentNoteId) {
        item.style.borderColor = 'rgba(255, 255, 255, 0.6)';
        item.style.background = 'rgba(255, 255, 255, 0.18)';
      }

      item.innerHTML = `
        <div class="note-item-title">${escapeHTML(note.title) || 'Untitled Note'}</div>
        <div class="note-item-preview">${escapeHTML(note.body) || 'Empty note...'}</div>
      `;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        openNote(note.id);
      });
      fragment.appendChild(item);
    });

    notesList.innerHTML = '';
    notesList.appendChild(fragment);
  }

  function openNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    currentNoteId = note.id;
    if (noteTitle) noteTitle.value = note.title;
    if (noteBody) noteBody.value = note.body;
    renderNotesList();
  }

  function createNewNote() {
    currentNoteId = null;
    if (noteTitle) {
      noteTitle.value = '';
      noteTitle.focus();
    }
    if (noteBody) noteBody.value = '';
    renderNotesList();
  }

  function saveNote() {
    const titleVal = noteTitle ? noteTitle.value.trim() : '';
    const bodyVal = noteBody ? noteBody.value.trim() : '';

    if (!titleVal && !bodyVal) return;

    if (!currentNoteId) {
      currentNoteId = Date.now();
    }

    const existingIndex = notes.findIndex((n) => n.id === currentNoteId);
    const noteData = {
      id: currentNoteId,
      title: titleVal,
      body: bodyVal,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      notes[existingIndex] = noteData;
    } else {
      notes.unshift(noteData);
    }

    localStorage.setItem('my_notes', JSON.stringify(notes));
    renderNotesList();
    broadcastSync();
  }

  function deleteNote() {
    if (!currentNoteId) {
      if (noteTitle) noteTitle.value = '';
      if (noteBody) noteBody.value = '';
      return;
    }

    notes = notes.filter((n) => n.id !== currentNoteId);
    localStorage.setItem('my_notes', JSON.stringify(notes));

    currentNoteId = null;
    if (noteTitle) noteTitle.value = '';
    if (noteBody) noteBody.value = '';

    renderNotesList();
    broadcastSync();
  }

  // ==========================================
  // RELIABLE PEER-TO-PEER SYNC LOGIC
  // ==========================================
  let peer = null;
  let activeConnection = null;
  const localPeerId = 'matrix-' + Math.floor(Math.random() * 899999 + 100000);

  function updateSyncUI(status, color) {
    if (syncNoteBtn) {
      syncNoteBtn.innerText = status;
      syncNoteBtn.style.backgroundColor = color;
    }
  }

  function initPeer() {
    if (typeof Peer !== 'undefined' && !peer) {
      try {
        peer = new Peer(localPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' }
            ]
          }
        });

        peer.on('open', () => {
          console.log('Peer initialized with ID:', localPeerId);
        });

        peer.on('connection', (conn) => {
          activeConnection = conn;
          setupConnectionHandlers(conn);
        });

        peer.on('error', (err) => {
          console.error('PeerJS Error:', err);
          updateSyncUI('Sync Fail', 'rgba(200, 50, 50, 0.85)');
          setTimeout(() => updateSyncUI('Sync', 'rgba(0, 120, 215, 0.85)'), 3000);
        });
      } catch (err) {
        console.error('Failed to initialize PeerJS:', err);
      }
    }
  }

  initPeer();

  function setupConnectionHandlers(conn) {
    conn.on('open', () => {
      updateSyncUI('Connected', 'rgba(40, 160, 80, 0.85)');
      
      // Force bi-directional note sync on open
      setTimeout(() => {
        broadcastSync();
      }, 300);
    });

    conn.on('data', (data) => {
      if (data && data.type === 'SYNC_NOTES' && Array.isArray(data.payload)) {
        mergeIncomingNotes(data.payload);
      } else if (Array.isArray(data)) {
        mergeIncomingNotes(data);
      }
    });

    conn.on('close', () => {
      updateSyncUI('Sync', 'rgba(0, 120, 215, 0.85)');
      activeConnection = null;
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      updateSyncUI('Sync', 'rgba(0, 120, 215, 0.85)');
    });
  }

  function handleSyncClick() {
    if (!peer) initPeer();

    if (!peer) {
      alert('Sync service unavailable. Check your internet connection or browser settings.');
      return;
    }

    if (activeConnection && activeConnection.open) {
      alert(`Connected!\nDevice Code: ${localPeerId}`);
      return;
    }

    const input = prompt(`Your Code: ${localPeerId}\n\nEnter Partner Code:`);
    if (input && input.trim() !== '') {
      let partnerCode = input.trim();
      if (!partnerCode.startsWith('matrix-') && !isNaN(partnerCode)) {
        partnerCode = 'matrix-' + partnerCode;
      }

      updateSyncUI('Connecting...', 'rgba(215, 120, 0, 0.85)');
      
      const conn = peer.connect(partnerCode, {
        reliable: true,
        serialization: 'json'
      });

      activeConnection = conn;
      setupConnectionHandlers(conn);
    }
  }

  function mergeIncomingNotes(remoteNotes) {
    let updated = false;

    remoteNotes.forEach((rNote) => {
      const lIndex = notes.findIndex((n) => n.id === rNote.id);
      if (lIndex === -1) {
        notes.push(rNote);
        updated = true;
      } else {
        const localTime = notes[lIndex].updatedAt || 0;
        const remoteTime = rNote.updatedAt || 0;
        if (remoteTime > localTime) {
          notes[lIndex] = rNote;
          updated = true;
        }
      }
    });

    if (updated) {
      notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      localStorage.setItem('my_notes', JSON.stringify(notes));
      renderNotesList();

      if (currentNoteId) {
        openNote(currentNoteId);
      }
    }
  }

  function broadcastSync() {
    if (activeConnection && activeConnection.open) {
      activeConnection.send({
        type: 'SYNC_NOTES',
        payload: notes
      });
    }
  }

  // Event Listeners
  if (newNoteBtn) newNoteBtn.addEventListener('click', (e) => { e.preventDefault(); createNewNote(); });
  if (saveNoteBtn) saveNoteBtn.addEventListener('click', (e) => { e.preventDefault(); saveNote(); });
  if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', (e) => { e.preventDefault(); deleteNote(); });
  if (syncNoteBtn) syncNoteBtn.addEventListener('click', (e) => { e.preventDefault(); handleSyncClick(); });

  renderNotesList();
});
