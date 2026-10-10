# Arrecadação — Festa de Fim de Ano

Sistema de prestação de contas com **página pública** (só leitura) e **painel administrativo**
(login por usuário e senha). HTML/CSS/JS puro, banco no **Supabase**, hospedagem na **Vercel**.

---

## Estrutura

```
festa-fundos/
├── index.html              Página pública
├── admin.html              Painel administrativo
├── resumo.html             Cartão de resumo para postar no WhatsApp
├── css/
│   ├── style.css           Tokens, componentes e base (compartilhado)
│   ├── public.css          Estilos da página pública
│   ├── resumo.css          Estilos do cartão de resumo
│   └── admin.css           Estilos do painel
├── js/
│   ├── supabase-config.js  ⚠️ ÚNICO ARQUIVO A EDITAR (URL + chave anon)
│   ├── utils.js            Formatação, máscara de nomes, cálculos
│   ├── public.js           Lógica da página pública
│   ├── resumo.js           Lógica do cartão de resumo
│   └── admin.js            Lógica do painel
├── img/
│   ├── logo.png            Logo do cabeçalho (troque por a sua)
│   ├── logo.svg            Versão vetorial do exemplo
│   └── favicon.svg
├── sql/
│   ├── schema.sql          Banco completo — instalação NOVA
│   └── migracao-pessoas.sql Atualiza um banco que já existe
├── tests/
│   └── utils.test.js       Testes dos cálculos (node tests/utils.test.js)
├── vercel.json
└── robots.txt
```

---

## Passo a passo

### 1. Criar o banco no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project** (região: São Paulo).
2. Abra **SQL Editor** → **New query**.
3. Cole **todo o conteúdo de `sql/schema.sql`** e clique em **Run**.
   *(Se você já tinha rodado a versão anterior e tem dados, rode
   `sql/migracao-pessoas.sql` no lugar — ele cria as tabelas novas e
   transfere os lançamentos antigos sem apagar nada.)*
4. **Troque a senha do admin.** No fim do arquivo existe a linha:

   ```sql
   select public.set_admin('admin', 'troque-esta-senha', 'Administrador');
   ```

   Rode de novo com a senha real, por exemplo:

   ```sql
   select public.set_admin('glauco', 'minha-senha-forte', 'Glauco');
   ```

   Para adicionar outros administradores, é só rodar mais uma vez com outro usuário.
   Rodar com um usuário que já existe **troca a senha dele**.

### 2. Conectar o front-end

Em **Settings → API** copie:

| Campo do Supabase              | Vai em `js/supabase-config.js` |
|--------------------------------|--------------------------------|
| Project URL                    | `SUPABASE_URL`                 |
| Project API keys → `anon public` | `SUPABASE_ANON_KEY`          |

> Nunca coloque a chave `service_role` no front-end.

### 3. Colocar o seu logo

Substitua `img/logo.png` pelo arquivo do evento (PNG ou SVG com fundo transparente,
largura ~600px). Se quiser manter **várias opções** para escolher no painel, jogue os
arquivos em `img/` e acrescente o nome na lista no topo de `js/admin.js`:

```js
const LOGOS_DISPONIVEIS = [
  { valor: 'img/logo.png',       rotulo: 'logo.png' },
  { valor: 'img/logo-natal.png', rotulo: 'Natal' },   // ← novo
  { valor: '',                   rotulo: '— sem logo —' }
];
```

Também dá para colar uma URL completa no campo abaixo do seletor, sem mexer no código.

### 4. Publicar na Vercel

**Opção A — pelo site (mais simples)**

1. Suba a pasta para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório.
3. Framework Preset: **Other**. Build Command: vazio. Output Directory: vazio.
4. **Deploy**.

**Opção B — pelo terminal**

```bash
npm i -g vercel
cd festa-fundos
vercel          # preview
vercel --prod   # produção
```

Endereços finais:

- Página pública: `https://seu-projeto.vercel.app/`
- Painel: `https://seu-projeto.vercel.app/admin` (ou `/admin.html`)

### 5. Testar localmente antes

```bash
cd festa-fundos
python3 -m http.server 8080
# abra http://localhost:8080
```

Abrir os arquivos com duplo clique (`file://`) não funciona bem — use um servidor local.

---

## Como usar o painel

| Aba | O que faz |
|---|---|
| **Contribuintes** | Cadastra as pessoas e registra as contribuições de cada uma. |
| **Utilização de fundos** | Cadastra `Título · Descrição · Valor previsto · Valor pago`. O *valor restante* e o *%* são calculados sozinhos. O campo *Ordem* define a sequência na página pública. |
| **Configurações** | Nome do evento, meta geral, **valor esperado por pessoa**, recado, chave PIX, **cores e nomes dos status**, logo e a chave mostrar/ocultar nomes. |

### O fluxo dos contribuintes

1. **Cadastre todo mundo de uma vez.** Use o botão *Cadastrar vários de uma vez*
   e cole a lista de nomes, um por linha. Todos entram com **R$ 0,00** e ficam
   vermelhos na página pública.
2. **Quando alguém pagar**, clique em **Contribuições** na linha dessa pessoa e registre
   a data, o valor e a forma. O total e a cor se atualizam na hora.
