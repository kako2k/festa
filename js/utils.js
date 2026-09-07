/* =====================================================================
   utils.js — funções compartilhadas entre a página pública e o painel
   ===================================================================== */

/* --------------------------------------------------------- Formatação */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2
});

/** 1234.5 → "R$ 1.234,50" */
function money(v) {
  return BRL.format(Number(v) || 0);
}

/** 0.4567 vindo como 45.67 → "45,7%" */
function pct(v, casas = 1) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: casas, maximumFractionDigits: casas
  }) + '%';
}

/** "2026-12-24" → "24/12/2026"  (sem cair na armadilha de fuso do Date) */
function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return (d && m && a) ? `${d}/${m}/${a}` : iso;
}

/** Data de hoje no formato aceito por <input type="date"> (fuso local) */
function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

/** Converte "1.234,56" ou "1234.56" em number */
function parseValor(txt) {
  if (typeof txt === 'number') return txt;
  if (!txt) return 0;
  let s = String(txt).trim().replace(/[R$\s]/gi, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------------------------------- Máscara de nomes */

/**
 * Mantém as 3 primeiras letras e troca o restante por "*".
 * Espaços são preservados para o nome continuar reconhecível em formato.
 *   "João Silva"  → "Joã* *****"
 *   "Ana"         → "Ana"
 *   "Zé"          → "Zé"
 */
function mascararNome(nome, mostrar) {
  const n = String(nome ?? '').trim();
  if (mostrar) return n;
  if (n.length <= 3) return n;

  let visiveis = 0;
  let saida = '';
  for (const ch of n) {
    if (ch === ' ') { saida += ' '; continue; }
    if (visiveis < 3) { saida += ch; visiveis++; }
    else { saida += '*'; }
  }
  return saida;
}

/* ---------------------------------------------------------- Percentual */

/** Percentual seguro (0 quando o total é 0), limitado a 0..100 para a barra */
function calcPct(parte, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return (Number(parte) || 0) / t * 100;
}
function clamp100(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

/* ------------------------------------------------------------- DOM/HTML */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** Preenche uma barra .progress */
function setProgress(el, percentual, sucessoEm = 100) {
  if (!el) return;
  const p = clamp100(percentual);
  el.style.setProperty('--pct', p.toFixed(2) + '%');
  el.classList.toggle('is-success', p >= sucessoEm);
}

/* --------------------------------------------------------------- Toast */

function toast(msg, tipo = '') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

/* ------------------------------------------------------------- Cálculos */

/** Totais a partir das listas cruas do banco */
function calcularResumo(arrecadacao, utilizacao, meta) {
  const totalArrecadado = arrecadacao.reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalPrevisto   = utilizacao.reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalPago       = utilizacao.reduce((s, r) => s + Number(r.valor_pago || 0), 0);
  const metaValor       = Number(meta || 0);

  return {
    totalArrecadado,
    totalPrevisto,
    totalPago,
    aPagar: Math.max(totalPrevisto - totalPago, 0),
    saldo: totalArrecadado - totalPago,
    metaValor,
    pctMeta: calcPct(totalArrecadado, metaValor),
    faltaMeta: Math.max(metaValor - totalArrecadado, 0),
    pctUso: calcPct(totalPago, totalPrevisto),
    porPix: arrecadacao.filter(r => r.forma === 'pix')
                      .reduce((s, r) => s + Number(r.valor || 0), 0),
    porDinheiro: arrecadacao.filter(r => r.forma === 'dinheiro')
                            .reduce((s, r) => s + Number(r.valor || 0), 0),
    contribuintes: new Set(
      arrecadacao.map(r => String(r.nome || '').trim().toLowerCase()).filter(Boolean)
    ).size
  };
}

/* Exporta para Node (usado só nos testes automatizados) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { money, pct, dataBR, parseValor, mascararNome, calcPct, clamp100, calcularResumo };
}
