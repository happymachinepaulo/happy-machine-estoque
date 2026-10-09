# Contagem sugerida por foto

A implementação original roda em um Web Worker no navegador, sem enviar as fotos a um serviço de inteligência artificial. Reduz a imagem a até 640 pixels por lado, converte para cinza, suaviza com filtro gaussiano 3 × 3, separa o fundo com Otsu (ou bordas Sobel), aplica fechamento morfológico, preenche buracos e extrai regiões externas conectadas. Tamanho mínimo e área da foto são ajustáveis; o usuário pode adicionar/remover marcações e aceitar explicitamente a sugestão.

Referências consultadas para a abordagem:

- https://github.com/Andrii-Radyhin/Image-object-counter — pré-processamento, bordas e contornos; filtragem por área.
- https://github.com/siddhantmaharana/counting-objects — Otsu, separação de fundo, preenchimento e contornos; exemplos dos limites de contagem clássica.

Não foram copiados notebooks, modelos, pesos ou código desses repositórios. Não usa o modelo COCO dos exemplos: ele não foi treinado para as peças de manutenção da Happy Machine. Não identifica nomes/modelos nem quantidades dentro de caixas; conta regiões visíveis. Fundo texturizado, reflexos, peças que se encostam e detalhes internos podem exigir correção manual. Não há percentual de confiança inventado.

A quantidade é preenchida somente ao clicar em **Usar contagem**, permanecendo editável. A gravação continua exigindo **Salvar**. Uploads, câmera e criação a partir de revisão usam o mesmo fluxo; troca da imagem cancela trabalhos anteriores. Consertos usam a mesma sugestão quando recebem foto nova.
