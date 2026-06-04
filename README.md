# Tukwata Ukongo - Sistema de Gestao de Casa de Video Jogos

Sistema completo e pronto para producao de gestao de casas de jogos eletronicos (gaming houses/arcades). Cada utilizador pode registar a sua propria casa de jogos e gerir estacoes, clientes, sessoes, torneios e muito mais.

## Funcionalidades

- **Multi-Tenant**: Cada utilizador gere a sua propria casa de jogos
- **Autenticacao JWT**: Segura com tokens
- **Gestao de Estacoes**: PC Gamer, PS5, Xbox, Nintendo Switch
- **Gestao de Clientes**: Cadastro, historico, gastos
- **Controlo de Sessoes**: Inicio/fim automatico com calculo de custos
- **Biblioteca de Jogos**: Catalogo completo
- **Torneios**: Sistema de chaves eliminatorias
- **Mensagens**: Chat em tempo real
- **Relatorios**: Estatisticas de uso e receita
- **Configuracoes**: Precos, horarios, moeda

## Tecnologias

- **Backend**: Node.js + Express
- **Base de Dados**: SQLite (better-sqlite3)
- **Autenticacao**: JWT + bcrypt
- **Frontend**: HTML5 + CSS3 + JavaScript vanilla
- **Seguranca**: Helmet, CORS, Rate Limiting

## Instalacao Local

```bash
# 1. Clonar o projeto
cd tukwata-ukongo

# 2. Instalar dependencias
npm install

# 3. Configurar ambiente
cp .env.example .env
# Editar .env com as suas configuracoes

# 4. Iniciar o servidor
npm start

# 5. Aceder ao sistema
# http://localhost:3000
```

## Deploy no Render (Gratuito)

1. Crie conta em [render.com](https://render.com)
2. Connecte o seu repositorio GitHub/GitLab
3. Render detecta automaticamente o `render.yaml`
4. Clique em "Deploy"
5. O sistema fica online em segundos!

## Demo

Credenciais de demonstracao:
- **Email**: admin@tukwata.com
- **Palavra-passe**: admin123

## Estrutura do Projeto

```
tukwata-ukongo/
├── server.js          # Servidor principal
├── db.js              # Base de dados SQLite
├── auth.js            # Autenticacao JWT
├── package.json       # Dependencias
├── .env               # Variaveis de ambiente
├── render.yaml        # Configuracao Render
├── public/            # Frontend
│   └── index.html     # Aplicacao completa
└── database/          # Ficheiros SQLite
    └── tukwata.db
```

## API Endpoints

### Autenticacao
- `POST /api/auth/register` - Registar nova casa de jogos
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do utilizador

### Dashboard
- `GET /api/dashboard` - Estatisticas

### Estacoes
- `GET /api/stations` - Listar
- `POST /api/stations` - Criar
- `PUT /api/stations/:id` - Atualizar

### Clientes
- `GET /api/clients` - Listar
- `POST /api/clients` - Criar
- `PUT /api/clients/:id` - Editar
- `DELETE /api/clients/:id` - Remover

### Sessoes
- `GET /api/sessions` - Listar
- `POST /api/sessions` - Iniciar
- `PUT /api/sessions/:id/end` - Finalizar

### Jogos
- `GET /api/games` - Listar
- `POST /api/games` - Adicionar

### Torneios
- `GET /api/tournaments` - Listar
- `POST /api/tournaments` - Criar

### Mensagens
- `GET /api/messages` - Listar
- `POST /api/messages` - Enviar

### Relatorios
- `GET /api/reports/usage` - Estatisticas de uso

### Configuracoes
- `GET /api/settings` - Obter
- `PUT /api/settings` - Atualizar

## Licenca

MIT License - Livre para uso comercial e pessoal.

---

**Desenvolvido com ❤️ para a comunidade gaming de Angola e do mundo.**
