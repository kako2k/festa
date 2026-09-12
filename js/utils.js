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

/** 45.67 → "45,7%" */
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

/** "1 contribuição" / "2 contribuições" — sem o feio "(ões)" */
function plural(n, singular, plural_) {
  const q = Number(n) || 0;
  return `${q} ${q === 1 ? singular : plural_}`;
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
 *   "João Silva"  → "Joã* *****"
 *   "Ana"         → "Ana"
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

function calcPct(parte, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return (Number(parte) || 0) / t * 100;
}
function clamp100(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

/* =====================================================================
   STATUS DE CADA PESSOA
   ---------------------------------------------------------------------
   nao_doou → ainda não pagou nada
   parcial  → pagou uma parte do valor previsto
   total    → pagou exatamente o previsto (ou mais, até 1 centavo)
   especial → pagou acima do previsto
   ===================================================================== */

const STATUS_ORDEM = ['nao_doou', 'parcial', 'total', 'especial'];

const STATUS_PADRAO = {
  nao_doou: { cor: '#f87171', rotulo: 'Não contribuiu' },
  parcial:  { cor: '#f0b429', rotulo: 'Parcial'  },
  total:    { cor: '#34d399', rotulo: 'Completo' },
  especial: { cor: '#60a5fa', rotulo: 'Especial' }
};

/** Tolerância de 1 centavo, para não errar por arredondamento */
const EPS = 0.005;

function statusDoValor(pago, previsto) {
  const p = Number(pago) || 0;
  const v = Number(previsto) || 0;
  if (p <= EPS) return 'nao_doou';
  if (v <= EPS) return 'total';            // sem valor previsto, qualquer contribuição conta como completa
  if (p > v + EPS) return 'especial';
  if (p >= v - EPS) return 'total';
  return 'parcial';
}

/** Cores vindas da config (com fallback para os padrões) */
function coresStatus(config) {
  const c = config || {};
  return {
    nao_doou: c.cor_nao_doou || STATUS_PADRAO.nao_doou.cor,
    parcial:  c.cor_parcial  || STATUS_PADRAO.parcial.cor,
    total:    c.cor_total    || STATUS_PADRAO.total.cor,
    especial: c.cor_especial || STATUS_PADRAO.especial.cor
  };
}

/** Rótulos vindos da config (com fallback para os padrões) */
function rotulosStatus(config) {
  const c = config || {};
  return {
    nao_doou: c.rotulo_nao_doou || STATUS_PADRAO.nao_doou.rotulo,
    parcial:  c.rotulo_parcial  || STATUS_PADRAO.parcial.rotulo,
    total:    c.rotulo_total    || STATUS_PADRAO.total.rotulo,
    especial: c.rotulo_especial || STATUS_PADRAO.especial.rotulo
  };
}

/**
 * Junta pessoas + pagamentos num só objeto por pessoa, já com
 * total pago, valor previsto, percentual e status.
 */
function montarPessoas(pessoas, pagamentos, valorPadrao) {
  const porPessoa = new Map();
  for (const pg of (pagamentos || [])) {
    const k = String(pg.pessoa_id);
    if (!porPessoa.has(k)) porPessoa.set(k, []);
    porPessoa.get(k).push(pg);
  }

  return (pessoas || []).map(p => {
    const lista = (porPessoa.get(String(p.id)) || []).slice().sort((a, b) =>
      String(b.data).localeCompare(String(a.data)) || Number(b.id) - Number(a.id)
    );
    const pago = lista.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    const previsto = (p.valor_previsto === null || p.valor_previsto === undefined || p.valor_previsto === '')
      ? (Number(valorPadrao) || 0)
      : Number(p.valor_previsto);

    return {
      ...p,
      pagamentos: lista,
      pago,
      previsto,
      restante:  Math.max(previsto - pago, 0),
      excedente: Math.max(pago - previsto, 0),
      pctPessoa: calcPct(pago, previsto),
      status:    statusDoValor(pago, previsto)
    };
  });
}

/** Quantas pessoas em cada status */
function contarStatus(pessoasCalculadas) {
  const c = { nao_doou: 0, parcial: 0, total: 0, especial: 0 };
  for (const p of (pessoasCalculadas || [])) {
    if (c[p.status] !== undefined) c[p.status]++;
  }
  return c;
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

/** Aplica as cores da config como variáveis CSS na página inteira */
function aplicarCoresStatus(config) {
  const cores = coresStatus(config);
  const raiz = document.documentElement;
  for (const k of STATUS_ORDEM) {
    raiz.style.setProperty('--st-' + k.replace('_', '-'), cores[k]);
  }
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

/** Totais gerais a partir das listas cruas do banco */
function calcularResumo(pagamentos, utilizacao, meta, pessoasCalculadas) {
  const pgs = pagamentos || [];
  const uso = utilizacao || [];

  const totalArrecadado = pgs.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const totalPrevisto   = uso.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const totalPago       = uso.reduce((s, r) => s + (Number(r.valor_pago) || 0), 0);
  const metaValor       = Number(meta || 0);

  const pessoas = pessoasCalculadas || [];

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
    porPix: pgs.filter(r => r.forma === 'pix')
                .reduce((s, r) => s + (Number(r.valor) || 0), 0),
    porDinheiro: pgs.filter(r => r.forma === 'dinheiro')
                     .reduce((s, r) => s + (Number(r.valor) || 0), 0),
    qtdPagamentos: pgs.length,
    qtdPessoas: pessoas.length,
    contribuintes: pessoas.filter(p => p.pago > EPS).length,
    esperadoTotal: pessoas.reduce((s, p) => s + (Number(p.previsto) || 0), 0),
    faltaPessoas: pessoas.reduce((s, p) => s + (Number(p.restante) || 0), 0),
    statusContagem: contarStatus(pessoas)
  };
}

/* Exporta para Node (usado só nos testes automatizados) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    money, pct, dataBR, parseValor, plural, mascararNome, calcPct, clamp100,
    statusDoValor, coresStatus, rotulosStatus, montarPessoas, contarStatus,
    calcularResumo, STATUS_ORDEM, STATUS_PADRAO
  };
}
