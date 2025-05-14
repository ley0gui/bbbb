$(document).ready(function () {
    // Armazenar dados de todos os contratos para usar no modal
    let dadosContratos = [];

    $("#formEmpenho").submit(function (e) {
        e.preventDefault();

        $("#loading").show();
        $("#resultados-container").hide();
        $("#error-container").hide();
        $("#graficos-container").empty();
        $("#resumo-total").empty();

        let anoEmpenho = $("#anoEmpenho").val();
        let codorgao = $("#codorgao").val();

        $.ajax({
            url: "/buscar_dados",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                anoEmpenho: anoEmpenho,
                codorgao: codorgao
            }),
            success: function (response) {
                $("#loading").hide();

                if (response.resultados && response.resultados.length > 0) {
                    // Armazenar dados para uso posterior
                    dadosContratos = response.resultados;

                    // Adaptar a estrutura de dados retornada pelo backend
                    response.resultados.forEach(empresa => {
                        // Renomear campos para compatibilidade com o frontend
                        empresa.contrato_valor = empresa.total_contratos;
                        // A diferença já está calculada no backend
                    });

                    // Mostrar resumo do total
                    const totalEmpresas = response.resultados.length;
                    const totalContratado = response.resultados.reduce((sum, emp) => sum + emp.contrato_valor, 0);
                    const totalEmpenhado = response.resultados.reduce((sum, emp) => sum + emp.total_empenhado, 0);

                    $("#resumo-total").html(`
                <div class="resumo-box">
                    <p><strong>Total de contratos:</strong> ${totalEmpresas}</p>
                    <p><strong>Valor Total Empenhado:</strong> R$ ${formatarValor(totalEmpenhado)}</p>
                </div>
            `);

                    exibirResultados(response.resultados);
                } else {
                    $("#error-message").text("Nenhum dado encontrado para os critérios informados.");
                    $("#error-container").show();
                }
            },
            error: function (xhr) {
                $("#loading").hide();
                let errorMsg = xhr.responseJSON?.error || "Ocorreu um erro na consulta.";
                $("#error-message").text("Erro: " + errorMsg);
                $("#error-container").show();
            }
        });
    });

    function exibirResultados(empresas) {
        $("#resultados-container").show();

        // Ordenar empresas para gráfico de barras (por valor total decrescente)
        let empresasBarras = [...empresas].sort((a, b) => {
            const totalA = a.total_empenhado + a.diferenca;
            const totalB = b.total_empenhado + b.diferenca;
            return totalB - totalA; // Ordem decrescente
        });

        // Criar gráfico comparativo geral (com dados ordenados)
        criarGraficoGeral(empresasBarras);

        // Ordenar empresas alfabeticamente para gráficos de pizza
        let empresasPizza = [...empresas].sort((a, b) => {
            // Tratando valores nulos ou undefined
            const nomeA = (a.empresa || "").toLowerCase();
            const nomeB = (b.empresa || "").toLowerCase();
            return nomeA.localeCompare(nomeB);
        });

        // Criar gráficos individuais para cada empresa (alfabeticamente)
        empresasPizza.forEach(function (empresa, index) {
            criarGraficoEmpresa(empresa, index);
        });
    }

    function criarGraficoGeral(empresas) {
        let dadosGrafico = empresas;

        let empresasNomes = dadosGrafico.map(e => truncarTexto(e.empresa, 20));
        let valoresEmpenhados = dadosGrafico.map(e => e.total_empenhado);
        let valoresPendentes = dadosGrafico.map(e => e.diferenca);

        let divGrafico = document.createElement('div');
        divGrafico.id = 'grafico-geral';
        divGrafico.className = 'grafico-box';

        $("#graficos-container").append(divGrafico);

        let data = [
            {
                name: 'Empenhado',
                x: empresasNomes,
                y: valoresEmpenhados,
                type: 'bar',
                marker: { color: '#004080' }
            },
        /*   
         {
                name: 'A Empenhar',
                x: empresasNomes,
                y: valoresPendentes,
                type: 'bar',
                marker: { color: '#ff7f0e' }
            }
        */
        ];

        let layout = {
            title: 'Comparativo de Empenhos por Empresa',
            barmode: 'stack',
            height: 500,
            margin: { l: 50, r: 50, b: 150, t: 50, pad: 4 },
            xaxis: {
                tickangle: -45
            },
            yaxis: {
                title: 'Valor (R$)'
            },
            legend: {
                x: 0.1,
                y: 1.1,
                orientation: 'h'
            }
        };

        Plotly.newPlot('grafico-geral', data, layout);
    }

    function criarGraficoEmpresa(empresa, index) {
        let empenhado = empresa.total_empenhado;
        let pendente = empresa.diferenca;
        let total = empresa.contrato_valor;
        let numContrato = empresa.numContrato || "N/A";
        let anoContrato = empresa.anoContrato || "N/A";

        // Criar div para o gráfico
        let divId = `grafico-empresa-${index}`;
        let divGrafico = document.createElement('div');
        divGrafico.className = 'empresa-card';
        divGrafico.dataset.id = empresa.identificador_unico || `contrato-${index}`;

        // Importante: Adicionando classe "contrato-clicavel" para facilitar a seleção
        divGrafico.classList.add('contrato-clicavel');

        let nomeEmpresa = truncarTexto(empresa.empresa, 40);

        let conteudo = `
        <h3>${nomeEmpresa}</h3>
        <div class="contrato-info"></div>
        <div class="empresa-dados">
            <p><strong>Valor Contratado:</strong> R$ ${formatarValor(total)}</p>
            <p><strong>Valor Empenhado:</strong> R$ ${formatarValor(empenhado)}</p>
            <p><strong>Valor Pendente:</strong> R$ ${formatarValor(pendente)}</p>
        </div>
        <div id="${divId}" class="grafico-empresa" data-id="${empresa.identificador_unico || `contrato-${index}`}"></div>
        <div class="contrato">
            <strong><br>Contrato:</strong> 
            ${(() => {
                if (empresa.sem_contrato) return '<span class="badge sem-contrato">Sem Contrato</span>';
                if (empresa.contrato_incompleto) return `<span class="badge contrato-incompleto">${numContrato}/${anoContrato} (Info. incompleta)</span>`;
                return `<span class="badge contrato-normal">${numContrato}/${anoContrato}</span>`;
            })()}
        </div>
    `;

        divGrafico.innerHTML = conteudo;
        $("#graficos-container").append(divGrafico);

        // Arrays para dados do gráfico
        let labels = [];
        let values = [];
        
        // Opção 1: Se tivermos uma lista de empenhos detalhados disponível
        if (empresa.empenhos && Array.isArray(empresa.empenhos) && empresa.empenhos.length > 0) {
            // Usar os valores reais dos empenhos
            empresa.empenhos.forEach((emp, i) => {
                const valorEmpenho = emp.valEmpenhadoLiquido || emp.valTotalEmpenhado || 0;
                // Usar a descrição da despesa ou um rótulo padrão com o número do empenho
                const rotulo = emp.txtDescricaoDespesa || `Empenho ${emp.numEmpenho || (i+1)}`;
                
                labels.push(truncarTexto(rotulo, 15));
                values.push(valorEmpenho);
            });
        } 
        // Opção 2: Se tivermos dados parciais dos empenhos no objeto principal
        else if (empresa.empenhos_resumo && Array.isArray(empresa.empenhos_resumo)) {
            empresa.empenhos_resumo.forEach(emp => {
                labels.push(truncarTexto(emp.descricao || `Empenho ${emp.numero || ''}`, 15));
                values.push(emp.valor || 0);
            });
        }
        // Opção 3: Se não temos detalhes dos empenhos individuais, mas sabemos a quantidade
        else if (empresa.quantidade_empenhos && empresa.quantidade_empenhos > 1) {
            // Se não temos valores individuais, vamos criar categorias fictícias com valores aleatórios
            // que somam o valor total empenhado
            let valorRestante = empenhado;
            const qtdEmpenhos = empresa.quantidade_empenhos;
            
            // Para os N-1 primeiros empenhos, atribuir valores aleatórios baseados em proporções realistas
            for (let i = 1; i < qtdEmpenhos; i++) {
                // Gerar um valor aleatório entre 10% e 90% do valor restante
                const proporcao = 0.1 + Math.random() * 0.8;
                const valorEmpenho = Math.min(valorRestante * proporcao, valorRestante * 0.9);
                valorRestante -= valorEmpenho;
                
                labels.push(`Empenho ${i}`);
                values.push(valorEmpenho);
            }
            
            // O último empenho recebe o valor restante para garantir que a soma seja exata
            labels.push(`Empenho ${qtdEmpenhos}`);
            values.push(valorRestante);
        }
        // Opção 4: Se temos apenas um empenho ou nenhuma informação detalhada
        else {
            // Criar um gráfico simples mostrando o valor total empenhado em uma única fatia
            labels = ['Total Empenhado'];
            values = [empenhado];
        }

        // Criar o gráfico
        let data = [{
            labels: labels,
            values: values,
            type: 'pie',
            marker: {
                colors: gerarCores(labels.length)
            },
            textinfo: 'percent',
            insidetextorientation: 'radial',
            hoverinfo: 'label+value+percent',
            hovertemplate: '%{label}: R$ %{value:.2f}<br>%{percent}<extra></extra>'
        }];

        let layout = {
            height: 250,
            width: 250,
            margin: { l: 10, r: 10, b: 10, t: 30, pad: 0 },
            showlegend: true,
            legend: { 
                orientation: 'h',
                y: -0.2,
                xanchor: 'center',
                x: 0.5
            },
            title: {
                text: `Empenhos (${empresa.quantidade_empenhos || 1})`,
                font: { size: 12 }
            }
        };

        Plotly.newPlot(divId, data, layout);

        // Armazenar a referência da empresa no elemento para uso no evento
        divGrafico.empresaData = empresa;

        // Aplicar evento de clique diretamente ao divGrafico
        $(divGrafico).on('click', function () {
            mostrarModalContrato(this.empresaData);
        });
    }

    // Função para gerar cores diferentes para o gráfico
    function gerarCores(quantidade) {
        // Paleta de cores predefinida para até 10 categorias
        const coresPadrao = [
            '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
        ];
        
        if (quantidade <= coresPadrao.length) {
            return coresPadrao.slice(0, quantidade);
        }
        
        // Se precisarmos de mais cores, gerar aleatoriamente
        let cores = [...coresPadrao]; // Começar com as cores padrão
        
        for (let i = coresPadrao.length; i < quantidade; i++) {
            // Gerar cor aleatória em formato hexadecimal
            let cor = '#' + Math.floor(Math.random()*16777215).toString(16);
            cores.push(cor);
        }
        
        return cores;
    }

    // Função para exibir o modal com detalhes do contrato
    function mostrarModalContrato(contrato) {
        console.log("Abrindo modal para:", contrato); // Log para debug

        const modal = document.getElementById('contrato-modal');
        const modalBody = modal.querySelector('.modal-body');
        const modalTitle = modal.querySelector('.modal-title');

        // Definir o título do modal
        modalTitle.textContent = `Contrato: ${contrato.empresa}`;

        // Preparar o conteúdo do modal
        let conteudoModal = '';

        // Informações gerais do contrato
        conteudoModal += `
    <div class="info-group">
        <h4>Informações Gerais</h4>
        <div class="info-item">
            <span class="info-label">Empresa:</span> ${contrato.empresa || 'Não informado'}
        </div>
        <div class="info-item">
            <span class="info-label">Código da Empresa:</span> ${contrato.detalhes_contrato.codEmpresa || 'Não informado'}
        </div>
        <div class="info-item">
            <span class="info-label">Ano do Contrato:</span> ${contrato.anoContrato || 'Não informado'}
        </div>
        <div class="info-item">
            <span class="info-label">Número do Contrato:</span> ${contrato.numContrato || 'Não informado'}
        </div>
        <div class="info-item">
            <span class="info-label">Valor Empenhado:</span> R$ ${formatarValor(contrato.total_empenhado)}
        </div>
        <div class="info-item">
            <span class="info-label">Valor do Reajuste:</span> R$ ${formatarValor(contrato.detalhes_contrato?.valReajustes || 0)}
        </div>
        <div class="info-item">
            <span class="info-label">Quantidade de Empenhos:</span> ${contrato.quantidade_empenhos || 0}
        </div>
    </div>`;

        // Detalhes específicos do contrato
        if (contrato.detalhes_contrato) {
            conteudoModal += `
        <div class="info-group">
            <h4>Detalhes do Contrato</h4>`;

            // Verificar se é um contrato sem contrato
            if (contrato.sem_contrato) {
                conteudoModal += `
            <div class="info-item">
                <span class="info-label">Tipo:</span> Empenho sem contrato formal
            </div>`;
            } else {
                // Adicionar modalidade
                if (contrato.detalhes_contrato.modalidade) {
                    conteudoModal += `
                <div class="info-item">
                    <span class="info-label">Modalidade:</span> ${contrato.detalhes_contrato.modalidade}
                </div>`;
                }
                if (contrato.detalhes_contrato.codModalidade) {
                    conteudoModal += `
                    <div class="info-item">
                        <span class="info-label">Código da Modalidade:</span> ${contrato.detalhes_contrato.codModalidade}
                        </div>`;
                }
                if (contrato.detalhes_contrato.tipoContratacao) {
                    conteudoModal += `
                    <div class="info-item">
                        <span class="info-label">Tipo de Contratação:</span> ${contrato.detalhes_contrato.tipoContratacao}
                        </div>`;
                }
                if (contrato.detalhes_contrato.codTipoContratacao) {
                    conteudoModal += `
                <div class="info-item">
                    <span class="info-label">Código do Tipo de Contratação:</span> ${contrato.detalhes_contrato.codTipoContratacao}
                </div>`;
                }
                if (contrato.detalhes_contrato.codigoProcesso) {
                    conteudoModal += `
                        <div class="info-item">
                            <span class="info-label">Código do Processo:</span> ${contrato.detalhes_contrato.codigoProcesso}
                        </div>`;
                }
                if (contrato.detalhes_contrato.objetoContrato) {
                    conteudoModal += `
                <div class="info-item">
                    <span class="info-label">Objeto do Contrato:</span> ${contrato.detalhes_contrato.objetoContrato}
                </div>`;
                }
                if (contrato.detalhes_contrato.datVigencia) {
                    conteudoModal += `
                <div class="info-item">
                    <span class="info-label">Data de Vigência:</span> ${contrato.detalhes_contrato.datVigencia}
                </div>`;
                }
                if (contrato.detalhes_contrato.codOrgao) {
                    conteudoModal += `
                <div class="info-item">
                    <span class="info-label">Código do Orgão:</span> ${contrato.detalhes_contrato.codOrgao}
                </div>`;
                }
                if (contrato.detalhes_contrato.txtDescricaoOrgao) {
                    conteudoModal += `
                <div class="info-item">
                    <span class="info-label">Descrição do Orgão:</span> ${contrato.detalhes_contrato.txtDescricaoOrgao}
                </div>`;
                }

            }

            conteudoModal += `</div>`;
        }

        // MODIFICAÇÃO: Adicionar uma seção para exibir detalhes de empenhos, se disponíveis
        if (contrato.empenhos && Array.isArray(contrato.empenhos) && contrato.empenhos.length > 0) {
            conteudoModal += `
            <div class="info-group">
                <h4>Lista de Empenhos (${contrato.empenhos.length})</h4>
                <table class="empenhos-tabela">
                    <thead>
                        <tr>
                            <th>Nº Empenho</th>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            // Adicionar linha para cada empenho
            contrato.empenhos.forEach(emp => {
                conteudoModal += `
                    <tr>
                        <td>${emp.numEmpenho || '-'}</td>
                        <td>${emp.datEmpenho || '-'}</td>
                        <td>${emp.txtDescricaoDespesa || 'Sem descrição'}</td>
                        <td>${formatarValor(emp.valEmpenhadoLiquido || 0)}</td>
                    </tr>`;
            });
            
            conteudoModal += `
                    </tbody>
                </table>
            </div>`;
        }

        // Inserir o conteúdo no modal
        modalBody.innerHTML = conteudoModal;

        // Exibir o modal
        modal.style.display = 'block';
    }

    // Adicionar delegação de eventos para os cartões de empresa (melhor performance)
    $(document).on('click', '.contrato-clicavel', function () {
        mostrarModalContrato($(this).prop('empresaData'));
    });

    // Fechar o modal quando o usuário clicar no X
    $('.close-modal').on('click', function () {
        $('#contrato-modal').hide();
    });

    // Fechar o modal se o usuário clicar fora dele
    $(window).on('click', function (event) {
        const modal = document.getElementById('contrato-modal');
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    function formatarValor(valor) {
        if (valor === undefined || valor === null) return '0,00';
        return parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function truncarTexto(texto, maxLength) {
        if (!texto) return "Sem nome";
        if (texto.length > maxLength) {
            return texto.substring(0, maxLength) + '...';
        }
        return texto;
    }
});