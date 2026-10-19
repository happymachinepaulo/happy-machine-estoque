# Contagens recebidas — 19/10/2026

16 contagens sem fotos registradas na seção Revisar. Nenhum produto, foto ou movimento criado; quantidades atuais preservadas. Não somar os valores aos saldos antigos: são contagens recebidas para conferir identidade e possível sobreposição entre grupos e marcas.

| Descrição | Unidades |
| --- | ---: |
| MIDI | 288 |
| Leitor QR Code | 265 |
| Impressora Xprinter | 44 |
| Box TV | 43 |
| Smartpro | 7 |
| Totem | 31 |
| Tela | 85 |
| Impressora Bematech | 23 |
| Impressora Epson | 1 |
| Impressora — modelo a identificar | 7 |
| Cabo VGA | 36 |
| Conversor HDMI | 33 |
| Fonte da tela | 66 |
| Fonte impressora | 23 |
| Cabo USB para impressora | 35 |
| Cabo de alimentação | 67 |

“Cabo impressora / Saída USB: 35” interpretado como um único item: 35 cabos USB para impressora.

A fila é persistida em audit_log com ação stock_count_review, protegida pelas políticas existentes e exposta apenas pelo endpoint autenticado /api/count-review. Não requer alteração de esquema. Os valores não compõem totais do estoque ou exportação até serem conferidos e aplicados ao cadastro correto. O botão Buscar cadastro abre a busca existente sem criar peças ou alterar saldos.

015_contagens_sem_foto_20261019.sql já aplicado; marcador impede repetição. Backups e registros individuais em migration/contagens_20261019/, fora do Git.
