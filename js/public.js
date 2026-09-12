/* =====================================================================
   public.js — página pública (somente leitura)
   ===================================================================== */

const estado = {
  config: {},
  pessoas: [],        // já calculadas (com pago, previsto, status)
  pagamentos: [],
  utilizacao: [],
  filtro: '',
  filtroStatus: ''    // '' = todos
};

/* ------------------------------------------------------------ Carregar */

async function carregar() {
  try {
    const [cfgRes, pesRes, pagRes, usoRes] = await Promise.all([
      db.from('config').select('*').eq('id', 1).maybeSingle(),
      db.from('pessoas').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true }),
      db.from('pagamentos').select('*').order('data', { ascending: false }).order('id', { ascending: false }),
      db.from('utilizacao').select('*').order('ordem', { ascending: true }).order('id', { ascending: true })
    ]);

    if (cfgRes.error) throw cfgRes.error;
    if (pesRes.error) throw pesRes.error;
    if (pagRes.error) throw pagRes.error;
    if (usoRes.error) throw usoRes.error;

    estado.config     = cfgRes.data || {};
    estado.pagamentos = pagRes.data || [];
    estado.utilizacao = usoRes.data || [];
    estado.pessoas    = montarPessoas(pesRes.data || [], estado.pagamentos,
                                      estado.config.valor_por_pessoa);

    aplicarCoresStatus(estado.config);

    renderCabecalho();
    renderMeta();
    renderResumo();
    renderPessoas();
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
  $('#pessoas-grid').innerHTML = `<div class="empty">Não foi possível carregar os dados.</div>`;
  $('#uso-list').innerHTML = `<div class="empty">Não foi possível carregar os dados.</div>`;
}

/* ------------------------------------------------------------ Cabeçalho */

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
  } else {
    $('#mensagem-box').hidden = true;
  }

  if (c.chave_pix) {
    $('#pix-key').textContent = c.chave_pix;
    $('#pix-card').hidden = false;
  } else {
    $('#pix-card').hidden = true;
  }

  // Chave PIX (só aparece se estiver preenchida no painel)
  if (c.chave_pix) {
    $('#pix-key').textContent = c.chave_pix;
    $('#pix-card').hidden = false;
  } else {
    $('#pix-card').hidden = true;
  }
}

/* ------------------------------------------------------- Copiar chave PIX */

async function copiarPix() {
  const chave = estado.config.chave_pix || '';
  if (!chave) return;

  let ok = false;
  try {
    await navigator.clipboard.writeText(chave);
    ok = true;
  } catch {
    // Fallback para navegadores antigos ou páginas sem HTTPS
    const ta = document.createElement('textarea');
    ta.value = chave;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, chave.length);
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }

  const txt = $('#btn-copiar-txt');
  const btn = $('#btn-copiar-pix');
  if (ok) {
    txt.textContent = 'Copiado!';
    btn.classList.add('copiado');
    toast('Chave PIX copiada.', 'ok');
  } else {
    txt.textContent = 'Copie manualmente';
    toast('Não consegui copiar. Selecione a chave e copie na mão.', 'err');
  }
  setTimeout(() => {
    txt.textContent = 'Copiar chave';
    btn.classList.remove('copiado');
  }, 2200);
}

$('#btn-copiar-pix').addEventListener('click', copiarPix);

/* ------------------------------------------------------------ Meta e resumo */

function resumo() {
  return calcularResumo(estado.pagamentos, estado.utilizacao,
                        estado.config.meta_valor, estado.pessoas);
}

function renderMeta() {
  const r = resumo();

  $('#meta-arrecadado').textContent = money(r.totalArrecadado);
  $('#meta-alvo').textContent       = money(r.metaValor);
  $('#meta-pct').textContent        = pct(r.pctMeta);
  $('#meta-pct-2').textContent      = pct(r.pctMeta);
  $('#meta-falta').textContent      = money(r.faltaMeta);
  $('#meta-pct-restante').textContent = pct(Math.max(100 - r.pctMeta, 0));

  setProgress($('#meta-bar'), r.pctMeta);
  $('#meta-pct').style.color = r.pctMeta >= 100 ? 'var(--success)' : 'var(--accent)';
  $('#sec-meta').hidden = !(Number(r.metaValor) > 0);
}

function renderResumo() {
  const r = resumo();

  $('#r-arrecadado').textContent = money(r.totalArrecadado);
  $('#r-utilizado').textContent  = money(r.totalPago);
  $('#r-saldo').textContent      = money(r.saldo);
  $('#r-apagar').textContent     = money(r.aPagar);

  const saldoEl = $('#r-saldo').parentElement;
  saldoEl.classList.toggle('bad', r.saldo < 0);
  saldoEl.classList.toggle('ok',  r.saldo >= 0);

  $('#r-detalhe').textContent =
    `${r.contribuintes} de ${plural(r.qtdPessoas, 'pessoa', 'pessoas')} já contribuíram · ` +
    `${plural(r.qtdPagamentos, 'contribuição', 'contribuições')} · PIX ${money(r.porPix)} · Dinheiro ${money(r.porDinheiro)}`;
}

