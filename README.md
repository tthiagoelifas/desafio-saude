# 🌿 Desafio Saúde

App de desafio de saúde em grupo com ranking, registro de atividades diárias e painel administrativo. Frontend em HTML/JS puro, backend via Google Apps Script, banco de dados no Google Sheets.

**Stack:** HTML · CSS · JavaScript (Vanilla) · Google Apps Script · Google Sheets

---

## Funcionalidades

### Participante
- Cadastro com nome e senha (senha armazenada como hash SHA-256)
- Login persistente via token em localStorage
- Registro diário de atividades: cardio, atividade física e desafio alimentar
- Desmarcação de atividades registradas por engano
- Ranking do grupo em tempo real
- Perfil individual com pontos totais, dias ativos, posição no ranking e histórico dos últimos 14 dias
- Bônus automático de +3 pontos por semana completa (5 dias com pelo menos 1 atividade)
- Exclusão de conta

### Admin
- Acesso por senha separada
- Dashboard com totais: participantes, atividades, ativos hoje e na semana
- Top 10 por categoria: geral, cardio, academia e alimentação
- Presença semanal de todos os participantes

---

## Estrutura do projeto

```
desafio-saude/
├── index.html        # App completo (frontend)
├── apps-script.js    # Código do backend (Google Apps Script)
└── README.md
```

> Renomeie `desafio-saude.html` para `index.html` antes de subir no GitHub.

---

## Configuração

### 1. Google Sheets

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma planilha em branco
2. O Apps Script criará as abas automaticamente na primeira execução:
   - **Usuarios** — nome, hash da senha, data de cadastro
   - **Atividades** — timestamp, nome, atividade, data

### 2. Google Apps Script

1. Na planilha, vá em **Extensões → Apps Script**
2. Apague o código padrão e cole o conteúdo de `apps-script.js`
3. Clique em **Implantar → Novo implante**
4. Configure:
   - Tipo: **App da Web**
   - Executar como: **Eu (sua conta)**
   - Quem tem acesso: **Qualquer pessoa**
5. Clique em **Implantar** e autorize as permissões
6. Copie a URL gerada (formato: `https://script.google.com/macros/s/.../exec`)

> Toda vez que editar o código do Apps Script, clique em **Implantar → Gerenciar implantações → editar (ícone de lápis) → Nova versão** para que as mudanças entrem em vigor.

### 3. Configuração no HTML

Abra o `index.html` e edite o bloco de configuração no topo do `<script>`:

```javascript
const SCRIPT_URL     = 'COLE_SUA_URL_AQUI';   // URL do Apps Script
const ADMIN_PASS     = 'saude2025';            // Senha do painel admin
const FOOD_CHALLENGE = 'Reduzir os excessos — evite ultraprocessados, açúcar e álcool esta semana 🌱';
```

---

## Deploy no GitHub Pages

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/desafio-saude.git
git push -u origin main
```

Depois, no repositório do GitHub:

1. Vá em **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main / (root)**
4. Clique em **Save**

O app ficará disponível em:
```
https://SEU_USUARIO.github.io/desafio-saude
```

---

## Arquitetura

```
Browser (index.html)
    │
    ├── GET  ?action=ranking          → ranking público
    ├── GET  ?action=today            → atividades do usuário hoje (auth)
    ├── GET  ?action=weekpresence     → presença semanal (auth)
    ├── GET  ?action=profile          → perfil individual (auth)
    ├── GET  ?action=admin            → dashboard admin
    │
    ├── POST action=register          → cria usuário
    ├── POST action=login             → valida credenciais
    ├── POST action=activity          → salva/remove atividade (auth)
    └── POST action=deleteUser        → exclui conta (auth)
         │
    Google Apps Script (Web App)
         │
    Google Sheets
         ├── Aba "Usuarios"     → Nome | SenhaHash | DataCadastro
         └── Aba "Atividades"   → Timestamp | Nome | Atividade | Data
```

---

## Sistema de pontuação

| Atividade | Pontos |
|---|---|
| Cardio (mínimo 1km) | 1 pt |
| Atividade física | 1 pt |
| Desafio alimentar cumprido | 1 pt |
| Bônus: semana completa (5 dias ativos) | +3 pts |

O bônus de semana completa é calculado automaticamente no backend: toda semana ISO em que o participante tiver pelo menos 1 atividade registrada em 5 dias distintos recebe +3 pontos extras.

---

## Segurança

- Senhas nunca são armazenadas em texto puro — apenas o hash SHA-256 é enviado ao servidor e salvo no Sheets
- O hash é gerado no navegador via Web Crypto API (`crypto.subtle.digest`) antes de qualquer requisição
- O token de sessão em localStorage é derivado de `sha256(nome + hashDaSenha)`, nunca da senha original
- Todas as rotas autenticadas validam o token no servidor antes de retornar ou gravar dados
- O painel admin é protegido por senha separada, configurada diretamente no HTML

> Este é um projeto pessoal/grupo pequeno. Para uso em produção com dados sensíveis, considere adicionar HTTPS obrigatório, rate limiting e tokens com expiração.

---

## Personalização

### Trocar o desafio alimentar da semana
Edite a constante `FOOD_CHALLENGE` no `index.html`:
```javascript
const FOOD_CHALLENGE = 'Seu novo desafio aqui 🌱';
```

### Trocar a senha admin
Edite `ADMIN_PASS` no `index.html`:
```javascript
const ADMIN_PASS = 'sua-nova-senha';
```

### Adicionar novas categorias de atividade
1. No `index.html`, adicione um novo `.act-card` na grade e um case no objeto `msgs` da função `toggleActivity`
2. No `apps-script.js`, o sistema já agrupa qualquer string de atividade automaticamente — basta adicionar a nova categoria ao `buildScores` e aos rankings do `getAdminDashboard` se quiser ranking separado

---

## Desenvolvimento local

Por restrições de CORS, o app precisa ser servido via HTTP para se comunicar com o Apps Script. Use qualquer servidor local:

```bash
# Python
python3 -m http.server 8080

# Node (com npx)
npx serve .
```

Depois acesse `http://localhost:8080`.

---

## Licença

MIT — use, modifique e compartilhe à vontade.# desafio-saude
# desafio-saude
