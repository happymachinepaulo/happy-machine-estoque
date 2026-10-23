# Auditoria do estoque — 14/10/2026

Revisão das fotos disponíveis, dos vínculos com o estoque e dos principais fluxos do projeto. Nenhum produto novo foi criado e nenhuma quantidade ou situação de conferência de produto foi alterada. Os cadastros antigos e as contagens manuais foram preservados.

## Cobertura

- 171 produtos e 37 registros de conserto.
- 496 registros de fotos; 524 objetos distintos de armazenamento, incluindo os consertos, baixados e decodificados sem erro.
- 559 imagens de conteúdo binário distinto no conjunto reunido, incluindo originais, versões recomprimidas e recortes. Esse número não representa produtos diferentes.
- Todos os 171 produtos têm foto confirmada e uma única foto principal.
- Foram examinadas as folhas de contato do acervo antigo, as imagens adicionais do sistema, as pendências e os lotes recentes disponíveis.

Os quatro ZIPs antigos de conversas/fotos não estão mais nos caminhos originais em Downloads. A revisão utilizou o acervo já extraído, as cópias em bancos locais e as fotos preservadas no armazenamento online. Os quatro lotes recentes de 13 e 14/10 estavam disponíveis.

## Ajustes aplicados

| Ajuste | Resultado |
| --- | --- |
| Cópias visuais 509, 109, 477 e 478 | Ocultadas; arquivos preservados, sem saldo adicional |
| Foto 213 de embalagem Ruijie/Reyee | Retirada da galeria da fonte Ubiquiti; marca incompatível |
| Foto 415 | Vinculada ao produto antigo 103, sem alterar suas 35 unidades pendentes de conferência |
| Foto 418 | Vinculada ao produto antigo 51, sem alterar suas 16 unidades |
| Produto 103 | Nome esclarecido para “Micro switch com suporte plástico branco - modelos variados” |
| 23 referências em Revisar | Sugestões descritivas e limites da identificação registrados, sem criar peças |

Os produtos anteriormente excluídos 88, 174, 175 e 223 não foram recriados. Fotos com vários ângulos não foram somadas como lotes diferentes. Imagens compartilhadas por peças distintas foram mantidas quando mostram modelos diferentes.

As pendências passaram de 29 para 24. Durante a auditoria, a foto 511 do produto 218 foi colocada em Revisar pelo usuário; essa alteração foi preservada.

## O que ainda exige identificação

Há 15 referências sem identificação segura: fotos 155, 243, 244, 397, 398, 404, 406, 407, 408, 410, 416, 417, 422, 423 e 472. Mostram conjuntos eletromecânicos, componentes embalados, peças metálicas, molas, redutores, cilindros, suportes, botões, motores e caixas fechadas. Os nomes sugeridos descrevem o que aparece; não confirmam modelo, conteúdo oculto nem quantidade total.

Isso não significa 15 produtos faltantes: algumas imagens podem representar peças já cadastradas. Outras oito referências pendentes são fotos ou ângulos de modelos que tiveram seus cadastros removidos. A foto 511 já está vinculada ao produto 218. Não há justificativa segura para acrescentar saldo com base nessas imagens.

## Correções no projeto

- A indicação explícita de unidade “lote” passou a ser respeitada nos cartões e detalhes; lotes não entram na soma de unidades físicas.
- Criação e edição bloqueiam nomes equivalentes por acento, caixa, espaços e pontuação, inclusive quando o catálogo ultrapassar mil produtos. Modelos numericamente diferentes continuam distintos.
- A revisão de uma foto reconhecida abre o cadastro existente. A proteção por nome não substitui comparação visual nem uma restrição transacional no banco.

Validação: 62 testes Python, seis verificações do contador e testes de navegador do login por senha/código de e-mail, abertura de cadastro existente e exibição de lote passaram. O bucket é privado e consultas anônimas às tabelas de estoque, fotos, movimentos, perfis, auditoria e consertos não retornaram dados.

## Pendências técnicas verificadas

1. **Cadastro público no Supabase:** a configuração Auth ainda informa `disable_signup: false`. O acesso ao estoque continua condicionado ao perfil e às políticas verificadas, mas a criação pública de contas deve ser desativada em Authentication → configuração de usuários → Allow new users to sign up. Não foi possível alterar essa configuração nesta sessão: o painel autenticado e credenciais da Management API não estavam disponíveis. O teste `scripts/check_cloud.py` sinaliza essa pendência.
2. **Exclusão de produto e fotos ocultas:** a função atual do banco recoloca as fotos associadas em Revisar ao excluir um produto, inclusive cópias ocultas. As cópias encontradas foram ocultadas novamente nesta revisão. A função do banco ainda precisa de uma migração para preservar o estado oculto nas próximas exclusões; essa causa não foi corrigida apenas com o ajuste das fotos.

## Registro e reprodução

O arquivo `supabase/013_auditoria_fotos_20261014.sql` registra os ajustes de metadados desta revisão, já aplicados via API autenticada. Não cria produtos nem altera quantidades. Os arquivos originais, manifestos, resultados e backups estão preservados localmente em `migration/auditoria_final_20261014/`, fora do Git. Não executar importações antigas para “completar” o estoque: elas podem recriar cadastros que o usuário removeu.
