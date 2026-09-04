document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // MATRIX CANVAS ANIMATION
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

    // 1. OFFSCREEN SPRITE CANVAS (Pre-renders all text characters once)
    const spriteCanvas = document.createElement('canvas');
    const spriteCtx = spriteCanvas.getContext('2d');
    spriteCanvas.width = fontSize * chars.length;
    spriteCanvas.height = fontSize;
    spriteCtx.font = fontSize + 'px monospace';
    spriteCtx.fillStyle = '#aaaaaa';
    spriteCtx.textBaseline = 'top';

    const charMap = {};
    for (let i = 0; i < chars.length; i++) {
      const char = chars.charAt(i);
      const x = i * fontSize;
      spriteCtx.fillText(char, x, 0);
      charMap[char] = x;
    }

    // 2. TIMED ANIMATION LOOP (Replaces setInterval to run smoothly without lag)
    let lastTime = 0;
    const fps = 24; 
    const interval = 1000 / fps;

    function drawMatrix(currentTime) {
      requestAnimationFrame(drawMatrix);

      const delta = currentTime - lastTime;
      if (delta < interval) return;
      lastTime = currentTime - (delta % interval);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < drops.length; i++) {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        const spriteX = charMap[text];

        // Renders cached pixels instead of slow text drawing
        ctx.drawImage(
          spriteCanvas,
          spriteX, 0, fontSize, fontSize,
          i * fontSize, drops[i] * fontSize, fontSize, fontSize
        );

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }
   requestAnimationFrame(drawMatrix);
  }

   let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      columns = Math.floor(canvas.width / fontSize);
      drops = Array(columns).fill(1);
    }, 200);
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
  const noteTitle = document.getElementById('note-title');
  const noteBody = document.getElementById('note-body');
  const notesList = document.getElementById('notes-list');

  // Helper to safely display text
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

  // Render notes in the sidebar
  function renderNotesList() {
    if (!notesList) return;
    notesList.innerHTML = '';

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
      notesList.appendChild(item);
    });
  }

  // Open note into editor
  function openNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    currentNoteId = note.id;
    if (noteTitle) noteTitle.value = note.title;
    if (noteBody) noteBody.value = note.body;
    renderNotesList();
  }

  // Reset editor for new note
  function createNewNote() {
    currentNoteId = null;
    if (noteTitle) {
      noteTitle.value = '';
      noteTitle.focus();
    }
    if (noteBody) noteBody.value = '';
    renderNotesList();
  }

  // Save current note
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
      body: bodyVal
    };

    if (existingIndex >= 0) {
      notes[existingIndex] = noteData;
    } else {
      notes.unshift(noteData);
    }

    localStorage.setItem('my_notes', JSON.stringify(notes));
    renderNotesList();
  }

  // Delete current note
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
  }

  // Bind Event Listeners cleanly without resetting canvas
  if (newNoteBtn) {
    newNoteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      createNewNote();
    });
  }

  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveNote();
    });
  }

  if (deleteNoteBtn) {
    deleteNoteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      deleteNote();
    });
  }

  // Initial render
  renderNotesList();
});
