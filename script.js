const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

// Set canvas dimensions to fit window
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Japanese Katakana characters and numbers mix
const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789=+-*';
const fontSize = 16;
const columns = Math.floor(canvas.width / fontSize);

// Track Y position for each column
const drops = Array(columns).fill(1);

function draw() {
  // Semi-transparent black layer creates the trailing fade effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#aaaaaa'; // Grey text color
  ctx.font = fontSize + 'px monospace';

  for (let i = 0; i < drops.length; i++) {
    const text = chars.charAt(Math.floor(Math.random() * chars.length));
    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

    // Reset drop back to top randomly after it crosses screen height
    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }
}

// Run loop at ~30 FPS
setInterval(draw, 33);

// Resize canvas if browser window changes size
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});