/* ========================================================================
   CONTRIBUINTES — quadro colorido por status
   ======================================================================== */

function renderPessoas() {
  const rot     = rotulosStatus(estado.config);
  const cont    = contarStatus(estado.pessoas);
  const mostrar = estado.config.mostrar_nomes !== false;
  const r       = resumo();

  // Legenda
  $('#legenda').innerHTML = STATUS_ORDEM.map(s => `
    <span class="legenda-item">
      <i class="dot" style="background:var(--st-${s.replace('_','-')})"></i>
      ${esc(rot[s])} <b>${cont[s]}</b>
    </span>`).join('');

  // Filtros por status
  $('#filtros-status').innerHTML =
    `<button class="chip ${estado.filtroStatus === '' ? 'ativo' : ''}" data-status="">
       Todos <b>${estado.pessoas.length}</b>
     </button>` +
    STATUS_ORDEM.map(s => `
      <button class="chip st-${s.replace('_','-')} ${estado.filtroStatus === s ? 'ativo' : ''}"
              data-status="${s}" ${cont[s] ? '' : 'disabled'}>
        ${esc(rot[s])} <b>${cont[s]}</b>
      </button>`).join('');

  $('#pessoas-contador').textContent = estado.pessoas.length
    ? `${money(r.totalArrecadado)} de ${money(r.esperadoTotal)} esperados · faltam ${money(r.faltaPessoas)}`
    : '';

  // Cards
  const lista = estado.filtroStatus
    ? estado.pessoas.filter(p => p.status === estado.filtroStatus)
    : estado.pessoas;

  const grid = $('#pessoas-grid');
  if (!lista.length) {
    grid.innerHTML = `<div class="empty">${
      estado.pessoas.length ? 'Ninguém neste status.' : 'Nenhuma pessoa cadastrada ainda.'
    }</div>`;
    return;
  }

  grid.innerHTML = lista.map(p => {
    const s   = p.status.replace('_', '-');
    const tem = p.pagamentos.length;
    return `
      <article class="pessoa st-${s}">
        <div class="pessoa-top">
          <div class="pessoa-nome" title="${esc(mascararNome(p.nome, mostrar))}">
            ${esc(mascararNome(p.nome, mostrar))}
          </div>
          <button class="olho" type="button" data-ver="${p.id}"
                  ${tem ? '' : 'disabled'}
                  aria-label="Ver contribuições de ${esc(mascararNome(p.nome, mostrar))}"
                  title="${tem ? 'Ver contribuições' : 'Sem contribuições registradas'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>

        <div class="pessoa-valor">${money(p.pago)}</div>
        <div class="pessoa-de">de ${money(p.previsto)}</div>

        <div class="progress slim pessoa-bar"><span></span></div>

        <div class="pessoa-rodape">
          <span class="badge-status">${esc(rotulosStatus(estado.config)[p.status])}</span>
          <span class="faint">${
            p.status === 'especial' ? '+' + money(p.excedente) :
            p.restante > 0          ? 'faltam ' + money(p.restante) : '✓'
          }</span>
        </div>
      </article>`;
  }).join('');

  // Barras (definidas via JS para não injetar style inline no HTML montado)
  lista.forEach((p, i) => {
    const bar = grid.children[i].querySelector('.pessoa-bar');
    bar.style.setProperty('--pct', clamp100(p.pctPessoa).toFixed(2) + '%');
  });
}

/* ------------------------------------------- Modal com as contribuições da pessoa */