3. Se a pessoa pagar **em parcelas**, é só registrar uma contribuição por parcela — elas
   somam e a cor acompanha. O botão *Lançar o valor que falta* já preenche o
   restante para você.
4. Na página pública, o **ícone de olho** no cartão da pessoa abre a lista de
   datas e valores de cada contribuição dela.

### As quatro cores

O status sai da comparação entre o que a pessoa já contribuiu e o **valor esperado por
pessoa** (padrão R$ 3.000,00):

| Cor padrão | Status | Quando |
|---|---|---|
| 🔴 Vermelho | Não contribuiu | ainda não pagou nada |
| 🟡 Amarelo | Parcial | pagou parte do valor |
| 🟢 Verde | Completo | pagou o valor esperado |
| 🔵 Azul | Especial | pagou acima do valor esperado |

As quatro cores e os quatro nomes são editáveis em **Configurações → Cores e nomes
dos status**. A pré-visualização muda enquanto você escolhe; clique em *Salvar
configurações* para valer na página pública.

**Exceções individuais:** se alguém combinou um valor diferente (metade, o dobro),
preencha o campo *Valor previsto* no cadastro daquela pessoa. Deixando vazio, ela
usa o valor padrão das configurações.

## Resumo para o WhatsApp

Abra `/resumo.html` (ou clique em **Resumo** na barra do painel). A página monta um
cartão no formato de tela de celular, pronto para mandar no grupo.

**Três vistas**, no seletor do topo:

| Vista | O que mostra |
|---|---|
| **Financeiro** | Total arrecadado com barra da meta, já pago, saldo, a pagar, contagem por status e a lista de para onde o dinheiro vai |
| **Ranking** | Todo mundo ordenado por quem mais contribuiu, com a cor do status |
| **Os dois** | Financeiro + ranking no mesmo cartão |

**Duas chaves**, que valem só para a imagem e não mexem no banco:

- *Mostrar nomes* — começa como está configurado na página pública, mas você pode
  ligar para o grupo (onde todo mundo se conhece) sem desligar a máscara do site.
- *Incluir quem não contribuiu* — some com as linhas zeradas quando você quer um
  cartão mais curto, ou só de bom humor.

**Baixar imagem** gera um PNG em 3× (mais nítido que um print) e **Copiar imagem**
joga direto na área de transferência, para colar no WhatsApp sem passar por arquivo.
A cópia só funciona em navegador que suporta — se falhar, o aviso aparece e você usa
o download.

O ranking se adapta sozinho: até 14 pessoas vai em uma coluna com o nome inteiro;
acima disso passa para duas colunas e usa só o primeiro nome, acrescentando a inicial
do sobrenome quando dois têm o mesmo primeiro nome.

> `resumo.html` mostra os mesmos dados que já são públicos, então pode ser
> compartilhado à vontade. Ele não está linkado no rodapé do site — se quiser deixar
> à mão para todo mundo, acrescente `<a href="resumo.html">Resumo</a>` no rodapé
> do `index.html`.

---

## Segurança — o que está e o que não está protegido

Como você pediu algo simples para um grupo fechado de amigos, o modelo é:

- ✅ A senha do admin **nunca sai do banco**. O login é validado pela função
  `admin_login()` com hash bcrypt; o front só recebe "confere" ou "não confere".
- ✅ A tabela `admins` tem RLS sem nenhuma policy — ninguém consegue lê-la pelo API.
- ✅ A sessão do painel expira em 8 horas e vive só no `sessionStorage` (fecha a aba, sai).
- ⚠️ As policies de **escrita** nas tabelas de dados aceitam a chave `anon`. Ou seja: alguém
  que descubra a URL do projeto e a chave anon (ambas visíveis no código do site) conseguiria
  gravar dados sem passar pelo login. Para um bolão entre amigos isso normalmente não é
  problema; se um dia incomodar, o caminho é migrar o login para o **Supabase Auth** e trocar
  as policies de escrita por `using (auth.role() = 'authenticated')`. Me chame que eu faço.

O `admin.html` já vai com `noindex` e está bloqueado no `robots.txt`.

---

## Testes

```bash
node tests/utils.test.js
```

Cobre máscara de nomes, formatação de moeda e data, conversão de valores digitados
(`1.234,56`), percentuais com divisão por zero, o cálculo dos quatro status
(incluindo os limites de 1 centavo), o agrupamento de pessoas com várias contribuições,
valores previstos individuais e o resumo financeiro completo.

---

## Ajustes rápidos

| Quero… | Onde mexer |
|---|---|
| Mudar as cores | `css/style.css`, bloco `:root` (`--accent` é o dourado) |
| Mudar o intervalo de atualização automática da página pública | fim de `js/public.js` (`setInterval(carregar, 60000)`) |
| Adicionar outra forma de pagamento | `check (forma in (...))` em `sql/schema.sql` + o `<select>` de forma em `js/admin.js` |
| Mudar o valor esperado por pessoa | Configurações no painel (ou `valor_por_pessoa` na tabela `config`) |
| Mudar as cores dos status | Configurações no painel — não precisa mexer em código |
| Mudar quantas letras ficam visíveis | função `mascararNome` em `js/utils.js` (`visiveis < 3`) |
