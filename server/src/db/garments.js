/**
 * Gera ilustrações SVG das peças, usadas como imagens iniciais do catálogo.
 * Pelo painel, o administrador substitui por fotos reais (JPG/PNG/WEBP).
 */
const SHAPES = {
  tshirt: {
    body: 'M150 62 Q200 92 250 62 L318 88 L368 168 L318 196 L296 164 L296 430 L104 430 L104 164 L82 196 L32 168 L82 88 Z',
    lines: ['M150 62 Q200 112 250 62'],
    stitches: ['M156 72 Q200 104 244 72', 'M110 416 L290 416', 'M88 184 L42 160', 'M312 184 L358 160'],
  },
  pants: {
    body: 'M128 50 L272 50 L292 450 L218 450 L200 170 L182 450 L108 450 Z',
    lines: ['M126 84 L274 84', 'M200 84 L200 150', 'M142 94 Q166 120 150 146', 'M258 94 Q234 120 250 146'],
    stitches: ['M134 68 L266 68', 'M120 436 L178 436', 'M222 436 L280 436', 'M206 90 Q214 130 202 150'],
  },
  shorts: {
    body: 'M120 110 L280 110 L302 332 L218 342 L200 222 L182 342 L98 332 Z',
    lines: ['M118 142 L282 142', 'M200 142 L200 204'],
    stitches: ['M124 126 L276 126', 'M108 318 L178 327', 'M222 327 L292 318'],
  },
  jacket: {
    body: 'M150 58 L200 92 L250 58 L320 82 L362 140 L372 400 L330 406 L316 200 L306 440 L94 440 L84 200 L70 406 L28 400 L38 140 L80 82 Z',
    lines: ['M200 92 L200 440', 'M150 58 L176 124 L200 92 L224 124 L250 58', 'M112 326 L170 326', 'M230 326 L288 326'],
    stitches: ['M207 100 L207 432', 'M193 100 L193 432', 'M34 388 L74 393', 'M326 393 L366 388', 'M100 426 L300 426'],
  },
  sneaker: {
    body: 'M60 330 Q62 262 120 250 L196 212 Q228 198 250 222 L282 262 Q340 272 352 310 L356 336 L60 336 Z',
    sole: 'M52 336 L362 336 Q364 368 340 372 L74 372 Q50 370 52 336 Z',
    lines: ['M188 238 L214 262', 'M204 228 L232 252', 'M220 220 L246 244', 'M282 262 Q300 302 352 312'],
    stitches: ['M70 322 L346 322', 'M130 262 Q170 300 160 330'],
  },
  cap: {
    body: 'M90 300 Q96 168 200 164 Q304 168 310 300 Z',
    sole: 'M80 298 Q200 284 320 298 Q376 312 352 340 Q200 318 96 338 Q56 322 80 298 Z',
    lines: ['M200 166 Q190 232 200 296'],
    stitches: ['M150 182 Q138 240 140 296', 'M250 182 Q262 240 260 296', 'M92 312 Q200 296 312 312'],
    dot: [200, 166],
  },
  bag: {
    handle: 'M150 172 Q150 88 200 88 Q250 88 250 172',
    body: 'M100 170 L300 170 L322 432 L78 432 Z',
    lines: [],
    stitches: ['M106 188 L294 188', 'M86 414 L314 414'],
  },
};

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount),
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

export function garmentSvg(shape, color, { bg = '#EEF0EC', zoom = false, id = 'g' } = {}) {
  const s = SHAPES[shape];
  const light = luminance(color) > 0.75;
  const edge = shade(color, light ? -0.22 : -0.35);
  const stitch = light ? shade(color, -0.3) : shade(color, 0.32);
  const transform = zoom ? 'translate(200 250) scale(1.85) translate(-200 -190)' : 'translate(0 10)';
  const strokeAttrs = `stroke="${edge}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  const parts = [];
  if (s.handle) parts.push(`<path d="${s.handle}" fill="none" stroke="${shade(color, -0.15)}" stroke-width="14" stroke-linecap="round"/>`);
  parts.push(`<path d="${s.body}" fill="${color}" ${strokeAttrs}/>`);
  parts.push(`<path d="${s.body}" fill="url(#${id}s)"/>`);
  if (s.sole) parts.push(`<path d="${s.sole}" fill="${shape === 'sneaker' ? '#F3F3F1' : shade(color, -0.08)}" ${strokeAttrs}/>`);
  for (const d of s.lines) parts.push(`<path d="${d}" fill="none" ${strokeAttrs}/>`);
  for (const d of s.stitches) parts.push(`<path d="${d}" fill="none" stroke="${stitch}" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>`);
  if (s.dot) parts.push(`<circle cx="${s.dot[0]}" cy="${s.dot[1]}" r="8" fill="${shade(color, -0.2)}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="800" height="1000">
<defs><linearGradient id="${id}s" x1="0" x2="1" y1="0" y2="0.4">
<stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
<stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient></defs>
<rect width="400" height="500" fill="${bg}"/>
${zoom ? '' : '<ellipse cx="200" cy="470" rx="150" ry="12" fill="#000" opacity=".07"/>'}
<g transform="${transform}">${parts.join('')}</g>
</svg>`;
}

export const SHAPE_NAMES = Object.keys(SHAPES);
