# Arrecadação — Festa de Fim de Ano

Sistema de prestação de contas com **página pública** (só leitura) e **painel administrativo**
(login por usuário e senha). HTML/CSS/JS puro, banco no **Supabase**, hospedagem na **Vercel**.

---

## Estrutura

```
festa-fundos/
├── index.html              Página pública
├── admin.html              Painel administrativo
├── css/
│   ├── style.css           Tokens, componentes e base (compartilhado)
│   ├── public.css          Estilos da página pública
│   └── admin.css           Estilos do painel
├── js/
│   ├── supabase-config.js  ⚠️ ÚNICO ARQUIVO A EDITAR (URL + chave anon)
│   ├── utils.js            Formatação, máscara de nomes, cálculos
│   ├── public.js           Lógica da página pública
│   └── admin.js            Lógica do painel
├── img/
│   ├── logo.png            Logo do cabeçalho (troque por a sua)
│   ├── logo.svg            Versão vetorial do exemplo
│   └── favicon.svg
├── sql/
│   └── schema.sql          Banco completo — rode no SQL Editor do Supabase
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
| **Arrecadação** | Lança `Data · Nome · Valor · Forma (PIX/Dinheiro)`. Editar e excluir na própria tabela. O campo *Observação* é interno — não aparece na página pública. |
| **Utilização de fundos** | Cadastra `Título · Descrição · Valor previsto · Valor pago`. O *valor restante* e o *%* são calculados sozinhos. O campo *Ordem* define a sequência na página pública. |
| **Configurações** | Nome/subtítulo do evento, **pretensão de arrecadação** (meta), recado público, chave PIX, logo e a chave **mostrar/ocultar nomes**. |

### A chave de ocultar nomes

Quando desligada, a página pública mostra só as **3 primeiras letras** e troca o resto por `*`,
preservando os espaços:

| Nome real | Exibido |
|---|---|
| João Silva | `Joã* *****` |
| Maria de Souza | `Mar** ** *****` |
| Ana | `Ana` (3 letras ou menos ficam inteiras) |

O mascaramento é aplicado antes de qualquer busca na página pública, então o nome real
não vaza pelo campo de pesquisa. Ainda assim, os nomes completos trafegam do banco para o
navegador — se você quiser sigilo forte (e não apenas discrição), avise que eu troco isso
por uma *view* no banco que já entrega o nome mascarado.

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
(`1.234,56`), percentuais com divisão por zero e o resumo financeiro completo.

---

## Ajustes rápidos

| Quero… | Onde mexer |
|---|---|
| Mudar as cores | `css/style.css`, bloco `:root` (`--accent` é o dourado) |
| Mudar o intervalo de atualização automática da página pública | fim de `js/public.js` (`setInterval(carregar, 60000)`) |
| Adicionar outra forma de pagamento | `check (forma in (...))` em `sql/schema.sql` + `<select id="a-forma">` em `admin.html` |
| Mudar quantas letras ficam visíveis | função `mascararNome` em `js/utils.js` (`visiveis < 3`) |
"# festa" 
"# festa" 
