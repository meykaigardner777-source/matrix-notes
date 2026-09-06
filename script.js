document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // OPTIMIZED MATRIX CANVAS ANIMATION
  // ==========================================
  const canvas = document.getElementById('matrix');
  if (canvas) {
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();

    const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789=+-*';
    const fontSize = 16;
    let columns = Math.floor(canvas.width / fontSize);
    let drops = Array(columns).fill(1);

    // Frame Throttling to 30 FPS to reduce CPU/GPU lag
    let lastTime = 0;
    const fpsInterval = 1000 / 30;

    function drawMatrix(timestamp) {
      requestAnimationFrame(drawMatrix);

      const elapsed = timestamp - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = timestamp - (elapsed % fpsInterval);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#aaaaaa';
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    requestAnimationFrame(drawMatrix);

    // Debounced Resize handler to avoid lag during window resizing
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeCanvas();
        columns = Math.floor(canvas.width / fontSize);
        drops = Array(columns).fill(1);
      }, 100);
    });
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
    
    // Fast fragment DOM insertion to prevent browser reflow lag
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
  // PEER-TO-PEER SYNC LOGIC
  // ==========================================
  let peer = null;
  let activeConnection = null;
  const localPeerId = 'matrix-' + Math.floor(Math.random() * 899999 + 100000);

  function initPeer() {
    if (typeof Peer !== 'undefined' && !peer) {
      try {
        peer = new Peer(localPeerId, {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          }
        });

        peer.on('connection', (conn) => {
          activeConnection = conn;
          setupConnectionHandlers(conn);
        });

        peer.on('error', (err) => {
          console.error('PeerJS Error:', err);
        });
      } catch (err) {
        console.error('Failed to initialize PeerJS:', err);
      }
    }
  }

  initPeer();

  function setupConnectionHandlers(conn) {
    conn.on('open', () => {
      if (syncNoteBtn) {
        syncNoteBtn.innerText = 'Connected';
        syncNoteBtn.style.backgroundColor = 'rgba(40, 160, 80, 0.85)';
      }
      alert('Successfully paired and connected!');
      broadcastSync();
    });

    conn.on('data', (incomingNotes) => {
      if (Array.isArray(incomingNotes)) {
        mergeIncomingNotes(incomingNotes);
      }
    });

    conn.on('close', () => {
      if (syncNoteBtn) {
        syncNoteBtn.innerText = 'Sync';
        syncNoteBtn.style.backgroundColor = 'rgba(0, 120, 215, 0.85)';
      }
      activeConnection = null;
    });
  }

  function handleSyncClick() {
    if (!peer) initPeer();

    if (!peer) {
      alert('Sync service offline or blocked by browser settings.');
      return;
    }

    if (activeConnection && activeConnection.open) {
      alert(`Already connected!\nYour Device Code: ${localPeerId}`);
      return;
    }

    const partnerCode = prompt(`Your Device Code: ${localPeerId}\n\nEnter Partner Code to Sync:`);
    if (partnerCode && partnerCode.trim() !== '') {
      const conn = peer.connect(partnerCode.trim(), { reliable: true });
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
      activeConnection.send(notes);
    }
  }

  // Event Listeners
  if (newNoteBtn) newNoteBtn.addEventListener('click', (e) => { e.preventDefault(); createNewNote(); });
  if (saveNoteBtn) saveNoteBtn.addEventListener('click', (e) => { e.preventDefault(); saveNote(); });
  if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', (e) => { e.preventDefault(); deleteNote(); });
  if (syncNoteBtn) syncNoteBtn.addEventListener('click', (e) => { e.preventDefault(); handleSyncClick(); });

  renderNotesList();
});