function verDoacoes(id) {
  const p = estado.pessoas.find(x => String(x.id) === String(id));
  if (!p) return;

  const mostrar = estado.config.mostrar_nomes !== false;
  const rot = rotulosStatus(estado.config);
  const s = p.status.replace('_', '-');

  const linhas = p.pagamentos.length
    ? p.pagamentos.map(pg => `
        <tr>
          <td class="nowrap">${dataBR(pg.data)}</td>
          <td><span class="tag tag-${esc(pg.forma)}">${pg.forma === 'pix' ? 'PIX' : 'Dinheiro'}</span></td>
          <td class="num">${money(pg.valor)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3"><div class="empty">Nenhuma contribuição registrada.</div></td></tr>`;

  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal st-${s}" role="dialog" aria-modal="true" aria-label="Contribuições">
      <div class="modal-head">
        <div>
          <h2>${esc(mascararNome(p.nome, mostrar))}</h2>
          <span class="badge-status">${esc(rot[p.status])}</span>
        </div>
        <button class="fechar" type="button" data-fechar aria-label="Fechar">&times;</button>
      </div>

      <div class="modal-resumo">
        <div><span class="faint">Contribuído</span><b>${money(p.pago)}</b></div>
        <div><span class="faint">Previsto</span><b>${money(p.previsto)}</b></div>
        <div><span class="faint">${p.status === 'especial' ? 'A mais' : 'Falta'}</span>
             <b>${money(p.status === 'especial' ? p.excedente : p.restante)}</b></div>
      </div>

      <div class="progress slim" style="--pct:${clamp100(p.pctPessoa).toFixed(2)}%;margin-bottom:16px">
        <span></span>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Forma</th><th class="num">Valor</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;

  const fechar = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') fechar(); };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-fechar]')) fechar();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  back.querySelector('.fechar').focus();
}

/* ------------------------------------------------------- Utilização */

function renderUtilizacao() {
  const r = resumo();

  $('#uso-pago').textContent         = money(r.totalPago);
  $('#uso-pct').textContent          = pct(r.pctUso);
  $('#uso-restante').textContent     = money(r.aPagar);
  $('#uso-pct-restante').textContent = pct(Math.max(100 - r.pctUso, 0));
  setProgress($('#uso-bar'), r.pctUso);

  $('#uso-contador').textContent =
    `${plural(estado.utilizacao.length, 'item', 'itens')} · previsto ${money(r.totalPrevisto)}`;

  const lista = $('#uso-list');
  if (!estado.utilizacao.length) {
    lista.innerHTML = '<div class="empty">Nenhum item cadastrado ainda.</div>';
    return;
  }

  lista.innerHTML = estado.utilizacao.map(item => {
    const valor    = Number(item.valor || 0);
    const pago     = Number(item.valor_pago || 0);
    const restante = Number(item.valor_restante ?? Math.max(valor - pago, 0));
    const p        = calcPct(pago, valor);
    const quitado  = valor > 0 && restante <= 0;

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

/* -------------------------------------------------- Tabela de lançamentos */

function renderArrecadacao() {
  const mostrar = estado.config.mostrar_nomes !== false;
  $('#nomes-aviso').hidden = mostrar;

  const porId = new Map(estado.pessoas.map(p => [String(p.id), p]));
  const termo = estado.filtro.trim().toLowerCase();

  const linhas = estado.pagamentos
    .map(pg => ({ pg, pessoa: porId.get(String(pg.pessoa_id)) }))
    .filter(({ pg, pessoa }) => {
      if (!pessoa) return false;
      if (!termo) return true;
      // Com nomes ocultos a busca ocorre sobre o texto mascarado,
      // para não vazar o nome real através do filtro.
      const alvo = mascararNome(pessoa.nome, mostrar).toLowerCase();
      return alvo.includes(termo)
          || dataBR(pg.data).includes(termo)
          || String(pg.forma).includes(termo);
    });

  const tbody = $('#tb-arrecadacao');
  if (!linhas.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty">${
      estado.pagamentos.length ? 'Nenhum resultado para a busca.' : 'Nenhuma contribuição registrada ainda.'
    }</div></td></tr>`;
    $('#tf-arrecadacao').innerHTML = '';
    return;
  }

  tbody.innerHTML = linhas.map(({ pg, pessoa }) => `
    <tr class="st-${pessoa.status.replace('_','-')}">
      <td class="nowrap">${dataBR(pg.data)}</td>
      <td>
        <i class="dot" style="background:var(--st-${pessoa.status.replace('_','-')})"></i>
        ${esc(mascararNome(pessoa.nome, mostrar))}
      </td>
      <td><span class="tag tag-${esc(pg.forma)}">${pg.forma === 'pix' ? 'PIX' : 'Dinheiro'}</span></td>
      <td class="num">${money(pg.valor)}</td>
    </tr>`).join('');

  const soma = linhas.reduce((s, { pg }) => s + (Number(pg.valor) || 0), 0);
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

$('#filtros-status').addEventListener('click', e => {
  const btn = e.target.closest('button[data-status]');
  if (!btn || btn.disabled) return;
  estado.filtroStatus = (estado.filtroStatus === btn.dataset.status) ? '' : btn.dataset.status;
  renderPessoas();
});

$('#pessoas-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-ver]');
  if (btn && !btn.disabled) verDoacoes(btn.dataset.ver);
});

carregar();

// Atualiza sozinho a cada 60s (para telas deixadas abertas na festa)…
setInterval(carregar, 60000);

// …e assim que a pessoa volta para a aba
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) carregar();
});
