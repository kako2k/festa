const u = require('../js/utils.js');
let fails = 0;
function eq(desc, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log((ok ? '  ok  ' : ' FAIL ') + desc + '  →  ' + JSON.stringify(got) +
              (ok ? '' : '  (esperado: ' + JSON.stringify(want) + ')'));
}

console.log('\n— Máscara de nomes —');
eq('João Silva oculto',   u.mascararNome('João Silva', false), 'Joã* *****');
eq('João Silva visível',  u.mascararNome('João Silva', true),  'João Silva');
eq('Ana (3 letras)',      u.mascararNome('Ana', false),        'Ana');
eq('Zé (2 letras)',       u.mascararNome('Zé', false),         'Zé');
eq('Maria de Souza',      u.mascararNome('Maria de Souza', false), 'Mar** ** *****');
eq('vazio',               u.mascararNome('', false),           '');
eq('null',                u.mascararNome(null, false),         '');

console.log('\n— Moeda e data —');
eq('money 1234.5',  u.money(1234.5).replace(/ /g, ' '), 'R$ 1.234,50');
eq('money 0',       u.money(0).replace(/ /g, ' '),      'R$ 0,00');
eq('data BR',       u.dataBR('2026-12-24'),                  '24/12/2026');
eq('data vazia',    u.dataBR(null),                          '—');

console.log('\n— parseValor —');
eq('1.234,56',  u.parseValor('1.234,56'), 1234.56);
eq('1234.56',   u.parseValor('1234.56'),  1234.56);
eq('R$ 250,00', u.parseValor('R$ 250,00'), 250);
eq('3000',      u.parseValor('3000'),      3000);
eq('vazio',     u.parseValor(''),          0);
eq('lixo',      u.parseValor('abc'),       0);

console.log('\n— Percentuais —');
eq('50 de 200',      u.calcPct(50, 200),  25);
eq('divisão por 0',  u.calcPct(50, 0),    0);
eq('clamp acima',    u.clamp100(180),     100);
eq('clamp negativo', u.clamp100(-5),      0);

console.log('\n— Status (previsto = 3000) —');
eq('0 → não contribuiu',           u.statusDoValor(0, 3000),        'nao_doou');
eq('1 centavo → parcial',    u.statusDoValor(0.01, 3000),     'parcial');
eq('1500 → parcial',         u.statusDoValor(1500, 3000),     'parcial');
eq('2999,99 → parcial',      u.statusDoValor(2999.99, 3000),  'parcial');
eq('3000 → total',           u.statusDoValor(3000, 3000),     'total');
eq('3000,001 arred → total', u.statusDoValor(3000.001, 3000), 'total');
eq('3000,01 → especial',     u.statusDoValor(3000.01, 3000),  'especial');
eq('5000 → especial',        u.statusDoValor(5000, 3000),     'especial');
eq('sem previsto, pagou',    u.statusDoValor(100, 0),         'total');
eq('sem previsto, zerado',   u.statusDoValor(0, 0),           'nao_doou');

console.log('\n— Agrupamento pessoas + pagamentos —');
const pessoas = [
  { id: 1, nome: 'João Silva',     valor_previsto: null },
  { id: 2, nome: 'Maria de Souza', valor_previsto: null },
  { id: 3, nome: 'Carlos Lima',    valor_previsto: null },
  { id: 4, nome: 'Ana Paula',      valor_previsto: null },
  { id: 5, nome: 'Beto Especial',  valor_previsto: 1000 }   // valor próprio
];
const pagamentos = [
  { id: 10, pessoa_id: 1, data: '2026-09-01', valor: 3000, forma: 'pix' },
  { id: 11, pessoa_id: 2, data: '2026-09-02', valor: 1000, forma: 'dinheiro' },
  { id: 12, pessoa_id: 2, data: '2026-09-05', valor:  500, forma: 'pix' },
  { id: 13, pessoa_id: 3, data: '2026-09-03', valor: 4000, forma: 'pix' },
  { id: 14, pessoa_id: 5, data: '2026-09-04', valor: 1000, forma: 'pix' }
  // Ana Paula (4) não tem nenhum pagamento
];
const calc = u.montarPessoas(pessoas, pagamentos, 3000);
const byId = Object.fromEntries(calc.map(p => [p.id, p]));

