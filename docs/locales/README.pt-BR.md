# KnowGrove

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · **Português (Brasil)** · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

O KnowGrove é um fluxo de conhecimento local para quem coleta mais rápido do que consegue organizar. Ele mantém as fontes no vault do Obsidian, extrai sua estrutura, conecta tópicos e evidências e transforma tudo em resultados reutilizáveis.

Versão atual do código-fonte: `2.8.32`

## Um fluxo da fonte ao resultado

| Capturar | Processar | Organizar | Criar |
| --- | --- | --- | --- |
| Salve artigos, links, áudio/vídeo local, gravações e imagens. | Extraia conteúdo da web, converta imagens em Markdown estruturado e transcreva áudio ou vídeo. | Leia mais tarde, gerencie propriedades e conecte tópicos, comentários, blocos e evidências. | Crie estruturas, relatórios, textos longos e versões por canal a partir das fontes escolhidas. |

O vault continua sendo a fonte da verdade. O KnowGrove não coleta telemetria do cliente; apenas as ferramentas locais ou os provedores compatíveis escolhidos por você processam o conteúdo correspondente.

## Principais recursos

- **Ler mais tarde:** uma caixa de entrada, filtros de não lido/lido e marcação opcional ao chegar ao fim da nota.
- **Captura pelo navegador e celular:** salve artigos, vídeos, links e notas de voz curtas no vault.
- **Processamento de conteúdo:** preserva imagens dos artigos, prioriza legendas e usa transcrição local apenas quando não há legendas.
- **Imagem em texto com IA:** converta uma imagem ou todas as imagens da nota e grave tabelas e texto estruturado abaixo da imagem original. O processamento em segundo plano mostra etapas reais, permite cancelamento seguro e localiza o resultado.
- **Edição na visualização ao estilo Word:** mantém a formatação de títulos, listas, tarefas, imagens, blocos de código e tabelas. Ao remover linhas em branco da seleção, preserva ou repara os limites das tabelas GFM para que continuem renderizadas na visualização e no modo de leitura.
- **Captura rápida e recuperável:** cria e relê uma nota Markdown mínima e pronta para abrir antes da fila demorada; o processamento de IA e mídia continua em segundo plano.
- **Navegação em documentos longos:** mantém o primeiro e o último título acessíveis e a ação de localizar arquivo visível, sem capturar a rolagem do documento.
- **Gerenciamento de propriedades:** use um padrão compacto de tipo, estado do ciclo de vida, domínio, tópico e fatos de origem rastreáveis; as migrações são revisadas e confirmadas sem substituir campos desconhecidos nem conteúdo do usuário.
- **Tópicos e pesquisa:** navegue por todos os tópicos e fontes relacionadas e organize áreas, tópicos e perguntas de pesquisa.
- **Comentários e referências de bloco:** comente o texto selecionado e reutilize-o com incorporações de bloco nativas do Obsidian.
- **Escrita baseada em evidências:** crie estruturas, relatórios, textos longos e versões para diferentes canais.
- **Limpeza segura de anexos:** acompanha apenas arquivos que já foram referenciados e pede confirmação antes de movê-los para a lixeira do Obsidian.

## Idioma e dados

O KnowGrove segue o idioma do Obsidian. Títulos, caminhos, comentários, áreas, tópicos, valores de propriedades, frontmatter, Bases e conteúdo Markdown nunca são traduzidos ou alterados.

## Instalação

Procure e instale o KnowGrove em **Configurações → Plugins da comunidade → Explorar**.

Para instalar manualmente, baixe `main.js`, `manifest.json` e `styles.css` da versão mais recente no GitHub, copie-os para `<vault>/.obsidian/plugins/knowgrove/`, recarregue o Obsidian e ative o plugin. Nunca copie o `data.json` de outra pessoa.

Veja [Privacidade](../../PRIVACY.md), [Segurança](../../SECURITY.md) e a [licença MIT](../../LICENSE).
