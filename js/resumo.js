/* =====================================================================
   resumo.js — monta o cartão de resumo para postar no WhatsApp
   ===================================================================== */

const vis = {
  config: {},
  pessoas: [],
  pagamentos: [],
  utilizacao: [],
  vista: 'financeiro',     // financeiro | ranking | completo
  mostrarNomes: true,
  incluirZerados: true
};

/* ------------------------------------------------------------ Carregar */

async function carregar() {
  try {
    const [cfg, pes, pag, uso] = await Promise.all([
      db.from('config').select('*').eq('id', 1).maybeSingle(),
      db.from('pessoas').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true }),
      db.from('pagamentos').select('*').order('data', { ascending: false }).order('id', { ascending: false }),
      db.from('utilizacao').select('*').order('ordem', { ascending: true }).order('id', { ascending: true })
    ]);
    for (const r of [cfg, pes, pag, uso]) if (r.error) throw r.error;

    vis.config     = cfg.data || {};
    vis.pagamentos = pag.data || [];
    vis.utilizacao = uso.data || [];
    vis.pessoas    = montarPessoas(pes.data || [], vis.pagamentos, vis.config.valor_por_pessoa);

    // respeita a configuração da página pública como ponto de partida
    vis.mostrarNomes = vis.config.mostrar_nomes !== false;
    $('#sw-nomes').checked = vis.mostrarNomes;

    render();
  } catch (err) {
    console.error(err);
    $('#card').innerHTML =
      `<div class="empty">Não foi possível carregar os dados.<br>
       <span class="faint">${esc(err.message || 'erro desconhecido')}</span></div>`;
  }
}

/* --------------------------------------------------------------- Pedaços */

function resumo() {
  return calcularResumo(vis.pagamentos, vis.utilizacao, vis.config.meta_valor, vis.pessoas);
}

function cabecalho() {
  const c = vis.config;
  const logo = c.logo_url || 'img/logo.png';
  const agora = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  return `
    <div class="p-head">
      <img class="p-logo" src="${esc(logo)}" alt="" onerror="this.style.display='none'">
      <div class="p-tit">
        <h1>${esc(c.evento_nome || 'Festa de Fim de Ano')}</h1>
        <p class="p-sub">Prestação de contas · ${esc(agora)}</p>
      </div>
    </div>`;
}

function blocoFinanceiro() {
  const r = resumo();
  const temMeta = r.metaValor > 0;
  const base = temMeta ? r.metaValor : r.esperadoTotal;
  const p = clamp100(calcPct(r.totalArrecadado, base));

  return `
    <div class="p-hero">
      <div class="p-hero-rot">Total arrecadado</div>
      <div class="p-hero-valor">${money(r.totalArrecadado)}</div>
      ${base > 0 ? `
        <div class="p-hero-de">de <b>${money(base)}</b> ${temMeta ? 'pretendidos' : 'esperados'}</div>
        <div class="p-bar"><i style="width:${p.toFixed(1)}%"></i></div>
        <div class="p-bar-leg">
          <span>Atingido: <b>${pct(p)}</b></span>
          <span>Faltam: <b>${money(Math.max(base - r.totalArrecadado, 0))}</b></span>
        </div>` : ''}
    </div>

    <div class="p-grid">
      <div class="p-box">
        <div class="r">Já pago</div>
        <div class="v" style="color:#f0b429">${money(r.totalPago)}</div>
      </div>
      <div class="p-box">
        <div class="r">Saldo em caixa</div>
        <div class="v" style="color:${r.saldo < 0 ? '#f87171' : '#34d399'}">${money(r.saldo)}</div>
      </div>
      <div class="p-box">
        <div class="r">Ainda a pagar</div>
        <div class="v">${money(r.aPagar)}</div>
      </div>
      <div class="p-box">
        <div class="r">Contribuíram</div>
        <div class="v">${r.contribuintes}<span style="color:#6b7688;font-size:.8rem"> / ${r.qtdPessoas}</span></div>
      </div>
    </div>`;
}

function blocoChips() {
  const r = resumo();
  const cores = coresStatus(vis.config);
  const rot = rotulosStatus(vis.config);
  const itens = STATUS_ORDEM.filter(s => r.statusContagem[s] > 0);
  if (!itens.length) return '';

  return `<div class="p-chips">${itens.map(s => `
    <span class="p-chip" style="color:${esc(cores[s])}">
      <i></i>${esc(rot[s])} <b>${r.statusContagem[s]}</b>
    </span>`).join('')}</div>`;
}

