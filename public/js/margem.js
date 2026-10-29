/* ============================================================================
   Calculadora de Margem — aba "margem" do CRM.

   Pensada para usar na frente do fornecedor: você digita o custo e a
   quantidade, e as cinco plataformas respondem na hora — por quanto teria que
   vender em cada uma, e quanto sobra.

   Tabela de taxas: retrato de 22/10/2026 (mesma do VeloMargem desktop).
   Elas mudam e variam por categoria — ajuste PLATAFORMAS quando mudarem.
   ========================================================================= */
(() => {
  'use strict';

  const PLATAFORMAS = [
    {
      nome: 'Shopee', curto: 'Shopee', incluiFrete: false, minimo: 0, teto: 0,
      pgtoPct: 0, pgtoFixo: 0, mensalidade: 0, repasse: 10,
      faixas: [
        { ate: 79.99, pct: 20, fixo: 4.5, fixoPctPreco: 0 },
        { ate: 99.99, pct: 14, fixo: 16, fixoPctPreco: 0 },
        { ate: 199.99, pct: 14, fixo: 20, fixoPctPreco: 0 },
        { ate: null, pct: 14, fixo: 26, fixoPctPreco: 0 },
      ],
    },
    {
      nome: 'Mercado Livre — Clássico', curto: 'ML Clássico', incluiFrete: false, minimo: 0, teto: 0,
      pgtoPct: 0, pgtoFixo: 0, mensalidade: 0, repasse: 14,
      faixas: [
        { ate: 12.49, pct: 12, fixo: 0, fixoPctPreco: 50 },
        { ate: 29.99, pct: 12, fixo: 6.25, fixoPctPreco: 0 },
        { ate: 49.99, pct: 12, fixo: 6.5, fixoPctPreco: 0 },
        { ate: 78.99, pct: 12, fixo: 6.75, fixoPctPreco: 0 },
        { ate: null, pct: 12, fixo: 0, fixoPctPreco: 0 },
      ],
    },
    {
      nome: 'Mercado Livre — Premium', curto: 'ML Premium', incluiFrete: false, minimo: 0, teto: 0,
      pgtoPct: 0, pgtoFixo: 0, mensalidade: 0, repasse: 14,
      faixas: [
        { ate: 12.49, pct: 17, fixo: 0, fixoPctPreco: 50 },
        { ate: 29.99, pct: 17, fixo: 6.25, fixoPctPreco: 0 },
        { ate: 49.99, pct: 17, fixo: 6.5, fixoPctPreco: 0 },
        { ate: 78.99, pct: 17, fixo: 6.75, fixoPctPreco: 0 },
        { ate: null, pct: 17, fixo: 0, fixoPctPreco: 0 },
      ],
    },
    {
      nome: 'Amazon', curto: 'Amazon', incluiFrete: true, minimo: 1, teto: 0,
      pgtoPct: 0, pgtoFixo: 0, mensalidade: 19, repasse: 14,
      faixas: [{ ate: null, pct: 12, fixo: 0, fixoPctPreco: 0 }],
    },
    {
      nome: 'Site Próprio', curto: 'Site próprio', incluiFrete: false, minimo: 0, teto: 0,
      pgtoPct: 3.99, pgtoFixo: 0.39, mensalidade: 0, repasse: 30,
      faixas: [{ ate: null, pct: 0, fixo: 0, fixoPctPreco: 0 }],
    },
  ];

  const CHAVE_EXTRAS = 'vg.margem.extras.v1';

  /* ---------------------------------------------------------------- números */
  const lerNumero = (txt) => {
    if (txt == null) return 0;
    let t = String(txt).trim().replace(/R\$|%|\s| /g, '');
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',')) t = t.replace(',', '.');
    else if (t.includes('.')) {
      const p = t.split('.');
      const milhar = p.length > 2 || (p[p.length - 1].length === 3 && p[0] !== '' && p[0] !== '0');
      if (milhar) t = p.join('');
    }
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : 0;
  };
  const moeda = (v) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  });
  const pct = (v, casas = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas, maximumFractionDigits: casas,
  }) + '%';
  const dias = (v) => {
    if (!Number.isFinite(v) || v <= 0) return '—';
    if (v < 1) return 'menos de 1 dia';
    return Math.round(v).toLocaleString('pt-BR') + ' dias';
  };

  /* ------------------------------------------------- motor (igual ao desktop) */
  const faixaDoPreco = (plat, preco) =>
    plat.faixas.find((f) => f.ate === null || preco <= f.ate + 1e-9) || plat.faixas[plat.faixas.length - 1];

  /* Descreve a faixa de preço em que a venda caiu, para a tabela explicar
     POR QUE a comissão é aquela. Ex.: "faixa de R$ 100,00 a R$ 199,99". */
  function textoDaFaixa(plat, f) {
    const i = plat.faixas.indexOf(f);
    if (plat.faixas.length === 1) return '';
    const de = i > 0 ? plat.faixas[i - 1].ate + 0.01 : 0;
    if (f.ate === null) return `faixa de ${moeda(de)} para cima`;
    return `faixa de ${moeda(de)} a ${moeda(f.ate)}`;
  }

  function comissaoDe(plat, preco, freteCliente) {
    if (preco <= 0) return { valor: 0, detalhe: '—', porque: '' };
    const base = preco + (plat.incluiFrete ? freteCliente : 0);
    const f = faixaDoPreco(plat, preco);
    const parteFixa = f.fixo + (preco * f.fixoPctPreco) / 100;
    let valor = (base * f.pct) / 100 + parteFixa;
    let detalhe = `${pct(f.pct, 0)} de ${moeda(base)}`;
    if (parteFixa > 0) detalhe += ` + fixo ${moeda(parteFixa)}`;

    const pedacos = [];
    if (f.pct > 0) {
      pedacos.push(`${pct(f.pct, 0)} sobre ${plat.incluiFrete && freteCliente > 0
        ? `o preço + o frete do cliente (${moeda(base)})` : `o preço (${moeda(base)})`}`);
    }
    if (parteFixa > 0) pedacos.push(`mais ${moeda(parteFixa)} fixos por item`);
    const faixa = textoDaFaixa(plat, f);
    if (faixa) pedacos.push(faixa);

    if (plat.teto > 0 && valor > plat.teto) {
      valor = plat.teto; detalhe += ' (teto)'; pedacos.push(`limitado ao teto de ${moeda(plat.teto)}`);
    }
    if (plat.minimo > 0 && valor < plat.minimo) {
      valor = plat.minimo; detalhe += ` (mínimo ${moeda(plat.minimo)})`;
      pedacos.push(`elevado ao mínimo de ${moeda(plat.minimo)} por item`);
    }
    return { valor, detalhe, porque: pedacos.join(' · ') };
  }

  function calcular(e, plat, precoForcado) {
    const preco = precoForcado === undefined ? e.preco : precoForcado;
    const custoProduto = e.custo + e.freteEnt + e.embalagem;
    const c = comissaoDe(plat, preco, e.freteCli);
    const pagamento = preco > 0 ? ((preco + e.freteCli) * plat.pgtoPct) / 100 + plat.pgtoFixo : 0;
    const imposto = (preco * e.imposto) / 100;
    const ads = (preco * e.ads) / 100;
    const provisao = ((custoProduto + e.freteVend) * e.perdas) / 100;
    const vendasMes = e.vendasDia * 30;
    const rateio = plat.mensalidade > 0 && vendasMes > 0 ? plat.mensalidade / vendasMes : 0;

    const custosVenda = c.valor + pagamento + imposto + ads + e.freteVend + provisao + rateio;
    const receita = preco + e.freteCli;
    const lucro = receita - custoProduto - custosVenda;
    const caixaUn = receita - custosVenda;
    const investimento = custoProduto * e.qtd;
    const diasPayback = caixaUn > 0 && e.vendasDia > 0 ? investimento / (caixaUn * e.vendasDia) : 0;

    return {
      preco, receita, custoProduto, custosVenda, lucro,
      comissao: c.valor, comissaoDetalhe: c.detalhe, comissaoPorque: c.porque,
      pagamento, imposto, ads,
      freteVend: e.freteVend, provisao, rateio, caixaUn, investimento,
      margem: receita > 0 ? (lucro / receita) * 100 : 0,
      markup: custoProduto > 0 ? (lucro / custoProduto) * 100 : 0,
      lucroLote: lucro * e.qtd,
      diasPayback,
      diasPaybackReal: diasPayback > 0 ? diasPayback + plat.repasse : 0,
      paybackOk: caixaUn > 0 && e.qtd > 0 && caixaUn * e.qtd >= investimento,
      repasse: plat.repasse,
    };
  }

  /* Preço que bate a margem alvo. Varredura + bissecção porque as taxas têm
     degraus (Shopee muda de faixa em R$ 80), então a função não é contínua. */
  function resolverPreco(e, plat, margemAlvo) {
    const alvo = margemAlvo / 100;
    const f = (p) => { const r = calcular(e, plat, p); return r.lucro - alvo * r.receita; };
    let p = 0.5;
    if (f(p) >= 0) return p;
    while (p < 2000000) {
      const prox = p * 1.02 + 0.1;
      if (f(prox) >= 0) {
        let lo = p; let hi = prox;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (f(mid) >= 0) hi = mid; else lo = mid;
        }
        return Math.round((hi + 0.005) * 100) / 100;
      }
      p = prox;
    }
    return 0;
  }

  const veredito = (m) => {
    if (m < 0) return ['Prejuízo', 'ruim'];
    if (m < 5) return ['Perigo', 'ruim'];
    if (m < 10) return ['Apertada', 'medio'];
    if (m < 20) return ['Saudável', 'bom'];
    if (m < 35) return ['Forte', 'bom'];
    return ['Excelente', 'bom'];
  };

  /* ------------------------------------------------------------------ estado */
  let modo = 'margem';      // 'margem' = quero X% de margem | 'preco' = vou vender por Y
  let selecionada = null;   // nome da plataforma aberta na tabela; null = a melhor
  const $ = (id) => document.getElementById(id);
  const CAMPOS = ['mg-custo', 'mg-qtd', 'mg-preco', 'mg-frete-ent', 'mg-embalagem',
    'mg-frete-vend', 'mg-frete-cli', 'mg-imposto', 'mg-ads', 'mg-perdas', 'mg-vendas-dia'];

  function lerEntrada() {
    return {
      custo: lerNumero($('mg-custo').value),
      qtd: Math.max(lerNumero($('mg-qtd').value), 0),
      preco: lerNumero($('mg-preco').value),
      freteEnt: lerNumero($('mg-frete-ent').value),
      embalagem: lerNumero($('mg-embalagem').value),
      freteVend: lerNumero($('mg-frete-vend').value),
      freteCli: lerNumero($('mg-frete-cli').value),
      imposto: lerNumero($('mg-imposto').value),
      ads: lerNumero($('mg-ads').value),
      perdas: lerNumero($('mg-perdas').value),
      vendasDia: lerNumero($('mg-vendas-dia').value),
      meta: lerNumero($('mg-meta').value),
    };
  }

  function salvarExtras() {
    try {
      localStorage.setItem(CHAVE_EXTRAS, JSON.stringify({
        freteEnt: $('mg-frete-ent').value, embalagem: $('mg-embalagem').value,
        freteVend: $('mg-frete-vend').value, freteCli: $('mg-frete-cli').value,
        imposto: $('mg-imposto').value, ads: $('mg-ads').value,
        perdas: $('mg-perdas').value, vendasDia: $('mg-vendas-dia').value,
        meta: $('mg-meta').value,
      }));
    } catch (err) { /* sem storage: segue sem lembrar */ }
  }

  function carregarExtras() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE_EXTRAS) || 'null');
      if (!d) return;
      Object.entries(d).forEach(([k, v]) => {
        const mapa = {
          freteEnt: 'mg-frete-ent', embalagem: 'mg-embalagem', freteVend: 'mg-frete-vend',
          freteCli: 'mg-frete-cli', imposto: 'mg-imposto', ads: 'mg-ads',
          perdas: 'mg-perdas', vendasDia: 'mg-vendas-dia', meta: 'mg-meta',
        };
        const el = $(mapa[k]);
        if (el && v != null) el.value = v;
      });
    } catch (err) { /* ignora */ }
  }

  /* Uma frase de conselho por plataforma. Sem preço de mercado informado, o
     dado mais útil para competir é o PISO: até onde dá para baixar mantendo
     margem. É a folga de negociação contra o concorrente. */
  function conselhoPara(e, x) {
    const { r, plat } = x;
    if (r.preco <= 0) return '';

    if (r.margem < 0) {
      return `Dá prejuízo. Só começa a fechar a partir de ${moeda(resolverPreco(e, plat, 0))}.`;
    }
    if (r.margem < 10) {
      return `Margem apertada. Para 20% você teria que cobrar ${moeda(resolverPreco(e, plat, 20))}.`;
    }

    // degrau de comissão logo abaixo do preço: baixar rende mais
    const degrau = plat.faixas
      .filter((f) => f.ate !== null && f.ate < r.preco)
      .map((f) => ({ ate: f.ate, lucro: calcular(e, plat, f.ate).lucro }))
      .filter((t) => t.lucro > r.lucro + 0.01)
      .sort((a, b) => b.lucro - a.lucro)[0];
    if (degrau) {
      return `Baixe para ${moeda(degrau.ate)}: a comissão cai de faixa e você lucra ${moeda(degrau.lucro)}.`;
    }

    const piso = resolverPreco(e, plat, 15);
    if (piso > 0 && piso < r.preco - 0.02) {
      return `Pode descer até ${moeda(piso)} e ainda manter 15% — essa é a sua folga para competir.`;
    }
    return 'Já está no limite: abaixo desse preço a margem fica apertada.';
  }

  /* ---------------------------------------------------------------- desenho */
  function render() {
    const e = lerEntrada();
    const temCusto = e.custo > 0;
    $('mg-meta-valor').textContent = pct(e.meta, 0);

    const linhas = PLATAFORMAS.map((plat) => {
      if (modo === 'margem') {
        const precoAlvo = temCusto ? resolverPreco(e, plat, e.meta) : 0;
        const r = calcular(e, plat, precoAlvo);
        return { plat, r, destaque: precoAlvo, ordem: precoAlvo };
      }
      const r = calcular(e, plat);
      return { plat, r, destaque: r.margem, ordem: -r.lucro };
    });
    linhas.sort((a, b) => a.ordem - b.ordem);

    /* resumo do lote */
    const melhor = linhas[0];
    const investimento = (e.custo + e.freteEnt + e.embalagem) * e.qtd;
    $('mg-investimento').textContent = temCusto ? moeda(investimento) : '—';
    $('mg-lucro-lote').textContent = temCusto && melhor ? moeda(melhor.r.lucroLote) : '—';
    $('mg-melhor').textContent = temCusto && melhor ? melhor.plat.curto : '—';
    $('mg-payback').textContent = temCusto && melhor && melhor.r.paybackOk
      ? dias(melhor.r.diasPaybackReal) : '—';

    /* cartões das plataformas: preço de revenda + margem + conselho */
    const alvo = $('mg-cards');
    alvo.innerHTML = '';
    if (!temCusto) {
      alvo.innerHTML = '<div class="mg-vazio">Digite o custo de compra para ver as cinco plataformas.</div>';
    } else {
      linhas.forEach((x, i) => {
        const [txtV, classeV] = veredito(x.r.margem);
        const aberta = x.plat.nome === (selecionada || melhor.plat.nome);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `mg-card${i === 0 ? ' mg-card-top' : ''}${aberta ? ' mg-card-aberta' : ''}`;
        card.setAttribute('aria-pressed', aberta ? 'true' : 'false');
        card.innerHTML = `
          <div class="mg-card-barra mg-${classeV}"></div>
          <div class="mg-card-info">
            <div class="mg-card-nome">${x.plat.nome}${i === 0 ? '<span class="mg-tag">melhor</span>' : ''}</div>
            <div class="mg-card-sub">
              taxas ${moeda(x.r.custosVenda)} · lucro ${moeda(x.r.lucro)}/un · lote ${moeda(x.r.lucroLote)}
            </div>
            <div class="mg-conselho">${conselhoPara(e, x)}</div>
          </div>
          <div class="mg-card-num">
            <em class="mg-rot">revenda por</em>
            <strong>${moeda(x.r.preco)}</strong>
          </div>
          <div class="mg-card-margem">
            <strong class="mg-${classeV}-txt">${pct(x.r.margem)}</strong>
            <em>${txtV.toLowerCase()}</em>
          </div>`;
        card.addEventListener('click', () => { selecionada = x.plat.nome; render(); });
        alvo.appendChild(card);
      });
    }

    /* avisos */
    const av = $('mg-avisos');
    av.innerHTML = '';
    if (temCusto) {
      const usada = linhas.find((x) => x.plat.curto === melhor.plat.curto);
      const r = usada.r;
      const degrau = r.preco > 0 && usada.plat.faixas
        .filter((f) => f.ate !== null && f.ate < r.preco)
        .map((f) => ({ ate: f.ate, lucro: calcular(e, usada.plat, f.ate).lucro }))
        .filter((t) => t.lucro > r.lucro + 0.01)
        .sort((a, b) => b.lucro - a.lucro)[0];
      if (degrau) {
        av.insertAdjacentHTML('beforeend',
          `<div class="mg-aviso"><b>Armadilha de degrau na ${usada.plat.curto}:</b> vendendo a
           ${moeda(degrau.ate)} você lucraria ${moeda(degrau.lucro)} — mais que os
           ${moeda(r.lucro)} do preço atual, porque a comissão muda de faixa.</div>`);
      }
      if (modo === 'preco' && r.margem < 5) {
        av.insertAdjacentHTML('beforeend',
          `<div class="mg-aviso"><b>Nesse preço não fecha:</b> nem na plataforma mais barata a
           margem passa de 5%. Negocie o custo com o fornecedor ou suba o preço.</div>`);
      }
      if (melhor.r.paybackOk && melhor.r.diasPayback > 60) {
        av.insertAdjacentHTML('beforeend',
          `<div class="mg-aviso"><b>Retorno lento:</b> o lote só se paga em
           ${dias(melhor.r.diasPaybackReal)}. Considere comprar menos nessa primeira vez.</div>`);
      }
    }

    /* tabela da plataforma clicada: cada centavo que entra e sai, e por quê */
    const det = $('mg-detalhe');
    const titulo = $('mg-detalhe-titulo');
    if (!temCusto) {
      det.innerHTML = '<div class="mg-vazio">Digite o custo de compra e clique numa plataforma acima.</div>';
      if (titulo) titulo.textContent = 'Para onde vai cada real';
    } else {
      const escolha = linhas.find((x) => x.plat.nome === selecionada) || melhor;
      const { r, plat } = escolha;
      if (titulo) {
        titulo.innerHTML = `Para onde vai cada real — <b>${plat.nome}</b> `
          + `<span class="mg-tit-preco">vendendo a ${moeda(r.preco)}</span>`;
      }

      const linha = (rot, porque, val, cls = '') =>
        `<div class="mg-det-linha ${cls}"><span class="mg-det-item">${rot}</span>`
        + `<span class="mg-det-porque">${porque}</span><b>${val}</b></div>`;

      const unidades = e.qtd > 0 ? e.qtd : 1;
      const partes = [];
      partes.push(`<div class="mg-det-cab"><span>Item</span><span>Por quê</span><b>Valor</b></div>`);
      partes.push(linha('Preço de venda', 'o que o cliente paga pelo produto',
        `+${moeda(r.preco)}`, 'mg-entra'));
      if (e.freteCli > 0) {
        partes.push(linha('Frete pago pelo cliente', 'entra junto com a venda',
          `+${moeda(e.freteCli)}`, 'mg-entra'));
      }
      partes.push(linha('Custo do produto',
        `compra ${moeda(e.custo)}`
        + (e.freteEnt > 0 ? ` + frete de entrada ${moeda(e.freteEnt)}` : '')
        + (e.embalagem > 0 ? ` + embalagem ${moeda(e.embalagem)}` : ''),
        `−${moeda(r.custoProduto)}`, 'mg-sai'));
      partes.push(r.comissao > 0
        ? linha(`Comissão ${plat.curto}`, r.comissaoPorque || r.comissaoDetalhe,
          `−${moeda(r.comissao)}`, 'mg-sai')
        : linha(`Comissão ${plat.curto}`, 'não há comissão de marketplace aqui — em troca, o tráfego é por sua conta',
          moeda(0)));
      if (r.pagamento > 0) {
        partes.push(linha('Taxa de pagamento',
          `gateway: ${pct(plat.pgtoPct, 2)} sobre a venda + ${moeda(plat.pgtoFixo)} fixos`,
          `−${moeda(r.pagamento)}`, 'mg-sai'));
      }
      if (r.imposto > 0) {
        partes.push(linha('Imposto', `${pct(e.imposto, 0)} sobre o preço de venda`,
          `−${moeda(r.imposto)}`, 'mg-sai'));
      }
      if (r.ads > 0) {
        partes.push(linha('Anúncios (ADS)', `${pct(e.ads, 0)} do preço investido em patrocinado`,
          `−${moeda(r.ads)}`, 'mg-sai'));
      }
      if (r.freteVend > 0) {
        partes.push(linha('Frete que você paga', 'envio por sua conta nesta venda',
          `−${moeda(r.freteVend)}`, 'mg-sai'));
      }
      if (r.provisao > 0) {
        partes.push(linha('Devoluções e avarias',
          `${pct(e.perdas, 0)} sobre o custo, reservado para o que volta ou quebra`,
          `−${moeda(r.provisao)}`, 'mg-sai'));
      }
      if (r.rateio > 0) {
        partes.push(linha('Mensalidade rateada',
          `${moeda(plat.mensalidade)}/mês divididos por ${Math.round(e.vendasDia * 30)} vendas no mês`,
          `−${moeda(r.rateio)}`, 'mg-sai'));
      }
      partes.push(linha('Sobra pra você',
        `margem ${pct(r.margem)} · markup ${pct(r.markup)} sobre o custo`,
        moeda(r.lucro), 'mg-total'));
      partes.push(linha(`No lote de ${Math.round(unidades)} unidades`,
        `${moeda(r.lucro)} × ${Math.round(unidades)} unidades`,
        moeda(r.lucroLote), 'mg-total mg-det-lote'));
      partes.push(`<div class="mg-nota">A ${plat.curto} repassa o dinheiro em ${r.repasse} dias — `
        + `o lote só se paga de verdade em ${r.paybackOk ? dias(r.diasPaybackReal) : '—'}.</div>`);

      det.innerHTML = partes.join('');
    }

    salvarExtras();
  }

  /* ------------------------------------------------------------------ ligar */
  function iniciar() {
    if (!$('view-margem') || $('view-margem').dataset.pronto) return;
    $('view-margem').dataset.pronto = '1';

    carregarExtras();

    CAMPOS.forEach((id) => { const el = $(id); if (el) el.addEventListener('input', render); });
    $('mg-meta').addEventListener('input', render);

    // passos rápidos para negociar: toca e o número todo se move
    document.querySelectorAll('#view-margem [data-passo]').forEach((bt) => {
      bt.addEventListener('click', () => {
        const campo = $(bt.dataset.campo);
        const passo = parseFloat(bt.dataset.passo);
        const atual = lerNumero(campo.value);
        const novo = Math.max(0, Math.round((atual + passo) * 100) / 100);
        campo.value = bt.dataset.campo === 'mg-qtd'
          ? String(Math.round(novo))
          : novo.toFixed(2).replace('.', ',');
        render();
      });
    });

    document.querySelectorAll('#view-margem [data-mgmodo]').forEach((bt) => {
      bt.addEventListener('click', () => {
        modo = bt.dataset.mgmodo;
        document.querySelectorAll('#view-margem [data-mgmodo]').forEach((o) => {
          o.classList.toggle('active', o === bt);
        });
        $('mg-bloco-meta').hidden = modo !== 'margem';
        $('mg-bloco-preco').hidden = modo !== 'preco';
        render();
      });
    });

    render();
  }

  // a aba é montada junto com o app; se o DOM ainda não chegou, espera.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }

  // Fora do navegador (Node), expõe o motor para conferir as contas contra a
  // versão desktop em Python. Não afeta o CRM.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PLATAFORMAS, calcular, resolverPreco, comissaoDe, lerNumero };
  }
})();
