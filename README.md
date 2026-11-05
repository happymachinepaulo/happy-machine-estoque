# Happy Machine · Estoque

Controle de estoque de peças. Vercel (site estático + `api/index.py`) e Supabase (login, banco, fotos privadas).

## O que mudou (v3)
- **Visual de vidro:** fundo grafite com as luzes das cores do manual da marca, cartões de vidro fosco, barra lateral flutuante (no celular vira barra de baixo) e fontes do manual (Mouse Memoirs, Roboto, Cutive Mono). O Painel mostra números com mini gráficos, as movimentações da semana, o que aconteceu hoje, com quem está cada peça e o que precisa repor.
- **Configurações:** alterar nome e senha, sair dos outros aparelhos, excluir a própria conta (menos o administrador principal) e preferências do aparelho (tela inicial, cartões ou lista, abertura animada, menos animações, texto maior).
- **Busca rápida (Ctrl K), central de alertas (sino) e lista de reposição** para copiar, mandar no WhatsApp ou imprimir.
- **Mini estoques por pessoa (aba Pessoas):** Bruno, Matheus e quem mais for cadastrado. Cada pessoa tem uma subaba com as peças que estão com ela, *Devolver*, *Dar baixa* (usou num lugar) e *Entregar peça*.
- **Saída** vai para uma pessoa ou para um lugar/motivo (com *Outros* + texto livre). **Adicionar** vem de uma pessoa (devolução) ou de outra origem (com *Outros* + texto livre). O histórico mostra para onde foi / de onde veio.
- **Manutenção Máquinas:** aba nova, por enquanto só "Em breve".
- **Banco:** `supabase/018_estoque_pessoas.sql` (pessoas, estoque de cada pessoa, destino nas movimentações). Sem ela o site continua funcionando, mas a aba Pessoas fica vazia e a saída para pessoa falha.
- **Banco:** `supabase/019_mapa_galpao.sql` (estante A–K de cada peça, usada na aba Galpão). Sem ela a planta abre, mas todas as peças aparecem sem estante e trocar a estante falha.
- **Banco:** `supabase/020_logs_acesso.sql` (tabela `access_log`: quem entrou, conta, aparelho, IP e cidade). A aba **Logs** só aparece para o administrador; sem a 020 ela mostra só as alterações do estoque.
- **Galpão:** a planta fica em `public/js/shelves.js` (posição, cor e nome de cada estante). As fotos das estantes ficam em `api/galpao/` e só abrem com login.

## O que mudou (v2)
- **Rápido:** uma chamada (`/api/boot`) traz estoque + fotos + pendências; fotos com miniatura de 480 px; sessão em cache de 30 s; conexões reaproveitadas; sem SDK do Supabase, three.js ou gsap no navegador (de ~1,5 MB de JS para ~40 KB).
- **Sem contagem por IA:** a quantidade é sempre a do site (entrada, saída e ajuste). O leitor/contador automático foi removido.
- **Fotos sem repetição:** `scripts/importar_fotos.py` só envia foto realmente nova e deixa em *Fotos* como pendente; você vincula à peça e confere a quantidade lá.
- **Organizado:** Estoque · Fotos · Consertos · Histórico · Admin.
- **Banco:** `supabase/017_desempenho.sql` cria índices e corrige as políticas RLS (a função de acesso era chamada em cada linha).

## Estrutura
`public/` (css, js em módulos) · `api/index.py` · `supabase/schema.sql` + `017_desempenho.sql` + `018_estoque_pessoas.sql` + `019_mapa_galpao.sql` + `020_logs_acesso.sql` (`historico/` = migrações antigas) · `scripts/` · `tests/` · `migration/fotos_novas/` (fotos novas + `manifest.json`).

## Rodar local (dados de demonstração)
`python scripts/preview.py` → http://127.0.0.1:8770 (qualquer e-mail/senha; código `000000`).

## Testes
`cd tests && python -m unittest test_api`

Veja `DEPLOY.md` para publicar.
