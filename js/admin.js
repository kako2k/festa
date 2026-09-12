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

const st = {
  config: {},
  pessoas: [],      // calculadas
  pagamentos: [],
  utilizacao: [],
  admin: null
};

/* =====================================================================
   LOGIN
   ===================================================================== */

function sessaoAtiva() {
  try {
    const raw = sessionStorage.getItem(SESSAO_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
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
  ['pessoas', 'utilizacao', 'config'].forEach(t => {
    $('#tab-' + t).hidden = (t !== btn.dataset.tab);
  });
});

/* =====================================================================
   CARGA DE DADOS
   ===================================================================== */

async function carregarTudo() {
  try {
    const [cfg, pes, pag, uso] = await Promise.all([
      db.from('config').select('*').eq('id', 1).maybeSingle(),
      db.from('pessoas').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true }),
      db.from('pagamentos').select('*').order('data', { ascending: false }).order('id', { ascending: false }),
      db.from('utilizacao').select('*').order('ordem', { ascending: true }).order('id', { ascending: true })
    ]);
    if (cfg.error) throw cfg.error;
    if (pes.error) throw pes.error;
    if (pag.error) throw pag.error;
    if (uso.error) throw uso.error;

    st.config     = cfg.data || {};
    st.pagamentos = pag.data || [];
    st.utilizacao = uso.data || [];
    st.pessoas    = montarPessoas(pes.data || [], st.pagamentos, st.config.valor_por_pessoa);

    aplicarCoresStatus(st.config);

    renderKPIs();
    renderTabelaPessoas();
    renderTabelaUtilizacao();
    preencherConfig();
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar: ' + (err.message || 'desconhecido'), 'err');
  }
}

function resumo() {
  return calcularResumo(st.pagamentos, st.utilizacao, st.config.meta_valor, st.pessoas);
}

function renderKPIs() {
  const r = resumo();
  $('#k-arrecadado').textContent = money(r.totalArrecadado);
  $('#k-utilizado').textContent  = money(r.totalPago);
  $('#k-saldo').textContent      = money(r.saldo);
  $('#k-meta').textContent       = r.metaValor > 0 ? pct(r.pctMeta) : '—';
  $('#k-saldo').parentElement.classList.toggle('bad', r.saldo < 0);
  $('#brand-evento').textContent = st.config.evento_nome || '—';

  const rot = rotulosStatus(st.config);
  $('#k-legenda').innerHTML = STATUS_ORDEM.map(s => `
    <span class="legenda-item">
      <i class="dot" style="background:var(--st-${s.replace('_','-')})"></i>
      ${esc(rot[s])} <b>${r.statusContagem[s]}</b>
    </span>`).join('') +
    `<span class="legenda-item faint">Faltam ${money(r.faltaPessoas)} de ${money(r.esperadoTotal)}</span>`;
}

/* =====================================================================
   PESSOAS — CRUD
   ===================================================================== */

$('#form-pessoa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#p-id').value;
  const previstoTxt = $('#p-previsto').value.trim();

  const payload = {
    nome:           $('#p-nome').value.trim(),
    valor_previsto: previstoTxt === '' ? null : parseValor(previstoTxt),
    observacao:     $('#p-obs').value.trim(),
    ordem:          parseInt($('#p-ordem').value, 10) || 0
  };

  if (!payload.nome) return toast('Informe o nome.', 'err');

  const btn = $('#p-submit');
  btn.disabled = true;

  try {
    const res = id
      ? await db.from('pessoas').update(payload).eq('id', id)
      : await db.from('pessoas').insert(payload);
    if (res.error) throw res.error;

    toast(id ? 'Pessoa atualizada.' : 'Pessoa cadastrada.', 'ok');
    resetFormPessoa();
    await carregarTudo();
  } catch (err) {
    console.error(err);
    const dup = String(err.message || '').includes('pessoas_nome_uniq');
    toast(dup ? 'Já existe uma pessoa com esse nome.'
              : 'Erro ao salvar: ' + (err.message || 'desconhecido'), 'err');
  } finally {
    btn.disabled = false;
  }
});

$('#p-cancelar').addEventListener('click', resetFormPessoa);

