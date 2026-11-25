// Ponto de entrada da API na Vercel: toda requisição /api/* chega aqui
// (veja os rewrites em vercel.json) e é atendida pelo mesmo app Express.
import { createApp } from '../server/src/app.js';

export default createApp();
