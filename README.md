# 🌿 Desafio Saúde

App de desafio de saúde em grupo, 100% no navegador via GitHub Pages. Participantes se cadastram, fazem login e registram atividades diárias. Os dados ficam salvos no Google Sheets via Google Apps Script.

**Stack:** HTML · CSS · JavaScript (Vanilla) · Google Apps Script · Google Sheets

---

## O que o site faz

### Para os participantes
- **Cadastro e login** com nome e senha — a senha nunca trafega em texto puro (SHA-256 no navegador antes de enviar)
- **Registro diário** de três atividades com toggle (marca/desmarca):
  - 🏃 Cardio (mínimo 1km)
  - 🏋️ Atividade física (academia/treino)
  - 🥗 Desafio alimentar da semana
- **Ranking** do grupo em tempo real com medalhas 🥇🥈🥉
- **Perfil individual** com pontos totais, dias ativos, posição no ranking e histórico completo
- **Bônus automático** de +3 pontos por semana completa (5 dias com pelo menos 1 atividade)
- **Troca de senha** e exclusão de conta

### Para o admin
- Login por senha separada (verificada no servidor — não fica exposta no HTML)
- Dashboard com totais: participantes, atividades, ativos hoje e na semana
- Top 10 por categoria: geral, cardio, academia e alimentação
- Presença semanal de todos os participantes
- **Desafio alimentar** configurável direto na planilha (sem editar código)

---

## O que você precisa fazer agora para colocar no ar

### Passo 1 — Google Apps Script

1. Abra sua planilha no [Google Sheets](https://sheets.google.com)
2. Vá em **Extensões → Apps Script**
3. Apague o código padrão e cole **todo o conteúdo** do arquivo `apps-script.js`
4. **Mude a senha admin** na linha 11:
   ```js
   const ADMIN_PASS = 'sua-senha-forte-aqui';
   ```
5. Clique em **Implantar → Novo implante**
6. Configure:
   - Tipo: **App da Web**
   - Executar como: **Eu (sua conta)**
   - Quem tem acesso: **Qualquer pessoa**
7. Clique em **Implantar**, autorize as permissões e **copie a URL** gerada

> A URL tem o formato `https://script.google.com/macros/s/.../exec`

### Passo 2 — Atualizar a URL no HTML (se mudou)

Se você criou um deployment novo com URL diferente da atual, abra o `index.html` e atualize a linha 344:

```js
const SCRIPT_URL = 'COLE_SUA_URL_AQUI';
```

Se a URL já é a mesma do deployment anterior, **pule este passo**.

### Passo 3 — Publicar no GitHub Pages

```bash
git add .
git commit -m "deploy v3"
git push
```

Se o GitHub Pages ainda não estiver ativado:
1. Vá em **Settings → Pages** no repositório
2. Source: **Deploy from a branch**
3. Branch: **main / (root)**
4. Clique em **Save**

O site ficará disponível em:
```
https://SEU_USUARIO.github.io/desafio-saude
```

### Passo 4 — Configurar o desafio alimentar da semana

Na primeira vez que alguém acessar o site após o novo deploy, a aba **Config** será criada automaticamente na planilha. Para trocar o desafio toda semana, edite a célula da linha `desafio_alimentar` direto no Sheets — sem mexer em código.

| Chave | Valor |
|---|---|
| desafio_alimentar | Reduzir os excessos — evite ultraprocessados... |

---

## Estrutura do projeto

```
desafio-saude/
├── index.html        # App completo (frontend)
├── apps-script.js    # Código do backend (Google Apps Script)
└── README.md
```

---

## Arquitetura

```
Browser (GitHub Pages — index.html)
    │
    ├── GET  ?action=ranking               → ranking público
    ├── GET  ?action=today                 → atividades do usuário hoje (auth)
    ├── GET  ?action=weekpresence          → presença semanal (auth)
    ├── GET  ?action=profile               → perfil individual (auth)
    ├── GET  ?action=admin&adminToken=...  → dashboard admin (auth token diário)
    ├── GET  ?action=config                → desafio alimentar da semana
    │
    ├── POST action=register          → cria usuário
    ├── POST action=login             → valida credenciais
    ├── POST action=adminLogin        → autentica admin, retorna token
    ├── POST action=activity          → salva/remove atividade (auth)
    ├── POST action=changePassword    → altera senha (auth)
    └── POST action=deleteUser        → exclui conta (auth)
         │
    Google Apps Script (Web App)
         │
    Google Sheets
         ├── Usuarios   → Nome | SenhaHash | DataCadastro
         ├── Atividades → Timestamp | Nome | Atividade | Data
         └── Config     → Chave | Valor
```

---

## Sistema de pontuação

| Atividade | Pontos |
|---|---|
| Cardio (mínimo 1km) | +1 pt |
| Atividade física | +1 pt |
| Desafio alimentar cumprido | +1 pt |
| Bônus: semana completa (5 dias ativos) | +3 pts |

O bônus é calculado automaticamente no backend: toda semana ISO com pelo menos 1 atividade em 5 dias distintos recebe +3 pontos extras.

---

## Segurança

- Senhas armazenadas apenas como hash SHA-256 gerado no navegador (nunca a senha em texto)
- Token de sessão derivado de `sha256(nomeCanônico + hashDaSenha)`, validado no servidor a cada requisição
- Senha admin existe apenas no Apps Script — nunca no HTML ou no repositório
- Token admin é rotativo (muda diariamente, baseado na data no horário de Brasília)
- Datas calculadas no servidor sempre no fuso `America/Sao_Paulo`

> Projeto para grupos pequenos. Para uso com dados sensíveis em escala, adicione rate limiting e tokens com expiração.

---

## Manutenção semanal

| Tarefa | Como fazer |
|---|---|
| Trocar desafio alimentar | Editar célula `desafio_alimentar` na aba **Config** da planilha |
| Trocar senha admin | Editar `ADMIN_PASS` no `apps-script.js` e reimplantar |
| Atualizar o código | Editar `apps-script.js` → Apps Script → **Implantar → Gerenciar implantações → lápis → Nova versão** |

---

## Desenvolvimento local

Por restrições de CORS, use um servidor HTTP local:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Acesse `http://localhost:8080`.

---

## Licença

MIT — use, modifique e compartilhe à vontade.
