/* =====================================================================
   public.js — página pública (somente leitura)
   ===================================================================== */

const estado = {
  config: null,
  arrecadacao: [],
  utilizacao: [],
  filtro: ''
};

/* ------------------------------------------------------------ Carregar */

async function carregar() {
  try {
    const [cfgRes, arrRes, usoRes] = await Promise.all([
      db.from('config').select('*').eq('id', 1).maybeSingle(),
      db.from('arrecadacao').select('*').order('data', { ascending: false }).order('id', { ascending: false }),
      db.from('utilizacao').select('*').order('ordem', { ascending: true }).order('id', { ascending: true })
    ]);

    if (cfgRes.error) throw cfgRes.error;
    if (arrRes.error) throw arrRes.error;
    if (usoRes.error) throw usoRes.error;

    estado.config      = cfgRes.data || {};
    estado.arrecadacao = arrRes.data || [];
    estado.utilizacao  = usoRes.data || [];

    renderCabecalho();
    renderMeta();
    renderResumo();
    renderUtilizacao();
    renderArrecadacao();

    $('#atualizado').textContent = new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (err) {
    console.error(err);
    mostrarErro(err);
  }
}

function mostrarErro(err) {
  const msg = (err && err.message) || 'erro desconhecido';
  $('#tb-arrecadacao').innerHTML =
    `<tr><td colspan="4"><div class="empty">Não foi possível carregar os dados.<br>
     <span class="faint">${esc(msg)}</span></div></td></tr>`;
  $('#uso-list').innerHTML =
    `<div class="empty">Não foi possível carregar os dados.</div>`;
}

/* ------------------------------------------------------------ Renders */

function renderCabecalho() {
  const c = estado.config;
  document.title = (c.evento_nome || 'Arrecadação') + ' — Arrecadação';
  $('#evento-nome').textContent = c.evento_nome || 'Festa de Fim de Ano';
  $('#evento-subtitulo').textContent = c.evento_subtitulo || '';
  $('#evento-subtitulo').hidden = !c.evento_subtitulo;

  const logo = $('#logo');
  if (c.logo_url) {
    logo.src = c.logo_url;
    logo.style.display = '';
  }

  if (c.mensagem) {
    $('#mensagem-txt').textContent = c.mensagem;
    $('#mensagem-box').hidden = false;
  }
}

function renderMeta() {
  const r = calcularResumo(estado.arrecadacao, estado.utilizacao, estado.config.meta_valor);

  $('#meta-arrecadado').textContent = money(r.totalArrecadado);
  $('#meta-alvo').textContent       = money(r.metaValor);
  $('#meta-pct').textContent        = pct(r.pctMeta);
  $('#meta-pct-2').textContent      = pct(r.pctMeta);
  $('#meta-falta').textContent      = money(r.faltaMeta);
  $('#meta-pct-restante').textContent = pct(Math.max(100 - r.pctMeta, 0));

  setProgress($('#meta-bar'), r.pctMeta);
  $('#meta-pct').style.color = r.pctMeta >= 100
    ? 'var(--success)' : 'var(--accent)';

  // Sem meta definida: esconde a seção de progresso da meta
  $('#sec-meta').hidden = !(Number(r.metaValor) > 0);
}

function renderResumo() {
  const r = calcularResumo(estado.arrecadacao, estado.utilizacao, estado.config.meta_valor);

  $('#r-arrecadado').textContent = money(r.totalArrecadado);
  $('#r-utilizado').textContent  = money(r.totalPago);
  $('#r-saldo').textContent      = money(r.saldo);
  $('#r-apagar').textContent     = money(r.aPagar);

  const saldoEl = $('#r-saldo').parentElement;
  saldoEl.classList.toggle('bad', r.saldo < 0);
  saldoEl.classList.toggle('ok',  r.saldo >= 0);

  $('#r-detalhe').textContent =
    `${estado.arrecadacao.length} lançamento(s) · ${r.contribuintes} contribuinte(s) · ` +
    `PIX ${money(r.porPix)} · Dinheiro ${money(r.porDinheiro)}`;
}

function renderUtilizacao() {
  const r = calcularResumo(estado.arrecadacao, estado.utilizacao, estado.config.meta_valor);

  $('#uso-pago').textContent          = money(r.totalPago);
  $('#uso-pct').textContent           = pct(r.pctUso);
  $('#uso-restante').textContent      = money(r.aPagar);
  $('#uso-pct-restante').textContent  = pct(Math.max(100 - r.pctUso, 0));
  setProgress($('#uso-bar'), r.pctUso);

  $('#uso-contador').textContent =
    `${estado.utilizacao.length} item(ns) · previsto ${money(r.totalPrevisto)}`;

  const lista = $('#uso-list');
  if (!estado.utilizacao.length) {
    lista.innerHTML = '<div class="empty">Nenhum item cadastrado ainda.</div>';
    return;
  }

  lista.innerHTML = estado.utilizacao.map(item => {
    const valor     = Number(item.valor || 0);
    const pago      = Number(item.valor_pago || 0);
    const restante  = Number(item.valor_restante ?? Math.max(valor - pago, 0));
    const p         = calcPct(pago, valor);
    const quitado   = valor > 0 && restante <= 0;

    return `
      <article class="uso-item">
        <div class="uso-head">
          <h3>${esc(item.titulo)}</h3>
          ${quitado ? '<span class="badge-quitado">Quitado</span>'
                    : `<span class="faint">${pct(p)} pago</span>`}
        </div>
        ${item.descricao ? `<p class="uso-desc">${esc(item.descricao)}</p>` : ''}
        <div class="progress slim ${quitado ? 'is-success' : ''}"
             style="--pct:${clamp100(p).toFixed(2)}%"><span></span></div>
        <div class="uso-numeros">
          <span>Previsto: <b>${money(valor)}</b></span>
          <span>Pago: <b>${money(pago)}</b></span>
          <span>Restante: <b>${money(restante)}</b></span>
        </div>
      </article>`;
  }).join('');
}

function renderArrecadacao() {
  const mostrar = estado.config.mostrar_nomes !== false;
  $('#nomes-aviso').hidden = mostrar;

  const termo = estado.filtro.trim().toLowerCase();
  const linhas = estado.arrecadacao.filter(r => {
    if (!termo) return true;
    // Com nomes ocultos a busca ocorre sobre o texto mascarado,
    // para não vazar o nome real através do filtro.
    const alvo = mascararNome(r.nome, mostrar).toLowerCase();
    return alvo.includes(termo)
        || dataBR(r.data).includes(termo)
        || String(r.forma).includes(termo);
  });

  const tbody = $('#tb-arrecadacao');
  if (!linhas.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty">${
      estado.arrecadacao.length ? 'Nenhum resultado para a busca.' : 'Nenhum lançamento ainda.'
    }</div></td></tr>`;
    $('#tf-arrecadacao').innerHTML = '';
    return;
  }

  tbody.innerHTML = linhas.map(r => `
    <tr>
      <td class="nowrap">${dataBR(r.data)}</td>
      <td>${esc(mascararNome(r.nome, mostrar))}</td>
      <td><span class="tag tag-${esc(r.forma)}">${r.forma === 'pix' ? 'PIX' : 'Dinheiro'}</span></td>
      <td class="num">${money(r.valor)}</td>
    </tr>`).join('');

  const soma = linhas.reduce((s, r) => s + Number(r.valor || 0), 0);
  $('#tf-arrecadacao').innerHTML = `
    <tr>
      <td colspan="3" style="padding:12px; font-weight:600; border-top:1px solid var(--border)">
        Total${termo ? ' (filtrado)' : ''}
      </td>
      <td class="num" style="padding:12px; font-weight:700; border-top:1px solid var(--border)">
        ${money(soma)}
      </td>
    </tr>`;
}

/* ------------------------------------------------------------- Eventos */

$('#busca').addEventListener('input', e => {
  estado.filtro = e.target.value;
  renderArrecadacao();
});

carregar();

// Atualiza sozinho a cada 60s (para telas deixadas abertas na festa)
setInterval(carregar, 60000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) carregar();
});