function resetFormPessoa() {
  $('#p-id').value = '';
  $('#p-nome').value = '';
  $('#p-previsto').value = '';
  $('#p-obs').value = '';
  $('#p-ordem').value = st.pessoas.length;
  $('#p-submit').textContent = 'Cadastrar pessoa';
  $('#p-cancelar').hidden = true;
}

function editarPessoa(id) {
  const p = st.pessoas.find(x => String(x.id) === String(id));
  if (!p) return;
  $('#p-id').value       = p.id;
  $('#p-nome').value     = p.nome;
  $('#p-previsto').value = (p.valor_previsto === null || p.valor_previsto === undefined)
    ? '' : Number(p.valor_previsto).toFixed(2).replace('.', ',');
  $('#p-obs').value      = p.observacao || '';
  $('#p-ordem').value    = p.ordem ?? 0;
  $('#p-submit').textContent = 'Salvar alterações';
  $('#p-cancelar').hidden = false;
  $('#form-pessoa').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirPessoa(id) {
  const p = st.pessoas.find(x => String(x.id) === String(id));
  if (!p) return;
  const ok = await confirmar(
    'Excluir pessoa',
    p.pagamentos.length
      ? `Remover "${p.nome}" e as ${plural(p.pagamentos.length, 'contribuição', 'contribuições')} dela (${money(p.pago)})? Não dá para desfazer.`
      : `Remover "${p.nome}" do cadastro?`
  );
  if (!ok) return;

  const { error } = await db.from('pessoas').delete().eq('id', id);
  if (error) return toast('Erro ao excluir: ' + error.message, 'err');
  toast('Pessoa excluída.', 'ok');
  carregarTudo();
}

function renderTabelaPessoas() {
  const tbody = $('#tb-pessoas');
  const r = resumo();
  const rot = rotulosStatus(st.config);

  $('#p-contador').textContent = st.pessoas.length
    ? `${plural(st.pessoas.length, 'pessoa', 'pessoas')} · ${money(r.totalArrecadado)} de ${money(r.esperadoTotal)}`
    : '';

  if (!st.pessoas.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty">Nenhuma pessoa cadastrada. Comece cadastrando a lista de convidados acima.</div></td></tr>';
    return;
  }

  tbody.innerHTML = st.pessoas.map(p => {
    const s = p.status.replace('_', '-');
    return `
    <tr class="st-${s}">
      <td>
        <i class="dot" style="background:var(--st-${s})"></i>
        <b>${esc(p.nome)}</b>
        ${p.observacao ? `<div class="faint">${esc(p.observacao)}</div>` : ''}
        ${p.pagamentos.length ? `<div class="faint">${plural(p.pagamentos.length, 'contribuição', 'contribuições')}</div>` : ''}
      </td>
      <td class="num"><b>${money(p.pago)}</b></td>
      <td class="num">${money(p.previsto)}${
        (p.valor_previsto !== null && p.valor_previsto !== undefined)
          ? ' <span class="faint">(próprio)</span>' : ''
      }</td>
      <td class="num">${p.status === 'especial'
          ? `<span style="color:var(--st-especial)">+${money(p.excedente)}</span>`
          : money(p.restante)}</td>
      <td><span class="badge-status" style="color:var(--st-${s});border-color:var(--st-${s})">${esc(rot[p.status])}</span></td>
      <td>
        <div class="acoes">
          <button class="btn btn-sm btn-primary" data-acao="pagamentos" data-id="${p.id}">Contribuições</button>
          <button class="btn btn-sm btn-ghost"   data-acao="editar-p"   data-id="${p.id}">Editar</button>
          <button class="btn btn-sm btn-danger"  data-acao="excluir-p"  data-id="${p.id}">Excluir</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ------------------------------------------------- Cadastro em lote */

$('#btn-varios').addEventListener('click', async () => {
  const nomes = await pedirTexto(
    'Cadastrar vários',
    'Um nome por linha. Todos entram com R$ 0,00 e o valor previsto padrão.',
    'João Silva\nMaria de Souza\nCarlos Lima'
  );
  if (!nomes) return;

  const lista = nomes.split('\n').map(n => n.trim()).filter(Boolean);
  if (!lista.length) return;

  const jaTem = new Set(st.pessoas.map(p => p.nome.trim().toLowerCase()));
  const novos = lista.filter(n => !jaTem.has(n.toLowerCase()));
  const repetidos = lista.length - novos.length;

  if (!novos.length) return toast('Todos esses nomes já estão cadastrados.', 'err');

  const base = st.pessoas.length;
  const { error } = await db.from('pessoas')
    .insert(novos.map((nome, i) => ({ nome, ordem: base + i + 1 })));

  if (error) return toast('Erro ao cadastrar: ' + error.message, 'err');
  toast(`${plural(novos.length, 'pessoa cadastrada', 'pessoas cadastradas')}` +
        (repetidos ? ` · ${repetidos} já existia${repetidos === 1 ? '' : 'm'}` : '') + '.', 'ok');
  carregarTudo();
});

/* =====================================================================
   PAGAMENTOS DE UMA PESSOA (modal)
   ===================================================================== */

function abrirPagamentos(pessoaId) {
  const p = st.pessoas.find(x => String(x.id) === String(pessoaId));
  if (!p) return;
  const rot = rotulosStatus(st.config);
  const s = p.status.replace('_', '-');

  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal modal-lg st-${s}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>
          <h2>${esc(p.nome)}</h2>
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

      <div class="progress slim" style="--pct:${clamp100(p.pctPessoa).toFixed(2)}%;margin-bottom:18px">
        <span></span>
      </div>

      <form class="form-inline" id="form-pagamento">
        <h3 id="pg-titulo">Registrar contribuição</h3>
        <input type="hidden" id="pg-id">
        <div class="row">
          <div class="field">
            <label for="pg-data">Data</label>
            <input type="date" id="pg-data" required value="${hojeISO()}">
          </div>
          <div class="field">
            <label for="pg-valor">Valor (R$)</label>
            <input type="text" id="pg-valor" required placeholder="0,00" inputmode="decimal" autocomplete="off">
          </div>
          <div class="field">
            <label for="pg-forma">Forma</label>
            <select id="pg-forma" required>
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="pg-obs">Observação (opcional)</label>
          <input type="text" id="pg-obs" placeholder="Ex.: 1ª parcela" autocomplete="off">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="pg-submit">Adicionar contribuição</button>
          <button type="button" class="btn btn-ghost" id="pg-cancelar" hidden>Cancelar edição</button>
          <button type="button" class="btn btn-ghost btn-sm" id="pg-quitar">Lançar o valor que falta</button>
        </div>
      </form>

      <div class="table-wrap" style="margin-top:6px">
        <table>
          <thead><tr><th>Data</th><th>Forma</th><th class="num">Valor</th><th>Obs.</th><th></th></tr></thead>
          <tbody id="tb-pagamentos"></tbody>
        </table>
      </div>
    </div>`;

  const fechar = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop + .modal-backdrop')) fechar(); };

  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-fechar]')) fechar();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);

  /* ---- estado local do modal ---- */
  const atualId = () => String(pessoaId);

  function pessoaAtual() {
    return st.pessoas.find(x => String(x.id) === atualId());
  }

  function renderLista() {
    const pa = pessoaAtual();
    const tb = back.querySelector('#tb-pagamentos');
    if (!pa || !pa.pagamentos.length) {
      tb.innerHTML = '<tr><td colspan="5"><div class="empty">Nenhuma contribuição registrada.</div></td></tr>';
      return;
    }
    tb.innerHTML = pa.pagamentos.map(pg => `
      <tr>
        <td class="nowrap">${dataBR(pg.data)}</td>
        <td><span class="tag tag-${esc(pg.forma)}">${pg.forma === 'pix' ? 'PIX' : 'Dinheiro'}</span></td>
        <td class="num">${money(pg.valor)}</td>
        <td class="faint">${esc(pg.observacao || '')}</td>
        <td>
          <div class="acoes">
            <button class="btn btn-sm btn-ghost"  data-pg-editar="${pg.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-pg-excluir="${pg.id}">Excluir</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function atualizarCabecalhoModal() {
    const pa = pessoaAtual();
    if (!pa) return fechar();
    const rot2 = rotulosStatus(st.config);
    const s2 = pa.status.replace('_', '-');
    const modal = back.querySelector('.modal');
    modal.className = `modal modal-lg st-${s2}`;
    back.querySelector('.badge-status').textContent = rot2[pa.status];
    const cels = back.querySelectorAll('.modal-resumo b');
    cels[0].textContent = money(pa.pago);
    cels[1].textContent = money(pa.previsto);
    cels[2].textContent = money(pa.status === 'especial' ? pa.excedente : pa.restante);
    back.querySelectorAll('.modal-resumo span')[2].textContent =
      pa.status === 'especial' ? 'A mais' : 'Falta';
    back.querySelector('.progress.slim')
        .style.setProperty('--pct', clamp100(pa.pctPessoa).toFixed(2) + '%');
    back.querySelector('#pg-quitar').hidden = !(pa.restante > 0);
  }

  function resetFormPg() {
    back.querySelector('#pg-id').value = '';
    back.querySelector('#pg-valor').value = '';
    back.querySelector('#pg-obs').value = '';
    back.querySelector('#pg-forma').value = 'pix';
    back.querySelector('#pg-data').value = hojeISO();
    back.querySelector('#pg-titulo').textContent = 'Registrar contribuição';
    back.querySelector('#pg-submit').textContent = 'Adicionar contribuição';
    back.querySelector('#pg-cancelar').hidden = true;
  }

  back.querySelector('#form-pagamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pgId = back.querySelector('#pg-id').value;
    const payload = {
      pessoa_id:  Number(pessoaId),
      data:       back.querySelector('#pg-data').value,
      valor:      parseValor(back.querySelector('#pg-valor').value),
      forma:      back.querySelector('#pg-forma').value,
      observacao: back.querySelector('#pg-obs').value.trim()
    };
    if (payload.valor <= 0) return toast('O valor deve ser maior que zero.', 'err');

    const btn = back.querySelector('#pg-submit');
    btn.disabled = true;
    try {
      const res = pgId
        ? await db.from('pagamentos').update(payload).eq('id', pgId)
        : await db.from('pagamentos').insert(payload);
      if (res.error) throw res.error;
      toast(pgId ? 'Contribuição atualizada.' : 'Contribuição registrada.', 'ok');
      resetFormPg();
      await carregarTudo();
      atualizarCabecalhoModal();
      renderLista();
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar: ' + (err.message || 'desconhecido'), 'err');
    } finally {
      btn.disabled = false;
    }
  });

  back.querySelector('#pg-cancelar').addEventListener('click', resetFormPg);

  back.querySelector('#pg-quitar').addEventListener('click', () => {
    const pa = pessoaAtual();
    if (!pa || pa.restante <= 0) return;
    back.querySelector('#pg-valor').value = pa.restante.toFixed(2).replace('.', ',');
    back.querySelector('#pg-valor').focus();
  });

  back.querySelector('#tb-pagamentos').addEventListener('click', async (e) => {
    const bEd = e.target.closest('[data-pg-editar]');
    const bEx = e.target.closest('[data-pg-excluir]');
    const pa = pessoaAtual();
    if (!pa) return;

    if (bEd) {
      const pg = pa.pagamentos.find(x => String(x.id) === bEd.dataset.pgEditar);
      if (!pg) return;
      back.querySelector('#pg-id').value    = pg.id;
      back.querySelector('#pg-data').value  = String(pg.data).slice(0, 10);
      back.querySelector('#pg-valor').value = Number(pg.valor).toFixed(2).replace('.', ',');
      back.querySelector('#pg-forma').value = pg.forma;
      back.querySelector('#pg-obs').value   = pg.observacao || '';
      back.querySelector('#pg-titulo').textContent = 'Editar contribuição';
      back.querySelector('#pg-submit').textContent = 'Salvar alterações';
      back.querySelector('#pg-cancelar').hidden = false;
      return;
    }

    if (bEx) {
      const pg = pa.pagamentos.find(x => String(x.id) === bEx.dataset.pgExcluir);
      if (!pg) return;
      const ok = await confirmar('Excluir contribuição',
        `Remover ${money(pg.valor)} de ${dataBR(pg.data)}?`);
      if (!ok) return;
      const { error } = await db.from('pagamentos').delete().eq('id', pg.id);
      if (error) return toast('Erro ao excluir: ' + error.message, 'err');
      toast('Contribuição excluída.', 'ok');
      await carregarTudo();
      atualizarCabecalhoModal();
      renderLista();
    }
  });

  atualizarCabecalhoModal();
  renderLista();
  back.querySelector('#pg-valor').focus();
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

  if (!payload.titulo)        return toast('Informe o título.', 'err');
  if (payload.valor < 0)      return toast('Valor previsto inválido.', 'err');
  if (payload.valor_pago < 0) return toast('Valor pago inválido.', 'err');
  if (payload.valor_pago > payload.valor) {
    const ok = await confirmar(
      'Valor pago maior que o previsto',
      `Você pagou ${money(payload.valor_pago)} num item previsto em ${money(payload.valor)}. Continuar?`
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
    `${plural(st.utilizacao.length, 'item', 'itens')} · previsto ${money(prev)} · pago ${money(pago)}`;

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
  $('#c-nome').value       = c.evento_nome || '';
  $('#c-subtitulo').value  = c.evento_subtitulo || '';
  $('#c-meta').value       = Number(c.meta_valor || 0).toFixed(2).replace('.', ',');
  $('#c-por-pessoa').value = Number(c.valor_por_pessoa ?? 3000).toFixed(2).replace('.', ',');
  $('#c-pix').value        = c.chave_pix || '';
  $('#c-mensagem').value   = c.mensagem || '';

  renderCoresGrid();

  const sel = $('#c-logo');
  sel.innerHTML = LOGOS_DISPONIVEIS
    .map(o => `<option value="${esc(o.valor)}">${esc(o.rotulo)}</option>`).join('');

  const atual = c.logo_url || '';
  const naLista = LOGOS_DISPONIVEIS.some(o => o.valor === atual);
  if (naLista) { sel.value = atual; $('#c-logo-url').value = ''; }
  else         { sel.value = '';    $('#c-logo-url').value = atual; }
  atualizarPreviewLogo();

  $('#c-mostrar-nomes').checked = c.mostrar_nomes !== false;
  atualizarLabelNomes();
}

/* --------------------------------------------------------- Cores/rótulos */

const CAMPOS_STATUS = {
  nao_doou: { cor: 'cor_nao_doou', rotulo: 'rotulo_nao_doou', ajuda: 'Ainda não pagou nada (R$ 0,00)' },
  parcial:  { cor: 'cor_parcial',  rotulo: 'rotulo_parcial',  ajuda: 'Pagou parte do valor esperado' },
  total:    { cor: 'cor_total',    rotulo: 'rotulo_total',    ajuda: 'Pagou o valor esperado por completo' },
  especial: { cor: 'cor_especial', rotulo: 'rotulo_especial', ajuda: 'Pagou acima do valor esperado' }
};

function renderCoresGrid() {
  const cores = coresStatus(st.config);
  const rot   = rotulosStatus(st.config);

  $('#cores-grid').innerHTML = STATUS_ORDEM.map(s => {
    const f = CAMPOS_STATUS[s];
    return `
    <div class="cor-item" data-status="${s}">
      <div class="cor-topo">
        <input type="color" class="cor-input" id="cor-${s}" value="${esc(cores[s])}"
               aria-label="Cor de ${esc(rot[s])}">
        <input type="text" class="cor-hex" id="hex-${s}" value="${esc(cores[s])}"
               maxlength="7" spellcheck="false" aria-label="Código da cor">
      </div>
      <input type="text" class="cor-rotulo" id="rot-${s}" value="${esc(rot[s])}"
             maxlength="24" placeholder="Nome do status" aria-label="Nome do status">
      <div class="hint">${esc(f.ajuda)}</div>
      <div class="cor-exemplo" id="ex-${s}">
        <i class="dot"></i><span>${esc(rot[s])}</span>
      </div>
    </div>`;
  }).join('');

  STATUS_ORDEM.forEach(aplicarPreviewCor);
}

function aplicarPreviewCor(s) {
  const cor = $('#cor-' + s).value;
  const rotulo = $('#rot-' + s).value || STATUS_PADRAO[s].rotulo;
  const ex = $('#ex-' + s);
  ex.querySelector('.dot').style.background = cor;
  ex.querySelector('span').textContent = rotulo;
  ex.style.color = cor;
  ex.style.borderColor = cor;
  document.documentElement.style.setProperty('--st-' + s.replace('_', '-'), cor);
}

$('#cores-grid').addEventListener('input', (e) => {
  const item = e.target.closest('.cor-item');
  if (!item) return;
  const s = item.dataset.status;

  if (e.target.classList.contains('cor-input')) {
    $('#hex-' + s).value = e.target.value;
  }
  if (e.target.classList.contains('cor-hex')) {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) $('#cor-' + s).value = v;
  }
  aplicarPreviewCor(s);
});

$('#btn-cores-padrao').addEventListener('click', () => {
  for (const s of STATUS_ORDEM) {
    $('#cor-' + s).value = STATUS_PADRAO[s].cor;
    $('#hex-' + s).value = STATUS_PADRAO[s].cor;
    $('#rot-' + s).value = STATUS_PADRAO[s].rotulo;
    aplicarPreviewCor(s);
  }
  toast('Cores padrão restauradas. Clique em Salvar para confirmar.');
});

/* ------------------------------------------------------------- Logo */

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

/* -------------------------------------------------------- Máscara nomes */

function atualizarLabelNomes() {
  const mostrar = $('#c-mostrar-nomes').checked;
  $('#c-mostrar-label').textContent = mostrar ? 'Mostrar nomes completos' : 'Ocultar nomes (mascarados)';
  const exemplo = st.pessoas[0]?.nome || 'João Silva';
  $('#c-exemplo').textContent = mascararNome(exemplo, mostrar);
}
$('#c-mostrar-nomes').addEventListener('change', atualizarLabelNomes);

/* ------------------------------------------------------------- Salvar */

$('#form-config').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    evento_nome:      $('#c-nome').value.trim() || 'Festa de Fim de Ano',
    evento_subtitulo: $('#c-subtitulo').value.trim(),
    meta_valor:       parseValor($('#c-meta').value),
    valor_por_pessoa: parseValor($('#c-por-pessoa').value),
    chave_pix:        $('#c-pix').value.trim(),
    mensagem:         $('#c-mensagem').value.trim(),
    logo_url:         logoEscolhido(),
    mostrar_nomes:    $('#c-mostrar-nomes').checked,
    atualizado_em:    new Date().toISOString()
  };

  for (const s of STATUS_ORDEM) {
    const f = CAMPOS_STATUS[s];
    payload[f.cor]    = $('#cor-' + s).value;
    payload[f.rotulo] = $('#rot-' + s).value.trim() || STATUS_PADRAO[s].rotulo;
  }

  const { error } = await db.from('config').update(payload).eq('id', 1);
  if (error) {
    console.error(error);
    return toast('Erro ao salvar: ' + error.message, 'err');
  }
  toast('Configurações salvas.', 'ok');
  carregarTudo();
});

/* =====================================================================
   DELEGAÇÃO DE CLIQUES
   ===================================================================== */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-acao]');
  if (!btn) return;
  const id = btn.dataset.id;
  switch (btn.dataset.acao) {
    case 'pagamentos': abrirPagamentos(id); break;
    case 'editar-p':   editarPessoa(id); break;
    case 'excluir-p':  excluirPessoa(id); break;
    case 'editar-u':   editarUtilizacao(id); break;
    case 'excluir-u':  excluirUtilizacao(id); break;
  }
});

/* =====================================================================
   MODAIS AUXILIARES
   ===================================================================== */

function confirmar(titulo, texto) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.style.zIndex = 200;
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
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(false); } };

    back.addEventListener('click', (ev) => {
      if (ev.target === back) return fechar(false);
      const b = ev.target.closest('[data-r]');
      if (b) fechar(b.dataset.r === '1');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('[data-r="1"]').focus();
  });
}

function pedirTexto(titulo, ajuda, placeholder) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.style.zIndex = 200;
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(titulo)}</h2>
        <p class="hint" style="margin-bottom:12px">${esc(ajuda)}</p>
        <textarea id="txt-lote" rows="8" placeholder="${esc(placeholder)}"></textarea>
        <div class="form-actions" style="justify-content:flex-end;margin-top:16px">
          <button class="btn btn-ghost" data-r="0">Cancelar</button>
          <button class="btn btn-primary" data-r="1">Cadastrar</button>
        </div>
      </div>`;

    const fechar = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(null); } };

    back.addEventListener('click', (ev) => {
      if (ev.target === back) return fechar(null);
      const b = ev.target.closest('[data-r]');
      if (b) fechar(b.dataset.r === '1' ? back.querySelector('#txt-lote').value : null);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('#txt-lote').focus();
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
