const u = require('../js/utils.js');
let fails = 0;
function eq(desc, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log((ok ? '  ok  ' : ' FAIL ') + desc + '  →  ' + JSON.stringify(got) + (ok ? '' : '  (esperado: ' + JSON.stringify(want) + ')'));
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
eq('money 1234.5',  u.money(1234.5).replace(/ /g,' '), 'R$ 1.234,50');
eq('money 0',       u.money(0).replace(/ /g,' '),      'R$ 0,00');
eq('data BR',       u.dataBR('2026-12-24'),                 '24/12/2026');
eq('data vazia',    u.dataBR(null),                         '—');

console.log('\n— parseValor —');
eq('1.234,56',  u.parseValor('1.234,56'), 1234.56);
eq('1234.56',   u.parseValor('1234.56'),  1234.56);
eq('R$ 250,00', u.parseValor('R$ 250,00'), 250);
eq('vazio',     u.parseValor(''),          0);
eq('lixo',      u.parseValor('abc'),       0);

console.log('\n— Percentuais —');
eq('50 de 200',      u.calcPct(50, 200),  25);
eq('divisão por 0',  u.calcPct(50, 0),    0);
eq('clamp acima',    u.clamp100(180),     100);
eq('clamp negativo', u.clamp100(-5),      0);

console.log('\n— Resumo financeiro —');
const arr = [
  { data:'2026-09-01', nome:'João Silva',  valor:250, forma:'pix' },
  { data:'2026-09-02', nome:'Maria Souza', valor:300, forma:'dinheiro' },
  { data:'2026-09-03', nome:'João Silva',  valor:150, forma:'pix' },
];
const uso = [
  { titulo:'Buffet',    valor:3000, valor_pago:500 },
  { titulo:'Espaço',    valor:1200, valor_pago:1200 },
  { titulo:'Decoração', valor:500,  valor_pago:0 },
];
const r = u.calcularResumo(arr, uso, 5000);
eq('total arrecadado', r.totalArrecadado, 700);
eq('total previsto',   r.totalPrevisto,   4700);
eq('total pago',       r.totalPago,       1700);
eq('a pagar',          r.aPagar,          3000);
eq('saldo (negativo)', r.saldo,           -1000);
eq('% meta',           r.pctMeta.toFixed(2), '14.00');
eq('falta p/ meta',    r.faltaMeta,       4300);
eq('% uso',            r.pctUso.toFixed(2), '36.17');
eq('por pix',          r.porPix,          400);
eq('por dinheiro',     r.porDinheiro,     300);
eq('contribuintes únicos', r.contribuintes, 2);

const vazio = u.calcularResumo([], [], 0);
eq('vazio: pctMeta',  vazio.pctMeta, 0);
eq('vazio: pctUso',   vazio.pctUso,  0);
eq('vazio: saldo',    vazio.saldo,   0);

console.log(fails === 0 ? '\n✅ Todos os testes passaram.\n' : `\n❌ ${fails} teste(s) falharam.\n`);
process.exit(fails ? 1 : 0);
