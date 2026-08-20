# Controle de Abastecimento — V1

PWA corporativo para controle de abastecimento de veículos.

## Arquitetura

- Frontend: PWA (HTML/CSS/JavaScript)
- Offline: Service Worker + IndexedDB
- Backend: Google Apps Script
- Dados: Google Sheets
- Evidências: Google Drive
- Autenticação e autorização: backend
- Auditoria: registros de alteração/invalidação

## Perfis

### Operação
- Lançar abastecimentos
- Consultar abastecimentos

### Gestão
- Tudo de Operação
- Dashboard/KPIs
- Cadastrar veículos
- Cadastrar usuários
- Consultar histórico

### ADM
- Todas as funções
- Editar registros
- Corrigir cadastros
- Configurar parâmetros
- Administrar usuários e veículos
- Invalidar registros, mantendo auditoria

## Regra de integridade

Abastecimentos não são excluídos fisicamente. Alterações e invalidações geram trilha de auditoria.

## Próximos passos

1. Criar projeto no Google Apps Script.
2. Criar planilha base.
3. Configurar IDs de planilha e pasta do Drive.
4. Publicar a API.
5. Configurar `js/config.js`.
6. Publicar o PWA no GitHub Pages.
