document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // MATRIX CANVAS BACKGROUND
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
      charCache.width = fontSize * chars.length;
      charCache.height = fontSize;
      if (!charCtx) return;
      charCtx.fillStyle = '#aaaaaa';
      charCtx.font = `${fontSize}px monospace`;
      charCtx.textBaseline = 'top';
      for (let i = 0; i < chars.length; i++) {
        const char = chars.charAt(i);
        const x = i * fontSize;
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
          ctx.drawImage(charCache, sourceX, 0, fontSize, fontSize, i * fontSize, drops[i] * fontSize, fontSize, fontSize);
        }
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }
    requestAnimationFrame(drawMatrix);

    window.addEventListener('resize', resizeCanvas, { passive: true });
  }

  // ==========================================
  // NOTE APP CONTROLS & STATE LOGIC
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

  const numberedListBtn = document.getElementById('numbered-list-btn');
  const highlightCanvas = document.getElementById('highlight-canvas');
  const toggleHighlightBtn = document.getElementById('toggle-highlight-btn');
  const clearHighlightBtn = document.getElementById('clear-highlight-btn');

  let hlCtx = highlightCanvas ? highlightCanvas.getContext('2d') : null;
  let isHighlightingMode = false;
  let isDrawing = false;
  let currentNoteHighlightData = null;

  function syncCanvasSize() {
    if (!highlightCanvas || !highlightCanvas.parentElement) return;
    const rect = highlightCanvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      highlightCanvas.width = rect.width;
      highlightCanvas.height = rect.height;
      redrawHighlightCanvas();
    }
  }

  window.addEventListener('resize', syncCanvasSize);

  // Drawing Canvas Handler
  if (highlightCanvas && hlCtx) {
    function getCanvasCoords(e) {
      const rect = highlightCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    function startDrawing(e) {
      if (!isHighlightingMode) return;
      isDrawing = true;
      const coords = getCanvasCoords(e);
      hlCtx.beginPath();
      hlCtx.moveTo(coords.x, coords.y);
      hlCtx.strokeStyle = 'rgba(255, 230, 0, 0.45)';
      hlCtx.lineWidth = 16;
      hlCtx.lineCap = 'round';
      hlCtx.lineJoin = 'round';
    }

    function draw(e) {
      if (!isDrawing || !isHighlightingMode) return;
      if (e.cancelable) e.preventDefault();
      const coords = getCanvasCoords(e);
      hlCtx.lineTo(coords.x, coords.y);
      hlCtx.stroke();
    }

    function stopDrawing() {
      if (!isDrawing) return;
      isDrawing = false;
      currentNoteHighlightData = highlightCanvas.toDataURL();
      saveNote();
    }

    highlightCanvas.addEventListener('mousedown', startDrawing);
    highlightCanvas.addEventListener('mousemove', draw);
    highlightCanvas.addEventListener('mouseup', stopDrawing);
    highlightCanvas.addEventListener('mouseleave', stopDrawing);

    highlightCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    highlightCanvas.addEventListener('touchmove', draw, { passive: false });
    highlightCanvas.addEventListener('touchend', stopDrawing);
  }

  // Toggle Highlight Event Handler
  if (toggleHighlightBtn) {
    toggleHighlightBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();

      isHighlightingMode = !isHighlightingMode;

      if (isHighlightingMode) {
        highlightCanvas.classList.add('drawing-mode');
        toggleHighlightBtn.classList.add('is-active');
        toggleHighlightBtn.innerHTML = '✏️ Highlight: ON';
      } else {
        highlightCanvas.classList.remove('drawing-mode');
        toggleHighlightBtn.classList.remove('is-active');
        toggleHighlightBtn.innerHTML = '✏️ Highlight: OFF';
      }
    };
  }

  // Clear Canvas Event Handler
  if (clearHighlightBtn) {
    clearHighlightBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (hlCtx && highlightCanvas) {
        hlCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
        currentNoteHighlightData = null;
        saveNote();
      }
    };
  }

  function redrawHighlightCanvas() {
    if (!hlCtx || !highlightCanvas) return;
    hlCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

    if (currentNoteHighlightData) {
      const img = new Image();
      img.onload = () => {
        hlCtx.drawImage(img, 0, 0);
      };
      img.src = currentNoteHighlightData;
    }
  }

  // Numbered List Handler
  if (numberedListBtn) {
    numberedListBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (!noteBody) return;

      const text = noteBody.value;
      if (text.trim() === '') {
        noteBody.value = '1. ';
        noteBody.focus();
        noteBody.setSelectionRange(3, 3);
        return;
      }

      const lines = text.split('\n');
      let count = 1;
      const numberedLines = lines.map((line) => {
        const cleanLine = line.replace(/^(\d+\.|\*|-)\s*/, '');
        if (cleanLine.trim().length > 0) {
          return `${count++}. ${cleanLine}`;
        }
        return line;
      });

      noteBody.value = numberedLines.join('\n');
      noteBody.focus();
    };
  }

  // Enter Key Handler for Lists
  if (noteBody) {
    noteBody.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const start = noteBody.selectionStart;
        const textBeforeCursor = noteBody.value.substring(0, start);
        const currentLine = textBeforeCursor.split('\n').pop();
        const match = currentLine.match(/^(\d+)\.\s/);

        if (match) {
          e.preventDefault();
          const nextNum = parseInt(match[1], 10) + 1;
          const insertText = `\n${nextNum}. `;
          const textAfterCursor = noteBody.value.substring(start);
          noteBody.value = textBeforeCursor + insertText + textAfterCursor;
          noteBody.selectionStart = noteBody.selectionEnd = start + insertText.length;
        }
      }
    });
  }

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
      item.addEventListener('click', () => openNote(note.id));
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

    currentNoteHighlightData = note.highlightData || null;
    syncCanvasSize();
    renderNotesList();
  }

  function createNewNote() {
    currentNoteId = null;
    currentNoteHighlightData = null;

    if (noteTitle) noteTitle.value = '';
    if (noteBody) noteBody.value = '';
    if (hlCtx && highlightCanvas) hlCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

    renderNotesList();
  }

  function saveNote() {
    const titleVal = noteTitle ? noteTitle.value.trim() : '';
    const bodyVal = noteBody ? noteBody.value.trim() : '';

    if (!titleVal && !bodyVal && !currentNoteHighlightData) return;

    if (!currentNoteId) {
      currentNoteId = Date.now();
    }

    const existingIndex = notes.findIndex((n) => n.id === currentNoteId);
    const noteData = {
      id: currentNoteId,
      title: titleVal,
      body: bodyVal,
      highlightData: currentNoteHighlightData,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      notes[existingIndex] = noteData;
    } else {
      notes.unshift(noteData);
    }

    localStorage.setItem('my_notes', JSON.stringify(notes));
    renderNotesList();
  }

  function deleteNote() {
    if (!currentNoteId) {
      if (noteTitle) noteTitle.value = '';
      if (noteBody) noteBody.value = '';
      currentNoteHighlightData = null;
      if (hlCtx && highlightCanvas) hlCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
      return;
    }

    notes = notes.filter((n) => n.id !== currentNoteId);
    localStorage.setItem('my_notes', JSON.stringify(notes));

    currentNoteId = null;
    currentNoteHighlightData = null;
    if (noteTitle) noteTitle.value = '';
    if (noteBody) noteBody.value = '';
    if (hlCtx && highlightCanvas) hlCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

    renderNotesList();
  }

  if (newNoteBtn) newNoteBtn.addEventListener('click', createNewNote);
  if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);
  if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', deleteNote);

  setTimeout(syncCanvasSize, 100);
  renderNotesList();
});
