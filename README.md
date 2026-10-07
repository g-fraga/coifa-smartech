# Smartech Coifas — site institucional

Site estático (HTML + CSS + JavaScript puro), sem build e sem servidor. Basta abrir o `index.html`
(precisa de internet para as fontes, o GSAP e o three.js, que vêm de CDN com versão fixa e verificação SRI).

## Estrutura

```
index.html            página inteira (semântica, acessível, sem estilos/scripts inline)
css/base.css          tokens de design (cores do logotipo), reset, tipografia, temas claro/escuro
css/components.css    header, menu mobile, botões, cartões, formulários, diálogos, botão flutuante
css/sections.css      layout e identidade de cada seção
js/boot.js            roda antes da 1ª pintura: habilita/desabilita os estados iniciais das animações
js/calc-core.js       regras da calculadora (funções puras, testáveis)
js/calculator.js      liga a calculadora à página
js/ui.js              header, menu, scrollspy, comparador, projetos, diálogos, formulário
js/motion.js          animações de rolagem (GSAP + ScrollTrigger)
js/viewer3d.js        visualizador 3D (three.js) carregado sob demanda
assets/               logotipo, favicon e foto dos sócios (+ assets/cases/ para fotos de obras)
tests/                testes do núcleo de cálculo
_headers, robots.txt  segurança/cache e SEO para publicação
_backup/              site anterior (não publicar)
```

## Como editar

| O que | Onde |
|---|---|
| Telefone do WhatsApp | `data-wa` no `<body>` (formulário, botão flutuante) **e** os links `wa.me/...` no HTML |
| E-mail e Instagram | `index.html` (seção Contato, rodapé, JSON-LD no `<head>`) |
| Textos | direto no `index.html` |
| Cores | variáveis `--yellow-*` e `--graphite-*` no topo de `css/base.css` (amostradas do logotipo) |
| Logotipo / foto dos sócios | substitua os arquivos em `assets/` mantendo os nomes |
| **Foto de um projeto** | coloque o arquivo em `assets/cases/` e preencha `data-photo="assets/cases/arquivo.webp"` no cartão correspondente. Sem foto, o cartão mostra a arte padrão |
| Premissas da calculadora | `js/calc-core.js` (vazão por m², perda de carga, rendimento, motores e dutos comerciais) |
| Texto/specs do 3D | `MODELS` no topo de `js/viewer3d.js` |

## Testes

```bash
node --test tests/calc-core.test.js
```

## Publicação

Qualquer hospedagem estática serve (Cloudflare Pages, Netlify, Vercel, GitHub Pages). Envie `index.html`,
`css/`, `js/`, `assets/`, `_headers` e `robots.txt` — **não** envie `_backup/`, `tests/` nem `.claude/`.
O arquivo `_headers` aplica CSP, HSTS, `nosniff` e cache em Cloudflare Pages/Netlify; em outras hospedagens,
reproduza os mesmos cabeçalhos no painel. Depois de definir o domínio: adicione `og:image` (1200×630) no `<head>`
e um `sitemap.xml`.

## Antes de publicar (conteúdo — decisão da empresa)

1. **Projetos/clientes** (Carbone, Giassi, Saudoso, Hotel Majestic): confirme que a empresa tem autorização para usar os nomes
   e que as vazões/ fichas estão corretas; idealmente substitua pelos dados reais e fotos.
2. **Alegações de desempenho**: o site não traz mais "99,2%", "risco zero de chamas" nem "Patent Pending". Só reintroduza
   números com laudo/ensaio ou registro (INPI) que a empresa possa apresentar.
3. **"Economia anual estimada"** na calculadora é ilustrativa (fórmula em `calc-core.js`); troque por dados reais ou remova.
4. **Calculadora/NBR 14518**: valide as premissas com o responsável técnico antes de manter o selo "NBR 14518" no resultado.
5. **Política de privacidade** (diálogo no site) é um resumo fiel ao funcionamento atual; revise com o jurídico (LGPD).
6. Confirme que o e-mail `contato@smartechcoifas.com` existe.
