/* =====================================================================
   admin.js — painel administrativo
   ===================================================================== */

/* Imagens disponíveis na pasta img/ para escolher como logo.
   Acrescente aqui o nome de qualquer arquivo novo que você subir. */
const LOGOS_DISPONIVEIS = [
  { valor: 'img/logo.png',  rotulo: 'logo.png' },
  { valor: 'img/logo.svg',  rotulo: 'logo.svg' },
  { valor: 'img/logo2.png', rotulo: 'logo2.png' },
  { valor: '',              rotulo: '— sem logo —' }
];

const SESSAO_KEY = 'festa_admin';

const st = { config: {}, arrecadacao: [], utilizacao: [], admin: null };

/* =====================================================================
   LOGIN
   ===================================================================== */

function sessaoAtiva() {
  try {
    const raw = sessionStorage.getItem(SESSAO_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // expira em 8 horas
    if (!s || !s.usuario || Date.now() - s.em > 8 * 3600 * 1000) {
      sessionStorage.removeItem(SESSAO_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn  = $('#btn-entrar');
  const erro = $('#login-erro');
  erro.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  try {
    const { data, error } = await db.rpc('admin_login', {
      p_usuario: $('#usuario').value,
      p_senha:   $('#senha').value
    });
    if (error) throw error;

    const admin = Array.isArray(data) ? data[0] : data;
    if (!admin) {
      erro.textContent = 'Usuário ou senha incorretos.';
      erro.hidden = false;
      return;
    }

    st.admin = admin;
    sessionStorage.setItem(SESSAO_KEY, JSON.stringify({
      usuario: admin.usuario, nome: admin.nome, em: Date.now()
    }));
    $('#senha').value = '';
    abrirPainel();
  } catch (err) {
    console.error(err);
    erro.textContent = 'Falha ao conectar: ' + (err.message || 'erro desconhecido');
    erro.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

$('#btn-sair').addEventListener('click', () => {
  sessionStorage.removeItem(SESSAO_KEY);
  location.reload();
});

function abrirPainel() {
  $('#tela-login').hidden = true;
  $('#tela-painel').hidden = false;
  $('#who').textContent = st.admin ? (st.admin.nome || st.admin.usuario) : '';
  carregarTudo();
}

/* =====================================================================
   ABAS
   ===================================================================== */

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
  ['arrecadacao', 'utilizacao', 'config'].forEach(t => {
    $('#tab-' + t).hidden = (t !== btn.dataset.tab);
  });
});

/* =====================================================================
   CARGA DE DADOS
   ===================================================================== */

async function carregarTudo() {
  try {
    const [cfg, arr, uso] = await Promise.all([
      db.from('config').select('*').eq('id', 1).maybeSingle(),
      db.from('arrecadacao').select('*').order('data', { ascending: false }).order('id', { ascending: false }),
      db.from('utilizacao').select('*').order('ordem', { ascending: true }).order('id', { ascending: true })
    ]);
    if (cfg.error) throw cfg.error;
    if (arr.error) throw arr.error;
    if (uso.error) throw uso.error;

    st.config      = cfg.data || {};
    st.arrecadacao = arr.data || [];
    st.utilizacao  = uso.data || [];

    renderKPIs();
    renderTabelaArrecadacao();
    renderTabelaUtilizacao();
    preencherConfig();
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar: ' + (err.message || 'desconhecido'), 'err');
  }
}

function renderKPIs() {
  const r = calcularResumo(st.arrecadacao, st.utilizacao, st.config.meta_valor);
  $('#k-arrecadado').textContent = money(r.totalArrecadado);
  $('#k-utilizado').textContent  = money(r.totalPago);
  $('#k-saldo').textContent      = money(r.saldo);
  $('#k-meta').textContent       = r.metaValor > 0 ? pct(r.pctMeta) : '—';
  $('#k-saldo').parentElement.classList.toggle('bad', r.saldo < 0);
  $('#brand-evento').textContent = st.config.evento_nome || '—';
}

/* =====================================================================
   ARRECADAÇÃO — CRUD
   ===================================================================== */

$('#a-data').value = hojeISO();

$('#form-arrecadacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#a-id').value;
  const payload = {
    data:       $('#a-data').value,
    nome:       $('#a-nome').value.trim(),
    valor:      parseValor($('#a-valor').value),
    forma:      $('#a-forma').value,
    observacao: $('#a-obs').value.trim()
  };

  if (!payload.nome)      return toast('Informe o nome.', 'err');
  if (payload.valor <= 0) return toast('O valor deve ser maior que zero.', 'err');

  const btn = $('#a-submit');
  btn.disabled = true;

  try {
    const res = id
      ? await db.from('arrecadacao').update(payload).eq('id', id)
      : await db.from('arrecadacao').insert(payload);
    if (res.error) throw res.error;

    toast(id ? 'Lançamento atualizado.' : 'Lançamento adicionado.', 'ok');
    resetFormArrecadacao();
    await carregarTudo();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar: ' + (err.message || 'desconhecido'), 'err');
  } finally {
    btn.disabled = false;
  }
});

$('#a-cancelar').addEventListener('click', resetFormArrecadacao);

function resetFormArrecadacao() {
  $('#a-id').value = '';
  $('#a-nome').value = '';
  $('#a-valor').value = '';
  $('#a-obs').value = '';
  $('#a-forma').value = 'pix';
  $('#a-data').value = hojeISO();
  $('#a-submit').textContent = 'Adicionar lançamento';
  $('#a-cancelar').hidden = true;
}

function editarArrecadacao(id) {
  const r = st.arrecadacao.find(x => String(x.id) === String(id));
  if (!r) return;
  $('#a-id').value    = r.id;
  $('#a-data').value  = String(r.data).slice(0, 10);
  $('#a-nome').value  = r.nome;
  $('#a-valor').value = Number(r.valor).toFixed(2).replace('.', ',');
  $('#a-forma').value = r.forma;
  $('#a-obs').value   = r.observacao || '';
  $('#a-submit').textContent = 'Salvar alterações';
  $('#a-cancelar').hidden = false;
  $('#form-arrecadacao').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirArrecadacao(id) {
  const r = st.arrecadacao.find(x => String(x.id) === String(id));
  const ok = await confirmar(
    'Excluir lançamento',
    `Remover ${money(r?.valor)} de "${r?.nome}"? Esta ação não pode ser desfeita.`
  );
  if (!ok) return;

  const { error } = await db.from('arrecadacao').delete().eq('id', id);
  if (error) return toast('Erro ao excluir: ' + error.message, 'err');
  toast('Lançamento excluído.', 'ok');
  carregarTudo();
}

function renderTabelaArrecadacao() {
  const tbody = $('#tb-arrecadacao');
  const total = st.arrecadacao.reduce((s, r) => s + Number(r.valor || 0), 0);
  $('#a-contador').textContent =
    `${st.arrecadacao.length} lançamento(s) · total ${money(total)}`;

  if (!st.arrecadacao.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty">Nenhum lançamento ainda.</div></td></tr>';
    return;
  }

  tbody.innerHTML = st.arrecadacao.map(r => `
    <tr>
      <td class="nowrap">${dataBR(r.data)}</td>
      <td>${esc(r.nome)}</td>
      <td><span class="tag tag-${esc(r.forma)}">${r.forma === 'pix' ? 'PIX' : 'Dinheiro'}</span></td>
      <td class="num">${money(r.valor)}</td>
      <td class="faint">${esc(r.observacao || '')}</td>
      <td>
        <div class="acoes">
          <button class="btn btn-sm btn-ghost" data-acao="editar-a" data-id="${r.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-acao="excluir-a" data-id="${r.id}">Excluir</button>
        </div>
      </td>
    </tr>`).join('');
}

/* =====================================================================
   UTILIZAÇÃO — CRUD
   ===================================================================== */

$('#form-utilizacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#u-id').value;
  const payload = {
    titulo:     $('#u-titulo').value.trim(),
    descricao:  $('#u-descricao').value.trim(),
    valor:      parseValor($('#u-valor').value),
    valor_pago: parseValor($('#u-pago').value),
    ordem:      parseInt($('#u-ordem').value, 10) || 0
  };

  if (!payload.titulo)     return toast('Informe o título.', 'err');
  if (payload.valor < 0)   return toast('Valor previsto inválido.', 'err');
  if (payload.valor_pago < 0) return toast('Valor pago inválido.', 'err');
  if (payload.valor_pago > payload.valor) {
    const ok = await confirmar(
      'Valor pago maior que o previsto',
      `Você pagou ${money(payload.valor_pago)} num item previsto em ${money(payload.valor)}. Deseja continuar assim mesmo?`
    );
    if (!ok) return;
  }

  const btn = $('#u-submit');
  btn.disabled = true;

  try {
    const res = id
      ? await db.from('utilizacao').update(payload).eq('id', id)
      : await db.from('utilizacao').insert(payload);
    if (res.error) throw res.error;

    toast(id ? 'Item atualizado.' : 'Item adicionado.', 'ok');
    resetFormUtilizacao();
    await carregarTudo();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar: ' + (err.message || 'desconhecido'), 'err');
  } finally {
    btn.disabled = false;
  }
});

$('#u-cancelar').addEventListener('click', resetFormUtilizacao);

function resetFormUtilizacao() {
  $('#u-id').value = '';
  $('#u-titulo').value = '';
  $('#u-descricao').value = '';
  $('#u-valor').value = '';
  $('#u-pago').value = '';
  $('#u-ordem').value = st.utilizacao.length ? (st.utilizacao.length + 1) : 0;
  $('#u-submit').textContent = 'Adicionar item';
  $('#u-cancelar').hidden = true;
}

function editarUtilizacao(id) {
  const r = st.utilizacao.find(x => String(x.id) === String(id));
  if (!r) return;
  $('#u-id').value        = r.id;
  $('#u-titulo').value    = r.titulo;
  $('#u-descricao').value = r.descricao || '';
  $('#u-valor').value     = Number(r.valor).toFixed(2).replace('.', ',');
  $('#u-pago').value      = Number(r.valor_pago).toFixed(2).replace('.', ',');
  $('#u-ordem').value     = r.ordem ?? 0;
  $('#u-submit').textContent = 'Salvar alterações';
  $('#u-cancelar').hidden = false;
  $('#form-utilizacao').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirUtilizacao(id) {
  const r = st.utilizacao.find(x => String(x.id) === String(id));
  const ok = await confirmar('Excluir item', `Remover "${r?.titulo}" da lista de utilização?`);
  if (!ok) return;

  const { error } = await db.from('utilizacao').delete().eq('id', id);
  if (error) return toast('Erro ao excluir: ' + error.message, 'err');
  toast('Item excluído.', 'ok');
  carregarTudo();
}

function renderTabelaUtilizacao() {
  const tbody = $('#tb-utilizacao');
  const prev = st.utilizacao.reduce((s, r) => s + Number(r.valor || 0), 0);
  const pago = st.utilizacao.reduce((s, r) => s + Number(r.valor_pago || 0), 0);
  $('#u-contador').textContent =
    `${st.utilizacao.length} item(ns) · previsto ${money(prev)} · pago ${money(pago)}`;

  if (!st.utilizacao.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty">Nenhum item cadastrado.</div></td></tr>';
    return;
  }

  tbody.innerHTML = st.utilizacao.map(r => {
    const p = calcPct(r.valor_pago, r.valor);
    const restante = Number(r.valor_restante ?? Math.max(r.valor - r.valor_pago, 0));
    return `
    <tr>
      <td>
        <b>${esc(r.titulo)}</b>
        ${r.descricao ? `<div class="faint">${esc(r.descricao)}</div>` : ''}
      </td>
      <td class="num">${money(r.valor)}</td>
      <td class="num">${money(r.valor_pago)}</td>
      <td class="num">${money(restante)}</td>
      <td>
        <div class="mini-prog">
          <div class="progress ${p >= 100 ? 'is-success' : ''}" style="--pct:${clamp100(p).toFixed(2)}%"><span></span></div>
          <span class="pct">${pct(p)}</span>
        </div>
      </td>
      <td>
        <div class="acoes">
          <button class="btn btn-sm btn-ghost" data-acao="editar-u" data-id="${r.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-acao="excluir-u" data-id="${r.id}">Excluir</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* =====================================================================
   CONFIGURAÇÕES
   ===================================================================== */

function preencherConfig() {
  const c = st.config;
  $('#c-nome').value      = c.evento_nome || '';
  $('#c-subtitulo').value = c.evento_subtitulo || '';
  $('#c-meta').value      = Number(c.meta_valor || 0).toFixed(2).replace('.', ',');
  $('#c-pix').value       = c.chave_pix || '';
  $('#c-mensagem').value  = c.mensagem || '';

  // Lista de logos
  const sel = $('#c-logo');
  sel.innerHTML = LOGOS_DISPONIVEIS
    .map(o => `<option value="${esc(o.valor)}">${esc(o.rotulo)}</option>`).join('');

  const atual = c.logo_url || '';
  const naLista = LOGOS_DISPONIVEIS.some(o => o.valor === atual);
  if (naLista) {
    sel.value = atual;
    $('#c-logo-url').value = '';
  } else {
    sel.value = '';
    $('#c-logo-url').value = atual;
  }
  atualizarPreviewLogo();

  $('#c-mostrar-nomes').checked = c.mostrar_nomes !== false;
  atualizarLabelNomes();
}

function logoEscolhido() {
  const custom = $('#c-logo-url').value.trim();
  return custom || $('#c-logo').value;
}

function atualizarPreviewLogo() {
  const url = logoEscolhido();
  const img = $('#c-logo-preview');
  img.style.opacity = '1';
  if (url) { img.src = url; img.hidden = false; }
  else     { img.hidden = true; }
}

$('#c-logo').addEventListener('change', () => { $('#c-logo-url').value = ''; atualizarPreviewLogo(); });
$('#c-logo-url').addEventListener('input', atualizarPreviewLogo);

function atualizarLabelNomes() {
  const mostrar = $('#c-mostrar-nomes').checked;
  $('#c-mostrar-label').textContent = mostrar ? 'Mostrar nomes completos' : 'Ocultar nomes (mascarados)';
  const exemplo = st.arrecadacao[0]?.nome || 'João Silva';
  $('#c-exemplo').textContent = mascararNome(exemplo, mostrar);
}
$('#c-mostrar-nomes').addEventListener('change', atualizarLabelNomes);

$('#form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    evento_nome:      $('#c-nome').value.trim() || 'Festa de Fim de Ano',
    evento_subtitulo: $('#c-subtitulo').value.trim(),
    meta_valor:       parseValor($('#c-meta').value),
    chave_pix:        $('#c-pix').value.trim(),
    mensagem:         $('#c-mensagem').value.trim(),
    logo_url:         logoEscolhido(),
    mostrar_nomes:    $('#c-mostrar-nomes').checked,
    atualizado_em:    new Date().toISOString()
  };

  const { error } = await db.from('config').update(payload).eq('id', 1);
  if (error) {
    console.error(error);
    return toast('Erro ao salvar: ' + error.message, 'err');
  }
  toast('Configurações salvas.', 'ok');
  carregarTudo();
});

/* =====================================================================
   DELEGAÇÃO DE CLIQUES (editar / excluir)
   ===================================================================== */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-acao]');
  if (!btn) return;
  const id = btn.dataset.id;
  switch (btn.dataset.acao) {
    case 'editar-a':  editarArrecadacao(id); break;
    case 'excluir-a': excluirArrecadacao(id); break;
    case 'editar-u':  editarUtilizacao(id); break;
    case 'excluir-u': excluirUtilizacao(id); break;
  }
});

/* =====================================================================
   MODAL DE CONFIRMAÇÃO (substitui window.confirm)
   ===================================================================== */

function confirmar(titulo, texto) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(titulo)}</h2>
        <p class="muted">${esc(texto)}</p>
        <div class="form-actions" style="justify-content:flex-end;margin-top:18px">
          <button class="btn btn-ghost" data-r="0">Cancelar</button>
          <button class="btn btn-primary" data-r="1">Confirmar</button>
        </div>
      </div>`;

    const fechar = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (ev) => { if (ev.key === 'Escape') fechar(false); };

    back.addEventListener('click', (ev) => {
      if (ev.target === back) return fechar(false);
      const b = ev.target.closest('[data-r]');
      if (b) fechar(b.dataset.r === '1');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    back.querySelector('[data-r="1"]').focus();
  });
}

/* =====================================================================
   BOOT
   ===================================================================== */

(function init() {
  const s = sessaoAtiva();
  if (s) {
    st.admin = s;
    abrirPainel();
  } else {
    $('#tela-login').hidden = false;
    $('#usuario').focus();
  }
})();