function blocoGastos() {
  if (!vis.utilizacao.length) return '';
  const r = resumo();
  const lista = vis.utilizacao.slice(0, 6);
  const sobra = vis.utilizacao.length - lista.length;

  return `
    <div class="p-divisor"></div>
    <div class="p-sec-tit">
      Para onde vai o dinheiro
      <span>${money(r.totalPago)} de ${money(r.totalPrevisto)}</span>
    </div>
    <div class="p-gastos">
      ${lista.map(i => {
        const valor    = Number(i.valor || 0);
        const pago     = Number(i.valor_pago || 0);
        const restante = Number(i.valor_restante ?? Math.max(valor - pago, 0));
        const quitado  = valor > 0 && restante <= 0;
        const cor = quitado ? '#34d399' : (pago > 0 ? '#f0b429' : '#6b7688');
        return `
          <div class="p-gasto">
            <span class="g-nome">${esc(i.titulo)}</span>
            <span class="g-val">${money(valor)}</span>
            <span class="g-tag" style="color:${cor}">${
              quitado ? 'pago' : (pago > 0 ? pct(calcPct(pago, valor), 0) : 'pendente')
            }</span>
          </div>`;
      }).join('')}
      ${sobra > 0 ? `<div class="p-gasto"><span class="g-nome">+ ${plural(sobra, 'outro item', 'outros itens')}</span></div>` : ''}
    </div>`;
}

/**
 * Em duas colunas não cabe o nome inteiro. Usa só o primeiro nome e,
 * quando duas pessoas têm o mesmo primeiro nome, acrescenta a inicial
 * do sobrenome: "Carlos" vira "Carlos L." apenas se houver outro Carlos.
 */
function nomesCurtos(lista) {
  const primeiro = n => String(n || '').trim().split(/\s+/)[0] || '';
  const contagem = {};
  for (const p of lista) {
    const k = primeiro(p.nome).toLowerCase();
    contagem[k] = (contagem[k] || 0) + 1;
  }
  const mapa = new Map();
  for (const p of lista) {
    const partes = String(p.nome || '').trim().split(/\s+/);
    const pri = partes[0] || '';
    const repetido = contagem[pri.toLowerCase()] > 1;
    const sobrenome = partes.length > 1 ? partes[partes.length - 1] : '';
    mapa.set(p.id, repetido && sobrenome ? `${pri} ${sobrenome[0]}.` : pri);
  }
  return mapa;
}

function blocoRanking(comDivisor) {
  const cores = coresStatus(vis.config);

  let lista = vis.pessoas.slice().sort((a, b) =>
    b.pago - a.pago || a.nome.localeCompare(b.nome, 'pt-BR')
  );
  const zerados = lista.filter(p => p.pago <= 0).length;
  if (!vis.incluirZerados) lista = lista.filter(p => p.pago > 0);

  if (!lista.length) {
    return `${comDivisor ? '<div class="p-divisor"></div>' : ''}
      <div class="empty" style="padding:16px">Ninguém cadastrado ainda.</div>`;
  }

  // Muita gente: duas colunas e linhas mais justas
  const duas     = lista.length > 14;
  const compacto = lista.length > 10;

  // Em duas colunas o nome inteiro não cabe — encurta (só quando não está mascarado)
  const curtos = (duas && vis.mostrarNomes) ? nomesCurtos(lista) : null;

  const linhas = lista.map((p, i) => {
    const cor = cores[p.status];
    const pc  = p.previsto > 0 ? Math.round(calcPct(p.pago, p.previsto)) : 0;
    const nome = curtos ? curtos.get(p.id) : mascararNome(p.nome, vis.mostrarNomes);
    return `
      <div class="p-linha" style="border-left-color:${esc(cor)}">
        <span class="p-pos">${i + 1}</span>
        <span class="p-nome">${esc(nome)}</span>
        <span class="p-val" style="color:${esc(cor)}">${money(p.pago)}</span>
        ${compacto ? '' : `<span class="p-pc">${pc}%</span>`}
      </div>`;
  }).join('');

  const total = lista.reduce((s, p) => s + p.pago, 0);

  return `
    ${comDivisor ? '<div class="p-divisor"></div>' : ''}
    <div class="p-sec-tit">
      Quem já contribuiu
      <span>${plural(lista.length, 'pessoa', 'pessoas')} · ${money(total)}</span>
    </div>
    <div class="p-rank ${duas ? 'duas' : ''} ${compacto ? 'compacto' : ''}">${linhas}</div>
    ${(!vis.incluirZerados && zerados > 0)
      ? `<div class="faint" style="margin-top:8px;font-size:.7rem">
           ${plural(zerados, 'pessoa ainda não contribuiu', 'pessoas ainda não contribuíram')}
         </div>` : ''}`;
}

