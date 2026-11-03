# Happy Machine · Estoque

Controle de estoque de peças. Vercel (site estático + `api/index.py`) e Supabase (login, banco, fotos privadas).

## O que mudou (v3)
- **Visual novo:** abas principais com indicador deslizante, subabas em cada tela, animações (entrada das telas, cartões em cascata, números que sobem, janelas com mola). Paleta da Happy (vermelho, amarelo, azul, verde, rosa, laranja), só tema claro.
- **Mini estoques por pessoa (aba Pessoas):** Bruno, Matheus e quem mais for cadastrado. Cada pessoa tem uma subaba com as peças que estão com ela, *Devolver*, *Dar baixa* (usou num lugar) e *Entregar peça*.
- **Saída** vai para uma pessoa ou para um lugar/motivo (com *Outros* + texto livre). **Adicionar** vem de uma pessoa (devolução) ou de outra origem (com *Outros* + texto livre). O histórico mostra para onde foi / de onde veio.
- **Manutenção Máquinas:** aba nova, por enquanto só "Em breve".
- **Banco:** `supabase/018_estoque_pessoas.sql` (pessoas, estoque de cada pessoa, destino nas movimentações). Sem ela o site continua funcionando, mas a aba Pessoas fica vazia e a saída para pessoa falha.

## O que mudou (v2)
- **Rápido:** uma chamada (`/api/boot`) traz estoque + fotos + pendências; fotos com miniatura de 480 px; sessão em cache de 30 s; conexões reaproveitadas; sem SDK do Supabase, three.js ou gsap no navegador (de ~1,5 MB de JS para ~40 KB).
- **Sem contagem por IA:** a quantidade é sempre a do site (entrada, saída e ajuste). O leitor/contador automático foi removido.
- **Fotos sem repetição:** `scripts/importar_fotos.py` só envia foto realmente nova e deixa em *Fotos* como pendente; você vincula à peça e confere a quantidade lá.
- **Organizado:** Estoque · Fotos · Consertos · Histórico · Admin.
- **Banco:** `supabase/017_desempenho.sql` cria índices e corrige as políticas RLS (a função de acesso era chamada em cada linha).

## Estrutura
`public/` (css, js em módulos) · `api/index.py` · `supabase/schema.sql` + `017_desempenho.sql` + `018_estoque_pessoas.sql` (`historico/` = migrações antigas) · `scripts/` · `tests/` · `migration/fotos_novas/` (fotos novas + `manifest.json`).

## Rodar local (dados de demonstração)
`python scripts/preview.py` → http://127.0.0.1:8770 (qualquer e-mail/senha; código `000000`).

## Testes
`cd tests && python -m unittest test_api`

Veja `DEPLOY.md` para publicar.