eq('João pago',              byId[1].pago,      3000);
eq('João status',            byId[1].status,    'total');
eq('João restante',          byId[1].restante,  0);
eq('Maria soma 2 contribuições',   byId[2].pago,      1500);
eq('Maria status',           byId[2].status,    'parcial');
eq('Maria restante',         byId[2].restante,  1500);
eq('Carlos status',          byId[3].status,    'especial');
eq('Carlos excedente',       byId[3].excedente, 1000);
eq('Ana sem pagamento',      byId[4].pago,      0);
eq('Ana status',             byId[4].status,    'nao_doou');
eq('Ana previsto padrão',    byId[4].previsto,  3000);
eq('Beto usa valor próprio', byId[5].previsto,  1000);
eq('Beto status',            byId[5].status,    'total');
eq('Contribuições ordenadas (mais nova primeiro)', byId[2].pagamentos[0].data, '2026-09-05');

console.log('\n— Contagem de status —');
const cont = u.contarStatus(calc);
eq('não contribuiu', cont.nao_doou, 1);
eq('parcial',  cont.parcial,  1);
eq('total',    cont.total,    2);
eq('especial', cont.especial, 1);

console.log('\n— Resumo financeiro —');
const uso = [
  { titulo: 'Buffet',    valor: 3000, valor_pago:  500 },
  { titulo: 'Espaço',    valor: 1200, valor_pago: 1200 },
  { titulo: 'Decoração', valor:  500, valor_pago:    0 }
];
const r = u.calcularResumo(pagamentos, uso, 20000, calc);
eq('total arrecadado',   r.totalArrecadado,     9500);
eq('total previsto uso', r.totalPrevisto,       4700);
eq('total pago uso',     r.totalPago,           1700);
eq('a pagar',            r.aPagar,              3000);
eq('saldo',              r.saldo,               7800);
eq('% meta',             r.pctMeta.toFixed(2),  '47.50');
eq('falta p/ meta',      r.faltaMeta,           10500);
eq('por pix',            r.porPix,              8500);
eq('por dinheiro',       r.porDinheiro,         1000);
eq('qtd pessoas',        r.qtdPessoas,          5);
eq('contribuintes',      r.contribuintes,       4);
eq('esperado total',     r.esperadoTotal,       13000);  // 3000*4 + 1000
eq('falta das pessoas',  r.faltaPessoas,        4500);   // Maria 1500 + Ana 3000

const vazio = u.calcularResumo([], [], 0, []);
eq('vazio: pctMeta',       vazio.pctMeta,       0);
eq('vazio: pctUso',        vazio.pctUso,        0);
eq('vazio: saldo',         vazio.saldo,         0);
eq('vazio: contribuintes', vazio.contribuintes, 0);

console.log('\n— Cores e rótulos configuráveis —');
const cfg = { cor_nao_doou: '#ff0000', rotulo_parcial: 'Metade' };
eq('cor customizada',    u.coresStatus(cfg).nao_doou,   '#ff0000');
eq('cor padrão',         u.coresStatus(cfg).total,      '#34d399');
eq('rótulo customizado', u.rotulosStatus(cfg).parcial,  'Metade');
eq('rótulo padrão',      u.rotulosStatus(cfg).especial, 'Especial');
eq('config vazia',       u.coresStatus(null).especial,  '#60a5fa');

console.log(fails === 0 ? '\n✅ Todos os testes passaram.\n' : `\n❌ ${fails} teste(s) falharam.\n`);
process.exit(fails ? 1 : 0);
