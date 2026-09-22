// Global Application State & Storage Keys
    const STORAGE_KEY = 'matrix_notes_v3';
    const LEGACY_KEYS = ['matrix_notes_v2', 'matrix_notes', 'notes', 'matrix_notes_v1', 'matrixNotes'];
    
    let notes = [];
    let currentNoteId = null;
    let strokes = [];
    let currentStroke = null;
    let isHighlightingMode = false;
    let isEraserMode = false;
    let isDrawing = false;
    let currentHighlightColor = '#ffd700';

    // PeerJS Networking State
    let peer = null;
    let myCode = null;
    let activeConnection = null;
    let syncTimeout = null;

    function generate4DigitCode() {
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    // Robust Storage & Migration Loader
    function loadAndMigrateNotes() {
      notes = [];
      const existingIds = new Set();

      try {
        const rawCurrent = localStorage.getItem(STORAGE_KEY);
        if (rawCurrent) {
          const parsed = JSON.parse(rawCurrent);
          if (Array.isArray(parsed)) {
            parsed.forEach(n => {
              if (n && n.id) {
                notes.push(n);
                existingIds.add(n.id);
              }
            });
          }
        }
      } catch (e) {
        console.error('Error reading primary storage:', e);
      }

      LEGACY_KEYS.forEach(oldKey => {
        const rawLegacy = localStorage.getItem(oldKey);
        if (rawLegacy) {
          try {
            const legacyNotes = JSON.parse(rawLegacy);
            if (Array.isArray(legacyNotes)) {
              legacyNotes.forEach(note => {
                if (note && note.id && !existingIds.has(note.id)) {
                  notes.push({
                    id: note.id,
                    title: note.title || 'Untitled Note',
                    body: note.body || note.content || note.text || '',
                    strokes: note.strokes || [],
                    updatedAt: note.updatedAt || note.timestamp || Date.now()
                  });
                  existingIds.add(note.id);
                }
              });
            }
          } catch (err) {
            console.warn(`Skipping unparseable key "${oldKey}":`, err);
          }
        }
      });

      notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      } catch (e) {
        console.error('Could not write consolidated notes:', e);
      }
    }

    loadAndMigrateNotes();

    function setSyncStatus(text, resetAfter = 0, isError = false) {
      const btn = document.getElementById('sync-note-btn');
      if (!btn) return;

      if (syncTimeout) clearTimeout(syncTimeout);

      btn.textContent = text;
      btn.style.backgroundColor = isError ? 'rgba(210, 40, 40, 0.9)' : (text.includes('Connected') || text.includes('Synced') ? 'rgba(30, 150, 70, 0.9)' : '');

      if (resetAfter > 0) {
        syncTimeout = setTimeout(() => {
          btn.textContent = 'Sync';
          btn.style.backgroundColor = '';
        }, resetAfter);
      }
    }

    function initPeerJS() {
      if (typeof Peer === 'undefined') return;

      myCode = generate4DigitCode();
      const peerId = 'matrix-notes-v3-' + myCode;

      peer = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      peer.on('open', () => {
        console.log('Peer ID created successfully:', myCode);
      });

      peer.on('connection', (conn) => {
        setupP2PConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        setSyncStatus('Failed!', 3000, true);
      });
    }

    function setupP2PConnection(conn) {
      activeConnection = conn;
      setSyncStatus('Connecting....');

      conn.on('open', () => {
        setSyncStatus('Connected!', 3000);
        conn.send({ type: 'SYNC_NOTES_PAYLOAD', notes: notes });
      });

      conn.on('data', (data) => {
        if (data && data.type === 'SYNC_NOTES_PAYLOAD') {
          mergeIncomingNotes(data.notes);
          setSyncStatus('Synced!', 3000);
        }
      });

      conn.on('close', () => {
        activeConnection = null;
      });

      conn.on('error', () => {
        setSyncStatus('Failed!', 3000, true);
      });
    }

    function mergeIncomingNotes(incomingNotes) {
      if (!Array.isArray(incomingNotes)) return;

      incomingNotes.forEach(remoteNote => {
        const localIdx = notes.findIndex(n => n.id === remoteNote.id);
        if (localIdx >= 0) {
          if ((remoteNote.updatedAt || 0) > (notes[localIdx].updatedAt || 0)) {
            notes[localIdx] = remoteNote;
          }
        } else {
          notes.push(remoteNote);
        }
      });

      notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      } catch (e) {}

      renderNotesList();

      if (currentNoteId) {
        const current = notes.find(n => n.id === currentNoteId);
        if (current) {
          document.getElementById('note-title').value = current.title;
          document.getElementById('note-body').value = current.body;
          strokes = current.strokes || [];
          redrawStrokes();
        }
      }
    }

    window.handleSync = function() {
      if (!myCode) {
        setSyncStatus('Connecting....');
        setTimeout(() => setSyncStatus('Failed!', 3000, true), 1500);
        return;
      }

      if (activeConnection && activeConnection.open) {
        window.handleSaveNote();
        activeConnection.send({ type: 'SYNC_NOTES_PAYLOAD', notes: notes });
        setSyncStatus('Synced!', 3000);
        return;
      }

      const inputCode = prompt(
        `YOUR SYNC CODE: ${myCode}\n\nEnter the 4-character Sync Code from the other device:`
      );

      if (inputCode && inputCode.trim()) {
        const cleanCode = inputCode.trim().toUpperCase();
        if (cleanCode.length !== 4) {
          alert('Sync code must be exactly 4 characters.');
          setSyncStatus('Failed!', 3000, true);
          return;
        }

        setSyncStatus('Connecting....');
        const targetPeerId = 'matrix-notes-v3-' + cleanCode;
        const conn = peer.connect(targetPeerId);

        const connTimeout = setTimeout(() => {
          if (!activeConnection || !activeConnection.open) {
            setSyncStatus('Failed!', 3000, true);
          }
        }, 8000);

        conn.on('open', () => {
          clearTimeout(connTimeout);
        });

        setupP2PConnection(conn);
      }
    };

    window.toggleSidebar = function() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('active');
    };

    window.closeSidebar = function() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('active');
    };

    function updateHighlightButtonGlow() {
      const btn = document.getElementById('toggle-highlight-btn');
      if (!btn) return;

      if (isHighlightingMode && !isEraserMode) {
        btn.style.backgroundColor = currentHighlightColor;
        btn.style.color = '#000000';
        btn.style.borderColor = '#ffffff';
        btn.style.boxShadow = `0 0 16px ${currentHighlightColor}`;
      } else {
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.boxShadow = '';
      }
    }

    window.setHighlightColor = function(colorHex, element) {
      currentHighlightColor = colorHex;
      isEraserMode = false;

      const eraseBtn = document.getElementById('erase-highlight-btn');
      if (eraseBtn) eraseBtn.classList.remove('is-active');

      const canvas = document.getElementById('highlight-canvas');
      if (canvas && isHighlightingMode) {
        canvas.classList.add('drawing-mode');
        canvas.classList.remove('erasing-mode');
      }

      const swatches = document.querySelectorAll('.color-swatch');
      swatches.forEach(s => s.classList.remove('active'));
      if (element) element.classList.add('active');

      updateHighlightButtonGlow();
    };

    window.handleNewNote = function() {
      currentNoteId = null;
      document.getElementById('note-title').value = '';
      document.getElementById('note-body').value = '';
      strokes = [];
      redrawStrokes();
      renderNotesList();
      closeSidebar();
      flashButtonText('new-note-btn', 'Created', '+ New Note');
    };

    window.handleSaveNote = function() {
      const titleInput = document.getElementById('note-title');
      const bodyInput = document.getElementById('note-body');
      const titleVal = titleInput.value.trim();
      const bodyVal = bodyInput.value.trim();

      if (!currentNoteId) {
        currentNoteId = Date.now();
      }

      const noteData = {
        id: currentNoteId,
        title: titleVal || 'Untitled Note',
        body: bodyVal,
        strokes: strokes,
        updatedAt: Date.now()
      };

      const idx = notes.findIndex(n => n.id === currentNoteId);
      if (idx >= 0) {
        notes[idx] = noteData;
      } else {
        notes.unshift(noteData);
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      } catch (e) {
        console.error('Storage write error:', e);
      }

      renderNotesList();
      flashButtonText('save-note-btn', 'Saved!', 'Save');

      if (activeConnection && activeConnection.open) {
        activeConnection.send({ type: 'SYNC_NOTES_PAYLOAD', notes: notes });
      }
    };

    window.handleDeleteNote = function() {
      if (currentNoteId) {
        notes = notes.filter(n => n.id !== currentNoteId);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        } catch (e) {}
      }

      currentNoteId = null;
      document.getElementById('note-title').value = '';
      document.getElementById('note-body').value = '';
      strokes = [];
      redrawStrokes();
      renderNotesList();

      flashButtonText('delete-note-btn', 'Deleted', 'Delete');

      if (activeConnection && activeConnection.open) {
        activeConnection.send({ type: 'SYNC_NOTES_PAYLOAD', notes: notes });
      }
    };

    window.handleToggleHighlight = function() {
      const eraseBtn = document.getElementById('erase-highlight-btn');
      const canvas = document.getElementById('highlight-canvas');
      const palette = document.getElementById('color-palette');
      const clearBtn = document.getElementById('clear-highlight-btn');

      isHighlightingMode = !isHighlightingMode;

      if (isHighlightingMode) {
        isEraserMode = false;
        canvas.classList.add('drawing-mode');
        canvas.classList.remove('erasing-mode');
        eraseBtn.classList.remove('is-active');
        palette.classList.add('show');
        clearBtn.classList.add('show');
        eraseBtn.classList.add('show');
      } else {
        isEraserMode = false;
        canvas.classList.remove('drawing-mode');
        canvas.classList.remove('erasing-mode');
        eraseBtn.classList.remove('is-active');
        palette.classList.remove('show');
        clearBtn.classList.remove('show');
        eraseBtn.classList.remove('show');
      }

      updateHighlightButtonGlow();
    };

    window.handleToggleEraser = function() {
      const eraseBtn = document.getElementById('erase-highlight-btn');
      const canvas = document.getElementById('highlight-canvas');

      isEraserMode = !isEraserMode;

      if (isEraserMode) {
        canvas.classList.remove('drawing-mode');
        canvas.classList.add('erasing-mode');
        eraseBtn.classList.add('is-active');
      } else {
        canvas.classList.add('drawing-mode');
        canvas.classList.remove('erasing-mode');
        eraseBtn.classList.remove('is-active');
      }

      updateHighlightButtonGlow();
    };

    window.handleClearHighlight = function() {
      strokes = [];
      redrawStrokes();
      window.handleSaveNote();
    };

    window.handleNumberedList = function() {
      const body = document.getElementById('note-body');
      const text = body.value;

      if (!text.length) {
        body.value = '1: ';
        body.focus();
        closeSidebar();
        return;
      }

      let count = 1;
      const lines = text.split('\n');
      const numbered = lines.map(line => {
        if (count <= 999) {
          return `${count++}: ${line}`;
        }
        return line;
      });

      body.value = numbered.join('\n');
      body.focus();
      closeSidebar();
    };

    function flashButtonText(btnId, tempText, originalText) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.textContent = tempText;
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1000);
    }

    function renderNotesList() {
      const listEl = document.getElementById('notes-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      if (notes.length === 0) {
        listEl.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:10px;">No notes saved</div>';
        return;
      }

      notes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');
        item.innerHTML = `
          <div class="note-item-title">${escapeHTML(note.title)}</div>
          <div class="note-item-preview">${escapeHTML(note.body || 'Drawing note')}</div>
        `;
        item.onclick = () => openNote(note.id);
        listEl.appendChild(item);
      });
    }

    function openNote(id) {
      const note = notes.find(n => n.id === id);
      if (!note) return;
      currentNoteId = note.id;
      document.getElementById('note-title').value = note.title;
      document.getElementById('note-body').value = note.body;
      strokes = note.strokes || [];
      resizeHighlightCanvas();
      renderNotesList();
      closeSidebar();
    }

    function escapeHTML(str) {
      return (str || '').replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }

    function resizeHighlightCanvas() {
      const container = document.getElementById('editor-container');
      const hlCanvas = document.getElementById('highlight-canvas');
      if (!container || !hlCanvas) return;
      const rect = container.getBoundingClientRect();
      hlCanvas.width = rect.width;
      hlCanvas.height = rect.height;
      redrawStrokes();
    }

    function redrawStrokes() {
      const hlCanvas = document.getElementById('highlight-canvas');
      if (!hlCanvas) return;
      const hlCtx = hlCanvas.getContext('2d');
      hlCtx.clearRect(0, 0, hlCanvas.width, hlCanvas.height);
      if (!strokes || strokes.length === 0) return;

      const w = hlCanvas.width;
      const h = hlCanvas.height;

      strokes.forEach(strokeObj => {
        const points = strokeObj.points || strokeObj;
        if (!points || points.length < 2) return;

        if (strokeObj.isEraser) {
          hlCtx.globalCompositeOperation = 'destination-out';
          hlCtx.globalAlpha = 1.0;
          hlCtx.strokeStyle = 'rgba(0,0,0,1)';
          hlCtx.lineWidth = 26;
        } else {
          hlCtx.globalCompositeOperation = 'source-over';
          hlCtx.globalAlpha = 0.45;
          hlCtx.strokeStyle = strokeObj.color || '#ffd700';
          hlCtx.lineWidth = 14;
        }

        hlCtx.shadowBlur = 0;
        hlCtx.lineCap = 'round';
        hlCtx.lineJoin = 'round';

        hlCtx.beginPath();
        hlCtx.moveTo(points[0].x * w, points[0].y * h);
        for (let i = 1; i < points.length; i++) {
          hlCtx.lineTo(points[i].x * w, points[i].y * h);
        }
        hlCtx.stroke();
      });

      hlCtx.globalAlpha = 1.0;
      hlCtx.globalCompositeOperation = 'source-over';
    }

    function getNormalizedCoords(e) {
      const hlCanvas = document.getElementById('highlight-canvas');
      const rect = hlCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      };
    }

    window.addEventListener('DOMContentLoaded', () => {
      initPeerJS();

      const hlCanvas = document.getElementById('highlight-canvas');

      function startStroke(e) {
        if (!isHighlightingMode) return;
        if (e.cancelable) e.preventDefault();
        isDrawing = true;

        const pt = getNormalizedCoords(e);
        currentStroke = {
          color: currentHighlightColor,
          isEraser: isEraserMode,
          points: [pt]
        };
        strokes.push(currentStroke);
        redrawStrokes();
      }

      function moveStroke(e) {
        if (!isDrawing || !isHighlightingMode) return;
        if (e.cancelable) e.preventDefault();
        const pt = getNormalizedCoords(e);
        currentStroke.points.push(pt);
        redrawStrokes();
      }

      function endStroke() {
        if (!isDrawing) return;
        isDrawing = false;
        currentStroke = null;
        window.handleSaveNote();
      }

      hlCanvas.addEventListener('mousedown', startStroke);
      hlCanvas.addEventListener('mousemove', moveStroke);
      hlCanvas.addEventListener('mouseup', endStroke);
      hlCanvas.addEventListener('mouseleave', endStroke);

      hlCanvas.addEventListener('touchstart', startStroke, { passive: false });
      hlCanvas.addEventListener('touchmove', moveStroke, { passive: false });
      hlCanvas.addEventListener('touchend', endStroke);

      document.getElementById('note-body').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const start = this.selectionStart;
          const textBefore = this.value.substring(0, start);
          const currentLine = textBefore.split('\n').pop();
          const match = currentLine.match(/^(\d{1,3}):\s*/);

          if (match) {
            e.preventDefault();
            const currNum = parseInt(match[1], 10);

            if (currentLine.trim() === `${currNum}:`) {
              const lineStart = start - currentLine.length;
              this.value = this.value.substring(0, lineStart) + '\n' + this.value.substring(start);
              this.selectionStart = this.selectionEnd = lineStart + 1;
              return;
            }

            if (currNum < 999) {
              const nextNum = currNum + 1;
              const insert = `\n${nextNum}: `;
              this.value = textBefore + insert + this.value.substring(start);
              this.selectionStart = this.selectionEnd = start + insert.length;
            }
          }
        }
      });

      // Matrix Background Animation
      const matrixCanvas = document.getElementById('matrix');
      const mCtx = matrixCanvas.getContext('2d');
      const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789';
      const fontSize = 16;
      let columns = 0;
      let drops = [];

      function resizeMatrix() {
        matrixCanvas.width = window.innerWidth;
        matrixCanvas.height = window.innerHeight;
        columns = Math.floor(matrixCanvas.width / fontSize);
        drops = new Array(columns).fill(1);
      }
      resizeMatrix();

      function drawMatrix() {
        mCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        mCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);

        mCtx.fillStyle = '#ffffff';
        mCtx.font = fontSize + 'px monospace';

        for (let i = 0; i < drops.length; i++) {
          const text = chars.charAt(Math.floor(Math.random() * chars.length));
          mCtx.fillText(text, i * fontSize, drops[i] * fontSize);
          if (drops[i] * fontSize > matrixCanvas.height && Math.random() > 0.975) {
            drops[i] = 0;
          }
          drops[i]++;
        }
      }
      setInterval(drawMatrix, 33);

      window.addEventListener('resize', () => {
        resizeMatrix();
        resizeHighlightCanvas();
      });

      resizeHighlightCanvas();
      renderNotesList();
    });