function rodape() {
  const r = resumo();
  let site = '';
  try {
    site = location.protocol.startsWith('http')
      ? location.host + location.pathname.replace(/resumo\.html$/, '')
      : '';
  } catch { site = ''; }

  return `
    <div class="p-foot">
      <span>${r.contribuintes} de ${plural(r.qtdPessoas, 'pessoa', 'pessoas')} · faltam ${money(r.faltaPessoas)}</span>
      ${site ? `<span class="p-site">${esc(site.replace(/\/$/, ''))}</span>` : ''}
    </div>`;
}

/* --------------------------------------------------------------- Render */

function render() {
  aplicarCoresStatus(vis.config);

  let corpo = '';
  if (vis.vista === 'financeiro') {
    corpo = blocoFinanceiro() + blocoChips() + blocoGastos();
  } else if (vis.vista === 'ranking') {
    corpo = blocoChips() + blocoRanking(false);
  } else {
    corpo = blocoFinanceiro() + blocoChips() + blocoRanking(true);
  }

  $('#card').innerHTML = cabecalho() + corpo + rodape();
}

/* --------------------------------------------------------------- Imagem */

async function gerarCanvas(semLogo = false) {
  const card = $('#card');
  const logo = card.querySelector('.p-logo');
  if (semLogo && logo) logo.style.visibility = 'hidden';
  try {
    return await html2canvas(card, {
      backgroundColor: '#0f1117',
      scale: 3,                  // 3x = imagem nítida no WhatsApp
      useCORS: true,
      logging: false,
      windowWidth: card.scrollWidth,
      windowHeight: card.scrollHeight
    });
  } finally {
    if (semLogo && logo) logo.style.visibility = '';
  }
}

/**
 * Devolve o canvas já pronto para exportar. Se o logo vier de outro
 * domínio sem permissão de CORS, o navegador "contamina" o canvas e
 * bloqueia a exportação — nesse caso refaz a imagem sem o logo em vez
 * de falhar na cara do usuário.
 */
async function canvasExportavel() {
  let canvas = await gerarCanvas();
  try {
    canvas.toDataURL('image/png');          // só para testar se exporta
    return { canvas, semLogo: false };
  } catch {
    canvas = await gerarCanvas(true);
    return { canvas, semLogo: true };
  }
}

function nomeArquivo() {
  const base = (vis.config.evento_nome || 'arrecadacao')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base}-${vis.vista}-${hojeISO()}.png`;
}

$('#btn-baixar').addEventListener('click', async () => {
  const btn = $('#btn-baixar');
  const txt = $('#btn-baixar-txt');
  btn.disabled = true;
  txt.textContent = 'Gerando…';
  try {
    const { canvas, semLogo } = await canvasExportavel();
    const a = document.createElement('a');
    a.download = nomeArquivo();
    a.href = canvas.toDataURL('image/png');
    a.click();
    txt.textContent = 'Pronto!';
    if (semLogo) toast('Imagem gerada sem o logo: o arquivo está hospedado fora do site.', 'err');
  } catch (err) {
    console.error(err);
    toast('Não consegui gerar a imagem. Tire um print da tela.', 'err');
    txt.textContent = 'Baixar imagem';
  } finally {
    btn.disabled = false;
    setTimeout(() => { txt.textContent = 'Baixar imagem'; }, 2200);
  }
});

$('#btn-copiar').addEventListener('click', async () => {
  const btn = $('#btn-copiar');
  btn.disabled = true;
  const antes = btn.textContent;
  btn.textContent = 'Gerando…';
  try {
    const { canvas, semLogo } = await canvasExportavel();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (semLogo) toast('Imagem copiada sem o logo: o arquivo está hospedado fora do site.', 'err');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Imagem copiada — é só colar no WhatsApp.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Este navegador não deixa copiar imagem. Use "Baixar imagem".', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = antes;
  }
});

/* -------------------------------------------------------------- Controles */

$('#seletor').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-vista]');
  if (!b) return;
  $$('#seletor button').forEach(x => x.classList.toggle('ativo', x === b));
  vis.vista = b.dataset.vista;
  render();
});

$('#sw-nomes').addEventListener('change', (e) => {
  vis.mostrarNomes = e.target.checked;
  render();
});

$('#sw-zerados').addEventListener('change', (e) => {
  vis.incluirZerados = e.target.checked;
  render();
});

carregar();
