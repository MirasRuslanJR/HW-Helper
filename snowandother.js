(function(){
  const SNOW_COUNT = 70;        // сколько снежинок
  const SIZE_MIN = 5;           // px
  const SIZE_MAX = 12;
  const DUR_MIN = 8;            // s
  const DUR_MAX = 24;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 1.1;
  const OPACITY_MIN = 0.5;
  const OPACITY_MAX = 1.0;
  const X_OFFSET_MIN = -8;      // vw смещение по х (относительно начала) - позволяет "уноситься" влево/вправо
  const X_OFFSET_MAX = 8;       // vw

  let layer = document.getElementById('snow-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'snow-layer';
    document.body.appendChild(layer);
  }

  // Очистить старые
  layer.innerHTML = '';

  // Помощник — случайное число в диапазоне
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max+1)); }

  for (let i = 0; i < SNOW_COUNT; i++) {
    const s = document.createElement('div');
    s.className = 'snow';

    // Случайные параметры
    const startX = rand(0, 100);            // стартовая позиция в vw
    const offset = rand(X_OFFSET_MIN, X_OFFSET_MAX); // куда смещается к концу (vw)
    const endX = startX + offset;
    const midX = startX + offset * 0.5;

    const size = Math.round(rand(SIZE_MIN, SIZE_MAX));
    const dur = rand(DUR_MIN, DUR_MAX);
    const delay = -rand(0, DUR_MAX);       // отрицательная задержка равномерно распределяет снежинки по анимации
    const scale = rand(SCALE_MIN, SCALE_MAX);
    const opacity = rand(OPACITY_MIN, OPACITY_MAX);
    const yMid = rand(20, 60);             // промежуточная высота (vh)

    // Позиция по вертикали старта (можно раскинуть по -30..0vh)
    const startY = -rand(0, 30);

    // Применяем CSS-переменные (используем vw/vh чтобы позиционировать относительно окна)
    s.style.setProperty('--x-start', startX + 'vw');
    s.style.setProperty('--x-mid', midX + 'vw');
    s.style.setProperty('--x-end', endX + 'vw');
    s.style.setProperty('--y-mid', yMid + 'vh');
    s.style.setProperty('--y-start', startY + 'vh');
    s.style.setProperty('--size', size + 'px');
    s.style.setProperty('--scale', scale);
    s.style.setProperty('--dur', dur + 's');
    s.style.setProperty('--delay', delay + 's');
    s.style.setProperty('--opacity', opacity);

    // Небольшая вариация формы (oval)
    if (Math.random() > 0.85) {
      s.style.borderRadius = '40%';
      s.style.width = (size * 1.2) + 'px';
      s.style.height = (size * 0.9) + 'px';
    }

    // Помещаем в слой
    layer.appendChild(s);
  }

  // Динамически обновлять количество при ресайзе — опционально
  window.addEventListener('resize', () => {
    // при желании можно пересоздать снежинки: spawnSnow(SNOW_COUNT);
    // но для простоты оставляем как есть.
  });

})();
// Скрыть загрузчик после загрузки
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
  }, 800);
});
window.closePrizeModal = function() {
  const overlay = document.querySelector('.case-opening');
  if(overlay) overlay.remove();
};

// Авто-закрытие через 10 секунд
setTimeout(() => {
  const overlay = document.querySelector('.case-opening');
  if(overlay) overlay.remove();
}, 10000);